// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AKCX2002
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { CompileCommand } from './compileCommands';

function sourceTokens(input: string): { value: string; index: number }[] {
    // Skip comments and complete literals, including raw strings containing quotes.
    const pattern = /(?:u8|u|U|L)?R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|\/\*[\s\S]*?\*\/|\/\/(?:\\\r?\n|[^\r\n])*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_]\w*|[^\s]/g;
    const result: { value: string; index: number }[] = [];
    let token: RegExpExecArray | null;
    while ((token = pattern.exec(input))) {
        if (token[0].startsWith('/*') || token[0].startsWith('//')) { continue; }
        result.push({ value: token[0], index: token.index });
    }
    return result;
}

// Preserve byte offsets, line breaks and packing. A leading packed attribute
// on a typedef is ignored by Clang, so it must follow struct/union instead.
// __KAP is an editor-only reserved macro supplied by the compilation command.
export function adaptPackedRecords(input: string): string {
    const tokens = sourceTokens(input);
    const edits: { start: number; length: number; text: string }[] = [];
    for (let i = 0; i < tokens.length - 2; i++) {
        const packed = tokens[i], record = tokens[i + 1], next = tokens[i + 2];
        if (packed.value !== '__packed' || !['struct', 'union'].includes(record.value)) { continue; }
        // A qualifier on an existing record/pointer is not a record definition.
        if (next.value === '{' || (/^[A-Za-z_]\w*$/.test(next.value) && tokens[i + 3]?.value === '{')) {
            edits.push({ start: packed.index, length: 8, text: record.value.padEnd(8) },
                { start: record.index, length: record.value.length, text: '__KAP'.padEnd(record.value.length) });
        }
    }
    for (const edit of edits.reverse()) {
        input = input.slice(0, edit.start) + edit.text + input.slice(edit.start + edit.length);
    }
    return input;
}

function identity(file: string): string {
    return process.platform === 'win32' ? file.toLowerCase() : file;
}

function storeContent(directory: string, extension: string, content: string | Buffer): string {
    const name = createHash('sha256').update(content).digest('hex') + extension;
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) { fs.writeFileSync(file, content); }
    return file;
}

/** Follow literal includes using each command's search paths; never write source files. */
export function prepareAc5Overlay(entries: CompileCommand[], directory: string): string[] {
    const roots = new Map<string, { type: string; name: string; 'external-contents': string }>();
    const buffers = new Map<string, Buffer>();
    const visited = new Map<string, Set<string>>();
    fs.mkdirSync(directory, { recursive: true });
    for (const entry of entries) {
        const quoteIncludes: string[] = [], includes: string[] = [], systemIncludes: string[] = [];
        const forced: string[] = [];
        for (let i = 1; i < entry.arguments.length; i++) {
            const arg = entry.arguments[i];
            if (['-I', '-isystem', '-iquote'].includes(arg)) {
                const destination = arg === '-iquote' ? quoteIncludes : arg === '-isystem' ? systemIncludes : includes;
                destination.push(path.resolve(entry.directory, entry.arguments[++i]));
            } else if (arg.startsWith('-I') && arg.length > 2) {
                includes.push(path.resolve(entry.directory, arg.slice(2)));
            } else if (arg === '-include') { forced.push(path.resolve(entry.directory, entry.arguments[++i])); }
        }
        // Clang searches -I before -isystem regardless of their command-line order.
        const angleIncludes = [...includes, ...systemIncludes];
        const searchKey = JSON.stringify([quoteIncludes.map(identity), angleIncludes.map(identity)]);
        let seen = visited.get(searchKey);
        if (!seen) { seen = new Set<string>(); visited.set(searchKey, seen); }
        const pending = [entry.file, ...forced];
        while (pending.length) {
            const file = pending.pop() as string;
            const key = identity(file);
            if (seen.has(key) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { continue; }
            seen.add(key);
            let bytes = buffers.get(key);
            if (!bytes) { bytes = fs.readFileSync(file); buffers.set(key, bytes); }
            // Latin1 provides a one-byte round trip even for legacy source encodings.
            const source = bytes.toString('latin1');
            const adapted = adaptPackedRecords(source);
            if (adapted !== source && !roots.has(key)) {
                roots.set(key, { type: 'file', name: file,
                    'external-contents': storeContent(directory, path.extname(file), Buffer.from(adapted, 'latin1')) });
            }
            const includePattern = /^\s*#\s*include\s*(["<])([^">\r\n]+)[">]/gm;
            // Use decoded UTF-8 for include filenames without re-encoding snapshots.
            const decoded = bytes.toString('utf8');
            const includeSource = Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : source;
            let match: RegExpExecArray | null;
            while ((match = includePattern.exec(includeSource))) {
                const name = match[2].replace(/[\\/]/g, path.sep);
                const search = match[1] === '"' ? [path.dirname(file), ...quoteIncludes, ...angleIncludes] : angleIncludes;
                const included = search.map(dir => path.resolve(dir, name)).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
                if (included) { pending.push(included); }
            }
        }
    }
    if (!roots.size) { return []; }
    const overlay = storeContent(directory, '.json', JSON.stringify({ version: 0,
        'case-sensitive': process.platform !== 'win32', 'use-external-names': false,
        roots: Array.from(roots.values()).sort((a, b) => a.name.localeCompare(b.name)) }));
    for (const entry of entries) {
        // clangd drafts (open editor buffers) take precedence over a VFS file.
        // Keep those drafts parseable; saved-file reads still use the transformed
        // snapshot below and therefore retain the supported packed layout.
        entry.arguments.splice(1, 0, '-D__packed=', '-D__KAP=__attribute__((packed))', '-ivfsoverlay', overlay);
    }
    return Array.from(roots.values()).map(root => root.name);
}
