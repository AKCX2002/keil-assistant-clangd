// SPDX-License-Identifier: Apache-2.0
// Portions adapted from huiyi-li/keil2clangd, Keil2Json.py (5281918).
// Modified by AKCX2002: TypeScript port, per-file filtering, parameter handling,
// explicit toolchain selection, diagnostics and Windows argument arrays.
// See THIRD_PARTY_NOTICES.md and LICENSES/Apache-2.0.txt.
import * as path from 'path';

export interface CompileCommand {
    directory: string;
    file: string;
    arguments: string[];
}

export interface CompileOptions {
    projectFile: string;
    compiler: string;
    systemIncludes?: string[];
    extraArgs?: string[];
    cStandard?: string;
    cppStandard?: string;
    devicePack?: string;
}

export interface CompilationResult {
    entries: CompileCommand[];
    warnings: string[];
    toolchain: 'armcc' | 'armclang';
}

// xml2js uses scalar values for single children and arrays for repeated children.
function list<T>(value: T | T[] | undefined): T[] {
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function detectArmCompiler(target: any): 'armcc' | 'armclang' {
    return Number(target.uAC6) > 0 || /armclang|ac6|::V6\./i.test(String(target.pCCUsed || ''))
        ? 'armclang' : 'armcc';
}

// Keep quotes in macro values: NAME="hello world" is a single -D argument.
export function splitDefines(value: string): string[] {
    const result: string[] = [];
    let current = '', quote = '', depth = 0;
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if ((char === '"' || char === "'") && (i === 0 || value[i - 1] !== '\\')) {
            quote = quote === char ? '' : quote || char;
        }
        if (!quote) {
            if (char === '(') { depth++; }
            if (char === ')') { depth--; }
            if ((char === ',' || /\s/.test(char)) && depth === 0) {
                if (current) { result.push(current); current = ''; }
                continue;
            }
        }
        current += char;
    }
    if (quote || depth !== 0) { throw new Error('Unbalanced quotes/parentheses in Define: ' + value); }
    if (current) { result.push(current); }
    return result;
}

// Keil misc controls use Windows paths; do not treat every backslash as an escape.
export function splitArguments(value: string): string[] {
    const result: string[] = [];
    let current = '', quoted = false;
    for (const char of value) {
        if (char === '"') { quoted = !quoted; continue; }
        if (/\s/.test(char) && !quoted) {
            if (current) { result.push(current); current = ''; }
        } else { current += char; }
    }
    if (quoted) { throw new Error('Unbalanced quotes in MiscControls'); }
    if (current) { result.push(current); }
    return result;
}

export function resolveProjectPath(projectFile: string, value: string, devicePack?: string): string {
    let clean = value.trim().replace(/^"(.*)"$/, '$1').replace(/[\\/]/g, path.sep);
    if (devicePack) { clean = clean.replace(/^\$\$Device:[^$]+\$/, devicePack + path.sep); }
    if (/\$/.test(clean)) { throw new Error('Unresolved Keil path variable: ' + value); }
    return path.resolve(path.dirname(projectFile), clean);
}

function controls(node: any): any {
    return node?.Cads || node?.FileArmAds?.Cads || node?.GroupArmAds?.Cads || {};
}

function effectiveValue(layers: any[], key: string): string {
    let value = '';
    for (const layer of layers) {
        // Numeric 2 means inherit for boolean controls; language selectors are handled separately.
        const candidate = layer[key];
        if (candidate !== undefined && candidate !== '' && candidate !== '2') { value = String(candidate); }
    }
    return value;
}

