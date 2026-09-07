import { strict as assert } from 'assert';
import { planClangdArguments, previousClangdArguments } from '../project/clangdSettings';

describe('clangd workspace argument ownership', () => {
    const managed = '--compile-commands-dir=C:\\extension-storage\\clangd';

    it('shadows an inherited compile database while preserving other inherited arguments', () => {
        const inherited = ['--background-index', '--compile-commands-dir=build/Debug'];
        assert.deepEqual(planClangdArguments(inherited, undefined, managed), ['--background-index', managed]);
    });

    it('migrates the legacy extension-storage database and does not restore it', () => {
        const legacy = '--compile-commands-dir=C:\\Users\\A\\AppData\\Roaming\\Code\\User\\workspaceStorage\\abc\\AKCX2002.keil-assistant-clangd\\clangd';
        const workspace = ['--background-index', legacy];
        assert.deepEqual(planClangdArguments(workspace, workspace, managed), ['--background-index', managed]);
        assert.deepEqual(previousClangdArguments(workspace), ['--background-index']);
    });

    it('migrates a database path that was previously owned by this workspace state', () => {
        const oldManaged = '--compile-commands-dir=C:\\old-extension-storage\\clangd';
        const saved = { ownedArgs: ['--background-index', oldManaged] };
        assert.deepEqual(planClangdArguments(saved.ownedArgs, saved.ownedArgs, managed, saved), ['--background-index', managed]);
    });

    it('rejects a different database explicitly configured in this workspace', () => {
        const workspace = ['--compile-commands-dir=build/Debug'];
        assert.throws(() => planClangdArguments(workspace, workspace, managed), /workspace clangd compile-commands-dir conflicts/);
    });

    it('rejects external changes after taking ownership', () => {
        const saved = { ownedArgs: ['--background-index', managed] };
        assert.throws(() => planClangdArguments(['--header-insertion=never', managed], undefined, managed, saved), /changed externally/);
    });
});
