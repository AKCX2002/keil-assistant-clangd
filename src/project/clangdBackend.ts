// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AKCX2002
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CompileCommand, CompilationResult, createCompileCommands, detectArmCompiler, mergeCompilationDatabases } from './compileCommands';
import { armVersionMacros, findDevicePack } from './armToolchain';
import { prepareAc5Overlay } from './ac5Overlay';

export type LanguageService = 'cpptools' | 'clangd' | 'none';
export function languageService(): LanguageService {
    return vscode.workspace.getConfiguration('KeilAssistant').get<LanguageService>('LanguageService', 'cpptools');
}

export interface ClangdProject {
    projectFile: string;
    targetName: string;
    target: any;
}

export async function generateProjectDatabase(project: ClangdProject): Promise<CompilationResult> {
    const config = vscode.workspace.getConfiguration('KeilAssistant', vscode.Uri.file(project.projectFile));
    const compilerKind = detectArmCompiler(project.target);
    const uv4 = config.get<string>('MDK.Uv4Path', '');
    const configuredCompiler = config.get<string>('Clangd.CompilerPath', '');
    if (configuredCompiler && !fs.existsSync(configuredCompiler)) { throw new Error('Configured compiler does not exist: ' + configuredCompiler); }
    const detectedCompiler = uv4 ? path.join(path.dirname(path.dirname(uv4)), 'ARM', 'ARMCLANG', 'bin', 'armclang.exe') : '';
    const compiler = configuredCompiler || (compilerKind === 'armclang' && fs.existsSync(detectedCompiler) ? detectedCompiler : 'clang');
    const includes = config.get<string[]>('Clangd.SystemIncludes', []).map(item => path.resolve(path.dirname(project.projectFile), item));
    if (uv4 && !configuredCompiler) {
        const include = path.join(path.dirname(path.dirname(uv4)), 'ARM', compilerKind === 'armclang' ? 'ARMCLANG' : 'ARMCC', 'include');
        if (fs.existsSync(include)) {
            if (fs.existsSync(path.join(include, 'libcxx'))) { includes.push(path.join(include, 'libcxx')); }
            includes.push(include);
        }
    }
    // An explicitly selected compiler installation owns its own headers.
    if (configuredCompiler && fs.existsSync(configuredCompiler)) {
        const include = path.join(path.dirname(path.dirname(configuredCompiler)), 'include');
        if (fs.existsSync(include)) {
            includes.unshift(include);
            if (fs.existsSync(path.join(include, 'libcxx'))) { includes.unshift(path.join(include, 'libcxx')); }
        }
    }
    const common = project.target.TargetOption?.TargetCommonOption || {};
    const devicePack = findDevicePack(String(common.PackID || ''), uv4, config.get<string>('Clangd.PackRoot', ''));
    if (devicePack && /^\$\$Device:[^$]+\$/.test(String(common.RegisterFile || ''))) {
        const header = String(common.RegisterFile).replace(/^\$\$Device:[^$]+\$/, devicePack + path.sep).replace(/[\\/]/g, path.sep);
        if (fs.existsSync(header)) { includes.push(path.dirname(header)); }
    }
    const rte = path.join(path.dirname(project.projectFile), 'RTE');
    if (fs.existsSync(path.join(rte, 'RTE_Components.h'))) { includes.push(rte); }
    const rteTarget = path.join(rte, '_' + project.targetName);
    if (fs.existsSync(path.join(rteTarget, 'RTE_Components.h'))) { includes.push(rteTarget); }
    const result = createCompileCommands(project.target, {
        projectFile: project.projectFile, compiler, systemIncludes: includes, devicePack,
        extraArgs: config.get<string[]>('Clangd.ExtraArgs', []),
        cStandard: config.get<string>('Clangd.CStandard', 'auto'),
        cppStandard: config.get<string>('Clangd.CppStandard', 'auto')
    });
    if (compilerKind === 'armclang') {
        try {
            const explicitArgs = config.get<string[]>('Clangd.ExtraArgs', []);
            for (const entry of result.entries) {
                const lang = entry.arguments[entry.arguments.indexOf('-x') + 1] === 'c++' ? 'c++' : 'c';
                const macros = await armVersionMacros(compiler, lang);
                if (macros.length) {
                    entry.arguments = entry.arguments.filter(arg => !/^-D(__ARMCC_VERSION|__ARMCOMPILER_VERSION|__ARMCOMPILER_LIBCXX)=/.test(arg) || explicitArgs.includes(arg));
                    entry.arguments.splice(1, 0, ...macros);
                    result.warnings = result.warnings.filter(warning => !warning.startsWith('Compiler version macro unavailable'));
                }
            }
        } catch (error) { result.warnings.push('Could not query ArmClang version macros; project pCCUsed retained: ' + String(error)); }
    }
    if (common.PackID && !devicePack) { result.warnings.push('Configured device Pack not found: ' + common.PackID + '; set Clangd.PackRoot/SystemIncludes.'); }
    if (!includes.length) { result.warnings.push('No toolchain/RTE system includes found; configure MDK.Uv4Path or Clangd.SystemIncludes.'); }
    if (compiler === 'clang') { result.warnings.push('Using clang virtual driver; verify toolchain-specific headers and macros.'); }
    return result;
}

