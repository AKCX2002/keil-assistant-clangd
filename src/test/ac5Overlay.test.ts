import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { adaptPackedRecords, prepareAc5Overlay } from '../project/ac5Overlay';

describe('AC5 editor-only packed overlay', () => {
    it('preserves offsets and trivia while moving packing after the record keyword', () => {
        const input = 'typedef __packed /* layout */\r\nstruct { char a; int b; } X;\r\n__packed union { int a; char b; } Y;';
        const output = adaptPackedRecords(input);
        assert.ok(output.includes('struct   /* layout */\r\n__KAP '));
        assert.ok(output.includes('union    __KAP'));
        assert.equal(output.length, input.length);
        assert.equal(output.indexOf('{'), input.indexOf('{'));
        assert.equal(output.indexOf('\n'), input.indexOf('\n'));
        assert.equal(adaptPackedRecords(output), output);
    });

    it('does not rewrite comments, strings, longer identifiers or packed pointer qualifiers', () => {
        const input = '// __packed struct\n/* __packed union */\n"__packed struct";\n__packed int *p; __packed_struct x;\n'
            + '__packed struct Existing *ptr; typedef __packed union Existing Alias;\n'
            + 'R"tag(" __packed struct { int x; } ")tag";\n'
            + '// continued \\\n__packed struct { int x; };\n';
        assert.equal(adaptPackedRecords(input), input);
    });

    it('adapts named record definitions without changing their tag or following offsets', () => {
        const input = 'typedef __packed struct Record { char a; int b; } Record;';
        const output = adaptPackedRecords(input);
        assert.equal(output, 'typedef struct   __KAP  Record { char a; int b; } Record;');
        assert.equal(output.indexOf('Record'), input.indexOf('Record'));
    });

    it('uses Clang include precedence and supports UTF-8 include filenames', () => {
        const root = path.resolve('artifacts');
        fs.mkdirSync(root, { recursive: true });
        const dir = fs.mkdtempSync(path.join(root, 'ac5-search-'));
        try {
            const userDir = path.join(dir, 'user'), systemDir = path.join(dir, 'system'), quoteDir = path.join(dir, 'quote');
            for (const folder of [userDir, systemDir, quoteDir]) { fs.mkdirSync(folder); }
            for (const folder of [systemDir, quoteDir]) {
                fs.writeFileSync(path.join(folder, 'record.h'), 'struct Wrong { int x; };');
            }
            const userHeader = path.join(userDir, 'record.h'), unicodeHeader = path.join(userDir, '记录.h');
            fs.writeFileSync(userHeader, '#include "记录.h"');
            fs.writeFileSync(unicodeHeader, 'typedef __packed struct { int x; } Record;');
            const source = path.join(dir, 'main.c');
            fs.writeFileSync(source, '#include <record.h>');
            const entry = { directory: dir, file: source,
                arguments: ['clang', '-isystem', systemDir, '-iquote', quoteDir, '-I', userDir, '-c', source] };
            assert.deepEqual(prepareAc5Overlay([entry], path.join(dir, 'storage')), [unicodeHeader]);
            // A quoted include chooses -iquote before -I; the non-packed header wins.
            fs.writeFileSync(source, '#include "record.h"');
            assert.deepEqual(prepareAc5Overlay([{ ...entry, arguments: ['clang', '-iquote', quoteDir, '-I', userDir, '-c', source] }],
                path.join(dir, 'quoted-storage')), []);
        } finally {
            assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(root));
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('follows nested literal includes and refreshes snapshots without altering source bytes', () => {
        const root = path.resolve('artifacts');
        fs.mkdirSync(root, { recursive: true });
        const dir = fs.mkdtempSync(path.join(root, 'ac5-test-'));
        try {
            const source = path.join(dir, 'main.c');
            const header = path.join(dir, 'record.h');
            const nested = path.join(dir, 'nested.h');
            fs.writeFileSync(source, '#include "record.h"\n');
            fs.writeFileSync(header, '#include "nested.h"\n');
            const original = Buffer.from('/* \xff */ typedef __packed struct { char a; int b; } X;', 'latin1');
            fs.writeFileSync(nested, original);
            const entry = () => ({ directory: dir, file: source, arguments: ['clang', '-I', dir, '-c', source] });
            const first = entry();
            assert.deepEqual(prepareAc5Overlay([first], path.join(dir, 'storage')), [nested]);
            const overlay = first.arguments[first.arguments.indexOf('-ivfsoverlay') + 1];
            const vfs = JSON.parse(fs.readFileSync(overlay, 'utf8'));
            assert.equal(vfs['use-external-names'], false);
            assert.equal(vfs.roots[0].name, nested);
            assert.deepEqual(fs.readFileSync(nested), original);
            const bytes = fs.readFileSync(vfs.roots[0]['external-contents']);
            assert.equal(bytes[3], 255);
            assert.equal(bytes.length, original.length);
            fs.appendFileSync(nested, '\n');
            const second = entry();
            prepareAc5Overlay([second], path.join(dir, 'storage'));
            assert.notEqual(second.arguments[second.arguments.indexOf('-ivfsoverlay') + 1], overlay);
            fs.writeFileSync(nested, 'struct X { int b; };');
            const third = entry();
            assert.deepEqual(prepareAc5Overlay([third], path.join(dir, 'storage')), []);
            assert.ok(!third.arguments.includes('-ivfsoverlay'));
        } finally {
            assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(root));
            fs.rmSync(dir, { recursive: true });
        }
    });
});
