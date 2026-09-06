// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AKCX2002
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);
const macroCache = new Map<string, Promise<string[]>>();

// Query only the vendor identity needed by Arm headers. Clangd must retain its
// own Clang version, feature macros and built-in definitions.
export function armVersionMacros(compiler: string, language: 'c' | 'c++' = 'c'): Promise<string[]> {
    if (!fs.existsSync(compiler) || !/^armclang(?:\.exe)?$/i.test(path.basename(compiler))) { return Promise.resolve([]); }
    const key = compiler + ':' + fs.statSync(compiler).mtimeMs + ':' + language;
    let result = macroCache.get(key);
    if (!result) {
        result = (async () => {
            // NUL is the native Windows empty input device, not a shell redirection.
            const { stdout } = await run(compiler, ['--target=arm-arm-none-eabi', '-mcpu=cortex-m0', '-E', '-dM', '-x', language, process.platform === 'win32' ? 'NUL' : '/dev/null'],
                { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
            return stdout.split(/\r?\n/).map(line => {
                const match = /^#define (__ARMCOMPILER_VERSION|__ARMCC_VERSION|__ARMCOMPILER_LIBCXX)\s+(\d+)\s*$/.exec(line);
                return match ? '-D' + match[1] + '=' + match[2] : undefined;
            }).filter((arg): arg is string => arg !== undefined);
        })();
        macroCache.set(key, result);
        result.catch(() => macroCache.delete(key));
    }
    return result;
}

export function findDevicePack(packId: string, uv4: string, configuredRoot?: string): string | undefined {
    const [vendor, name, ...version] = packId.split('.');
    if (!vendor || !name || !version.length || /[\\/]/.test(packId)) { return undefined; }
    const roots = [configuredRoot, process.env.CMSIS_PACK_ROOT,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Arm', 'Packs') : undefined,
        uv4 ? path.join(path.dirname(path.dirname(uv4)), 'ARM', 'PACK') : undefined];
    return roots.filter((root): root is string => !!root)
        .map(root => path.join(root, vendor, name, version.join('.'))).find(candidate => fs.existsSync(candidate));
}