interface SavedSettings {
    previousArgs?: string[];
    previousEngine?: string;
    ownedArgs: string[];
    ownedEngine?: boolean;
}

// All writes are confined to extension storage and explicit workspace settings.
// No user .clangd or compile_commands.json is overwritten.
export class ClangdBackend implements vscode.Disposable {
    private readonly output = vscode.window.createOutputChannel('Keil Assistant clangd');
    private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    private readonly settingsKey = 'clangd.workspaceSettings.v1';
    private timer?: NodeJS.Timeout;
    private chain: Promise<void> = Promise.resolve();
    private disposed = false;
    private getProjects?: () => ClangdProject[];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.status.command = 'keilClangd.showStatus';
        this.status.text = '$(symbol-method) Keil clangd';
        context.subscriptions.push(vscode.commands.registerCommand('keilClangd.showStatus', () => this.output.show()));
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{c,h,cc,cpp,cxx,hpp,hxx}');
        const refreshOverlay = () => {
            if (languageService() === 'clangd' && this.getProjects) { this.schedule(this.getProjects); }
        };
        context.subscriptions.push(watcher, watcher.onDidChange(refreshOverlay),
            watcher.onDidCreate(refreshOverlay), watcher.onDidDelete(refreshOverlay));
    }

    schedule(getProjects: () => ClangdProject[]): void {
        if (this.disposed) { return; }
        this.getProjects = getProjects;
        if (this.timer) { clearTimeout(this.timer); }
        this.timer = setTimeout(() => {
            this.chain = this.chain.then(() => this.sync(getProjects())).catch(error => {
                this.output.appendLine('ERROR: ' + String(error));
                this.status.text = '$(warning) Keil clangd: stale';
                this.status.tooltip = String(error) + '\nPrevious database retained. Click for details.';
                this.status.show();
                void vscode.window.showWarningMessage('Keil clangd configuration is stale: ' + String(error));
            });
        }, 200);
    }

    private async restoreSettings(): Promise<void> {
        const saved = this.context.workspaceState.get<SavedSettings>(this.settingsKey);
        if (!saved) { return; }
        const clangd = vscode.workspace.getConfiguration('clangd');
        if (JSON.stringify(clangd.inspect<string[]>('arguments')?.workspaceValue) === JSON.stringify(saved.ownedArgs)) {
            await clangd.update('arguments', saved.previousArgs, vscode.ConfigurationTarget.Workspace);
        }
        const cpp = vscode.workspace.getConfiguration('C_Cpp');
        if (saved.ownedEngine && vscode.extensions.getExtension('ms-vscode.cpptools') && cpp.inspect<string>('intelliSenseEngine')?.workspaceValue === 'disabled') {
            await cpp.update('intelliSenseEngine', saved.previousEngine, vscode.ConfigurationTarget.Workspace);
        }
        await this.context.workspaceState.update(this.settingsKey, undefined);
    }

    private async connect(directory: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('clangd');
        const current = config.get<string[]>('arguments', []);
        const flag = '--compile-commands-dir=' + directory;
        const saved = this.context.workspaceState.get<SavedSettings>(this.settingsKey);
        if (current.some(arg => /^--?compile-commands-dir(?:=|$)/.test(arg) && arg !== flag)) {
            throw new Error('Existing clangd compile-commands-dir conflicts. Remove it explicitly before enabling this backend.');
        }
        if (saved && JSON.stringify(current) !== JSON.stringify(saved.ownedArgs)) {
            throw new Error('clangd.arguments changed externally. Switch to cpptools/none, then enable clangd again to adopt the new settings.');
        }
        const ownedArgs = current.includes(flag) ? current : [...current, flag];
        if (!saved) {
            await this.context.workspaceState.update(this.settingsKey, {
                previousArgs: config.inspect<string[]>('arguments')?.workspaceValue,
                previousEngine: vscode.workspace.getConfiguration('C_Cpp').inspect<string>('intelliSenseEngine')?.workspaceValue,
                ownedArgs, ownedEngine: !!vscode.extensions.getExtension('ms-vscode.cpptools')
            } as SavedSettings);
        }
        if (JSON.stringify(current) !== JSON.stringify(ownedArgs)) {
            await config.update('arguments', ownedArgs, vscode.ConfigurationTarget.Workspace);
        }
        const cpp = vscode.workspace.getConfiguration('C_Cpp');
        if (vscode.extensions.getExtension('ms-vscode.cpptools') && cpp.get('intelliSenseEngine') !== 'disabled') {
            await cpp.update('intelliSenseEngine', 'disabled', vscode.ConfigurationTarget.Workspace);
        }
    }

    private async sync(projects: ClangdProject[]): Promise<void> {
        if (this.disposed) { return; }
        if (languageService() !== 'clangd' || projects.length === 0) {
            await this.restoreSettings();
            this.status.hide();
            return;
        }
        if (!vscode.workspace.isTrusted) { throw new Error('Workspace trust is required.'); }
        if (!this.context.storageUri) { throw new Error('Open a workspace folder before enabling clangd.'); }
        this.output.clear();
        const directory = path.join(this.context.storageUri.fsPath, 'clangd');
        const databases: CompileCommand[][] = [];
        let warningCount = 0;
        for (const project of projects) {
            const result = await generateProjectDatabase(project);
            if (result.toolchain === 'armcc') {
                const adapted = prepareAc5Overlay(result.entries, path.join(directory, 'ac5'));
                if (adapted.length) {
                    result.warnings.push('AC5 packed declarations adapted in saved-file VFS snapshots (original files and byte offsets retained): ' + adapted.join(', '));
                    result.warnings.push('Packed snapshots cover literal includes. Open editor buffers take precedence over VFS and use an editor-only empty __packed fallback: declarations remain parseable, but packed layout is not represented until clangd reads the saved-file snapshot.');
                }
            }
            this.output.appendLine(`${project.projectFile} :: ${project.targetName} [${result.toolchain}] (${result.entries.length} sources)`);
            for (const warning of result.warnings) { this.output.appendLine('  WARNING: ' + warning); warningCount++; }
            databases.push(result.entries);
        }
        const entries = mergeCompilationDatabases(databases);
        if (databases.reduce((sum, database) => sum + database.length, 0) > entries.length) {
            this.output.appendLine('Shared sources: active project takes precedence.');
        }
        const file = path.join(directory, 'compile_commands.json');
        const content = JSON.stringify(entries, null, 2) + '\n';
        fs.mkdirSync(directory, { recursive: true });
        const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content;
        if (changed) {
            fs.writeFileSync(file + '.tmp', content, 'utf8');
            fs.renameSync(file + '.tmp', file);
        }
        this.output.appendLine('Database: ' + file);
        this.output.appendLine('Existing .clangd/user config is preserved and can override these commands.');
        await this.connect(directory);
        const extension = vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd');
        if (!extension) {
            this.output.appendLine('Install the official clangd extension (llvm-vs-code-extensions.vscode-clangd).');
            warningCount++;
        } else if (changed) {
            await extension.activate();
            const commands = await vscode.commands.getCommands(true);
            if (commands.includes('clangd.restart')) { await vscode.commands.executeCommand('clangd.restart'); }
        }
        this.status.text = `$(symbol-method) Keil clangd: ${entries.length}${warningCount ? ' ⚠' : ''}`;
        this.status.tooltip = `${warningCount} configuration warnings. Click to inspect database location and details.`;
        this.status.show();
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer) { clearTimeout(this.timer); }
        this.status.dispose();
        this.output.dispose();
    }
}
