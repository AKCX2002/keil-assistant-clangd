// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AKCX2002

export interface SavedClangdArguments {
    previousArgs?: string[];
    ownedArgs: string[];
}

const compileCommandsFlag = /^--?compile-commands-dir(?:=|$)/;

export function isLegacyManagedCompileCommandsArg(arg: string): boolean {
    if (!compileCommandsFlag.test(arg)) { return false; }
    const directory = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : '';
    return /[\\/]workspaceStorage[\\/][^\\/]+[\\/]AKCX2002\.keil-assistant-clangd[\\/]clangd[\\/]?$/i.test(directory);
}

export function previousClangdArguments(workspaceValue: string[] | undefined): string[] | undefined {
    if (!workspaceValue) { return undefined; }
    const previous = workspaceValue.filter(arg => !isLegacyManagedCompileCommandsArg(arg));
    return previous.length ? previous : undefined;
}

export function planClangdArguments(
    current: string[],
    workspaceValue: string[] | undefined,
    flag: string,
    saved?: SavedClangdArguments
): string[] {
    if (saved && JSON.stringify(current) !== JSON.stringify(saved.ownedArgs)) {
        throw new Error('clangd.arguments changed externally. Switch to cpptools/none, then enable clangd again to adopt the new settings.');
    }
    const conflicting = current.filter(arg => compileCommandsFlag.test(arg) && arg !== flag);
    if (!saved && conflicting.length) {
        const explicitWorkspaceConflict = (workspaceValue || []).some(arg =>
            compileCommandsFlag.test(arg) && arg !== flag && !isLegacyManagedCompileCommandsArg(arg));
        if (explicitWorkspaceConflict) {
            throw new Error('Existing workspace clangd compile-commands-dir conflicts. Remove it explicitly before enabling this backend.');
        }
    }
    const ownedArgs = current.filter(arg => !compileCommandsFlag.test(arg) || arg === flag);
    return ownedArgs.includes(flag) ? ownedArgs : [...ownedArgs, flag];
}