export function createCompileCommands(target: any, options: CompileOptions): CompilationResult {
    const toolchain = detectArmCompiler(target);
    const warnings = new Set<string>();
    const entries: CompileCommand[] = [];
    const arm = target.TargetOption?.TargetArmAds;
    if (!arm) { throw new Error('clangd backend supports ARM projects only; use cpptools for C51/C251.'); }
    const common = target.TargetOption?.TargetCommonOption || {};
    const cpu = /CPUTYPE\("([^"]+)"\)/i.exec(String(common.Cpu || ''))?.[1]
        || String(arm.ArmAdsMisc?.AdsCpuType || '').replace(/"/g, '');
    const base = ['--target=arm-arm-none-eabi'];
    if (cpu) {
        base.push('-mcpu=' + cpu.toLowerCase().replace('cortex-m0+', 'cortex-m0plus'));
        if (/^cortex-m/i.test(cpu)) { base.push('-mthumb'); }
    } else if (!(options.extraArgs || []).some(arg => /^-m(cpu|arch)=/.test(arg))) {
        throw new Error('Cannot determine CPU; set KeilAssistant.Clangd.ExtraArgs with -mcpu=<actual-cpu>.');
    }
    if (arm.ArmAdsMisc?.BigEnd === '1') { base.push('-mbig-endian'); }
    if (toolchain === 'armcc') {
        warnings.add('AC5 approximation: legacy embedded assembly, pragmas and compiler intrinsics are not fully supported.');
        // Preserve useful declaration semantics. Do not erase __packed or built-in functions.
        base.push('-fdeclspec', '-include', 'arm_acle.h', '-D__ARM_NO_DEPRECATED_FUNCTIONS=1',
            '-D__align(x)=__attribute__((aligned(x)))',
            '-D__weak=__attribute__((weak))', '-D__forceinline=inline __attribute__((always_inline))');
        warnings.add('AC5 deprecated register-return runtime functions are unavailable to clangd (__ARM_NO_DEPRECATED_FUNCTIONS=1); calls remain unsupported.');
    }
    const compilerVersion = /^(\d+)::/.exec(String(target.pCCUsed || ''))?.[1];
    if (compilerVersion) {
        base.push('-D__ARMCC_VERSION=' + compilerVersion);
        if (toolchain === 'armclang') { base.push('-D__ARMCOMPILER_VERSION=' + compilerVersion); }
    } else {
        warnings.add('Compiler version macro unavailable in pCCUsed; toolchain headers may require an explicit version in ExtraArgs.');
    }
    if (arm.ArmAdsMisc?.useUlib === '1') { base.push('-D__MICROLIB=1'); }
    const fpuMode = String(arm.ArmAdsMisc?.RvdsVP || '0');
    if (/^cortex-m4$/i.test(cpu)) {
        // uVision 5.43 response-file verified: 0 = device default, 1 = none, 2 = single.
        const enabled = fpuMode === '2' || (fpuMode === '0' && /FPU/.test(String(common.Cpu || '')));
        if (['0', '1', '2'].includes(fpuMode)) {
            base.push(enabled ? '-mfpu=fpv4-sp-d16' : '-mfpu=none', enabled ? '-mfloat-abi=hard' : '-mfloat-abi=soft');
        } else { warnings.add('Unmapped RvdsVP=' + fpuMode + '; specify verified -mfpu and -mfloat-abi in ExtraArgs.'); }
    } else if (/^cortex-m(0|0\+|0plus|1|3|23)$/i.test(cpu)) {
        base.push('-mfpu=none', '-mfloat-abi=soft');
    } else if (/FPU/.test(String(common.Cpu || ''))) {
        warnings.add('Verify FPU selection for this CPU; specify -mfpu and -mfloat-abi from the Keil command in ExtraArgs.');
    }

    for (const group of list<any>(target.Groups?.Group)) {
        if (group.GroupOption?.CommonProperty?.IncludeInBuild === '0') { continue; }
        const files: any[] = ([] as any[]).concat(...list<any>(group.Files).map(container => list<any>(container?.File)));
        for (const file of files) {
            if (file.FileOption?.CommonProperty?.IncludeInBuild === '0') { continue; }
            if (file.FileType && !['1', '8'].includes(String(file.FileType))) { continue; }
            const rawPath = String(file.FilePath || '');
            if (!/\.(c|cc|cpp|cxx)$/i.test(rawPath)) { continue; }
            const source = resolveProjectPath(options.projectFile, rawPath, options.devicePack);
            const layers = [arm.Cads || {}, controls(group.GroupOption), controls(file.FileOption)];
            const propertyLayers = [target.TargetOption.CommonProperty || {}, group.GroupOption?.CommonProperty || {}, file.FileOption?.CommonProperty || {}];
            const isCpp = file.FileType === '8' || !/\.c$/i.test(rawPath) || effectiveValue(propertyLayers, 'UseCPPCompiler') === '1';
            const args = [...base, '-x', isCpp ? 'c++' : 'c'];
            for (const include of options.systemIncludes || []) {
                if (isCpp || !/[\\/]libcxx[\\/]?$/.test(include)) { args.push('-isystem', include); }
            }
            const standard = isCpp ? options.cppStandard : options.cStandard;
            if (standard && standard !== 'auto') { args.push('-std=' + standard); }
            else if (toolchain === 'armcc') {
                args.push(isCpp ? '-std=c++03' : effectiveValue(layers, 'uC99') === '1' ? '-std=c99' : '-std=c90');
            } else {
                // Verified against actual uVision 5.43/AC6 6.24 generated response files.
                const key = isCpp ? 'v6LangP' : 'v6Lang';
                let selection = '0';
                for (const layer of layers) {
                    if (layer[key] !== undefined && layer[key] !== '0' && layer[key] !== '') { selection = String(layer[key]); }
                }
                const standards = isCpp ? ['gnu++14', 'c++98', 'gnu++98', 'c++11', 'gnu++11', 'c++03', 'c++14', 'gnu++14', 'c++17', 'gnu++17']
                    : ['gnu11', 'c90', 'gnu90', 'c99', 'gnu99', 'c11', 'gnu11'];
                if (!standards[Number(selection)]) { throw new Error(`Unknown ${key}=${selection}; set an explicit ${isCpp ? 'CppStandard' : 'CStandard'}.`); }
                args.push('-std=' + standards[Number(selection)]);
            }
            args.push(effectiveValue(layers, 'PlainCh') === '1' ? '-fsigned-char' : '-funsigned-char');
            if (toolchain === 'armcc') {
                if (effectiveValue(layers, 'EnumInt') !== '1') { args.push('-fshort-enums'); }
                args.push('-fshort-wchar');
            } else {
                if (effectiveValue(layers, 'vShortEn') === '1') { args.push('-fshort-enums'); }
                if (effectiveValue(layers, 'vShortWch') === '1') { args.push('-fshort-wchar'); }
                if (isCpp) {
                    // uVision AC6 defaults: exceptions disabled; RTTI follows the project checkbox.
                    args.push('-fno-exceptions');
                    if (effectiveValue(layers, 'v6Rtti') !== '1') { args.push('-fno-rtti'); }
                }
            }
            // Keil searches file includes before group includes before target includes.
            for (const layer of [...layers].reverse()) {
                for (const item of String(layer.VariousControls?.IncludePath || '').split(';').filter(item => item.trim())) {
                    args.push('-I', resolveProjectPath(options.projectFile, item, options.devicePack));
                }
            }
            for (const layer of layers) {
                const vc = layer.VariousControls || {};
                for (const define of splitDefines(String(vc.Define || ''))) { args.push('-D' + define); }
                for (const undefine of splitDefines(String(vc.Undefine || ''))) { args.push('-U' + undefine); }
                if (vc.MiscControls) {
                    const misc = splitArguments(String(vc.MiscControls));
                    // Accept Clang parse flags; expose everything else instead of pretending fidelity.
                    for (let i = 0; i < misc.length; i++) {
                        const flag = misc[i];
                        if (['-include', '--preinclude', '-I', '-isystem'].includes(flag)) {
                            if (!misc[i + 1]) { throw new Error('Missing argument for ' + flag); }
                            args.push(flag === '--preinclude' ? '-include' : flag, resolveProjectPath(options.projectFile, misc[++i]));
                        } else if (/^(--target=|-m(cpu|arch|fpu|float-abi)=|-std=|-D|-U|-f(short-enums|short-wchar|unsigned-char|signed-char|(no-)?rtti|(no-)?exceptions)$|-mthumb$|-marm$)/.test(flag)) {
                            args.push(flag);
                        } else {
                            warnings.add('Unmapped MiscControls option: ' + flag + ' (use ExtraArgs for a verified Clang equivalent).');
                        }
                    }
                }
            }
            if (toolchain === 'armcc') {
                // Clang cannot parse the ARMCC embedded-assembler CMSIS branch.
                // Apply after project defines, including explicit __CC_ARM entries.
                args.push('-U__CC_ARM');
                warnings.add('AC5 editor parsing uses the GCC/Clang CMSIS branch (__CC_ARM undefined); Keil build commands are unchanged.');
            }
            args.push(...options.extraArgs || []);
            entries.push({ directory: path.dirname(options.projectFile), file: source,
                arguments: [options.compiler, ...args, '-c', source] });
        }
    }
    if (!entries.length) { throw new Error('Active Target contains no enabled C/C++ sources.'); }
    return { entries, warnings: Array.from(warnings), toolchain };
}

export function mergeCompilationDatabases(results: CompileCommand[][]): CompileCommand[] {
    const entries = new Map<string, CompileCommand>();
    // Callers put the active project last, so shared files have deterministic ownership.
    for (const result of results) {
        for (const entry of result) {
            const key = process.platform === 'win32' ? path.normalize(entry.file).toLowerCase() : path.normalize(entry.file);
            entries.set(key, entry);
        }
    }
    return Array.from(entries.values());
}
