// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AKCX2002
import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, modify, parse, ParseError, printParseErrorCode } from 'jsonc-parser';

export type KeilTaskAction = 'build' | 'rebuild' | 'download';

export interface WorkspaceTargetDefinition {
    targetName: string;
    generatedDirectories: string[];
}

export interface WorkspaceProjectDefinition {
    projectFile: string;
    projectName: string;
    targets: WorkspaceTargetDefinition[];
}

export interface WorkspaceFileOptions {
    excludeDirectories: string[];
    generateTasks: boolean;
    taskActions: KeilTaskAction[];
}

export interface WorkspaceFileResult {
    changedFiles: string[];
    warnings: string[];
}

const formattingOptions = { insertSpaces: true, tabSize: 4 };

function parseJsonc(text: string, fileName: string): any {
    const errors: ParseError[] = [];
    const value = parse(text || '{}', errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length) {
        const error = errors[0];
        throw new Error(`${fileName} 不是有效的 JSONC：${printParseErrorCode(error.error)}，偏移 ${error.offset}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fileName} 的根节点必须是对象。`);
    }
    return value;
}

function updateJsonc(text: string, jsonPath: Array<string | number>, value: unknown): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return applyEdits(text, modify(text, jsonPath, value, { formattingOptions: { ...formattingOptions, eol } }));
}

function finishJsonc(text: string): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return text.endsWith('\n') ? text : text + eol;
}

function normalizeRelativeDirectory(projectDirectory: string, candidate: string): string | undefined {
    const trimmed = candidate.trim();
    if (!trimmed || /[$%*?{}]/.test(trimmed)) {
        return undefined;
    }

    const absolute = path.resolve(projectDirectory, trimmed.replace(/[\\/]+/g, path.sep));
    const relative = path.relative(projectDirectory, absolute);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        return undefined;
    }
    return relative.split(path.sep).join('/').replace(/\/$/, '');
}

export function collectExcludeDirectories(project: WorkspaceProjectDefinition, configured: string[]): string[] {
    const projectDirectory = path.dirname(project.projectFile);
    const candidates = configured.concat(project.targets.flatMap(target => target.generatedDirectories));
    const normalized = candidates
        .map(candidate => normalizeRelativeDirectory(projectDirectory, candidate))
        .filter((candidate): candidate is string => !!candidate);
    return Array.from(new Set(normalized)).sort((left, right) => left.localeCompare(right));
}

export function mergeSettingsJson(text: string, directories: string[], fileName = 'settings.json'): string {
    let next = text.trim() ? text : '{}';
    let root = parseJsonc(next, fileName);
    const maps: Array<{ key: string; suffix: string }> = [
        { key: 'files.exclude', suffix: '' },
        { key: 'search.exclude', suffix: '' },
        { key: 'files.watcherExclude', suffix: '/**' }
    ];

    for (const map of maps) {
        const current = root[map.key];
        if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) {
            throw new Error(`${fileName} 中的 ${map.key} 必须是对象，插件未覆盖该值。`);
        }
        if (current === undefined) {
            next = updateJsonc(next, [map.key], {});
            root = parseJsonc(next, fileName);
        }
        for (const directory of directories) {
            const pattern = `**/${directory}${map.suffix}`;
            if (root[map.key][pattern] === undefined) {
                next = updateJsonc(next, [map.key, pattern], true);
                root = parseJsonc(next, fileName);
            }
        }
    }
    return finishJsonc(next);
}

function actionTitle(action: KeilTaskAction): string {
    switch (action) {
        case 'build': return 'Build';
        case 'rebuild': return 'Rebuild';
        case 'download': return 'Download';
    }
}

function projectTaskFile(project: WorkspaceProjectDefinition): string {
    return '${workspaceFolder}/' + path.basename(project.projectFile);
}

function desiredTasks(project: WorkspaceProjectDefinition, actions: KeilTaskAction[]): any[] {
    const projectFile = projectTaskFile(project);
    const tasks: any[] = [];
    for (const target of project.targets) {
        for (const action of actions) {
            const task: any = {
                label: `Keil: ${actionTitle(action)} ${project.projectName} / ${target.targetName}`,
                type: 'keil-task',
                projectFile,
                targetName: target.targetName,
                action,
                keilAssistantManaged: true,
                problemMatcher: []
            };
            if (action === 'build') {
                task.group = 'build';
            }
            tasks.push(task);
        }
    }
    return tasks;
}

export function mergeTasksJson(
    text: string,
    project: WorkspaceProjectDefinition,
    actions: KeilTaskAction[],
    generateTasks: boolean,
    fileName = 'tasks.json'
): string {
    let next = text.trim() ? text : '{}';
    const root = parseJsonc(next, fileName);
    const currentTasks = root.tasks;
    if (currentTasks !== undefined && !Array.isArray(currentTasks)) {
        throw new Error(`${fileName} 中的 tasks 必须是数组，插件未覆盖该值。`);
    }
    const tasks = currentTasks || [];
    const ownedProjectFile = projectTaskFile(project).toLowerCase();
    const managedIndexes = tasks
        .map((task: any, index: number) => task
            && task.type === 'keil-task'
            && task.keilAssistantManaged === true
            && String(task.projectFile || '').replace(/\\/g, '/').toLowerCase() === ownedProjectFile
            ? index : -1)
        .filter((index: number) => index !== -1);
    const desired = generateTasks ? desiredTasks(project, actions) : [];

    if (!generateTasks && managedIndexes.length === 0) {
        return text;
    }
    const managed = managedIndexes.map((index: number) => tasks[index]);
    if (generateTasks && JSON.stringify(managed) === JSON.stringify(desired)) {
        return text;
    }

    if (root.version === undefined) {
        next = updateJsonc(next, ['version'], '2.0.0');
    }
    if (currentTasks === undefined) {
        next = updateJsonc(next, ['tasks'], []);
    } else {
        for (const index of managedIndexes.reverse()) {
            next = updateJsonc(next, ['tasks', index], undefined);
        }
    }
    for (const task of desired) {
        next = updateJsonc(next, ['tasks', -1], task);
    }
    return finishJsonc(next);
}

function writeIfChanged(file: string, content: string): boolean {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) {
        return false;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, file);
    return true;
}

export function syncProjectWorkspaceFiles(
    project: WorkspaceProjectDefinition,
    options: WorkspaceFileOptions
): WorkspaceFileResult {
    const result: WorkspaceFileResult = { changedFiles: [], warnings: [] };
    const vscodeDirectory = path.join(path.dirname(project.projectFile), '.vscode');
    const settingsFile = path.join(vscodeDirectory, 'settings.json');
    const tasksFile = path.join(vscodeDirectory, 'tasks.json');

    try {
        const current = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '';
        const directories = collectExcludeDirectories(project, options.excludeDirectories);
        if (writeIfChanged(settingsFile, mergeSettingsJson(current, directories, settingsFile))) {
            result.changedFiles.push(settingsFile);
        }
    } catch (error) {
        result.warnings.push(error instanceof Error ? error.message : String(error));
    }

    try {
        const current = fs.existsSync(tasksFile) ? fs.readFileSync(tasksFile, 'utf8') : '';
        const next = mergeTasksJson(current, project, options.taskActions, options.generateTasks, tasksFile);
        if (options.generateTasks || fs.existsSync(tasksFile)) {
            if (writeIfChanged(tasksFile, next)) {
                result.changedFiles.push(tasksFile);
            }
        }
    } catch (error) {
        result.warnings.push(error instanceof Error ? error.message : String(error));
    }

    return result;
}

export function syncWorkspaceFolderSettings(workspaceFolder: string, directories: string[]): WorkspaceFileResult {
    const result: WorkspaceFileResult = { changedFiles: [], warnings: [] };
    const settingsFile = path.join(workspaceFolder, '.vscode', 'settings.json');
    try {
        const current = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '';
        if (writeIfChanged(settingsFile, mergeSettingsJson(current, directories, settingsFile))) {
            result.changedFiles.push(settingsFile);
        }
    } catch (error) {
        result.warnings.push(error instanceof Error ? error.message : String(error));
    }
    return result;
}
