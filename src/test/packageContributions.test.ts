import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type MenuEntry = {
    command: string;
    when?: string;
    group?: string;
};

function readPackageJson(): any {
    const packageJsonPath = path.resolve(__dirname, '../../../package.json');
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function findMenuEntries(entries: MenuEntry[], command: string): MenuEntry[] {
    return entries.filter(entry => entry.command === command);
}

describe('package contributions', () => {
    it('exposes project refresh and reveal actions from the project explorer UI', () => {
        const manifest = readPackageJson();
        const menus = manifest.contributes?.menus ?? {};
        const viewTitleEntries = menus['view/title'] as MenuEntry[] || [];
        const viewItemContextEntries = menus['view/item/context'] as MenuEntry[] || [];

        assert.ok(
            findMenuEntries(viewTitleEntries, 'project.refresh').some(entry => entry.when === 'view == project'),
            'expected project.refresh in the project view title'
        );
        assert.ok(
            findMenuEntries(viewTitleEntries, 'project.revealCurrentFile').some(entry => entry.when === 'view == project'),
            'expected project.revealCurrentFile in the project view title'
        );
        assert.ok(
            findMenuEntries(viewItemContextEntries, 'project.refresh').some(entry => entry.when === 'viewItem == Project'),
            'expected project.refresh in the project item context menu'
        );
        assert.ok(
            findMenuEntries(viewItemContextEntries, 'project.clearCacheAndRefresh').some(entry => entry.when === 'viewItem == Project'),
            'expected project.clearCacheAndRefresh in the project item context menu'
        );
        assert.ok(
            findMenuEntries(viewItemContextEntries, 'project.revealCurrentFile').some(entry => entry.when === 'viewItem == Project'),
            'expected project.revealCurrentFile in the project item context menu'
        );
    });

    it('exposes workspace configuration and native Keil build tasks', () => {
        const manifest = readPackageJson();
        const commands = manifest.contributes?.commands || [];
        const viewTitleEntries = manifest.contributes?.menus?.['view/title'] as MenuEntry[] || [];
        const taskDefinition = (manifest.contributes?.taskDefinitions || [])
            .find((definition: any) => definition.type === 'keil-task');
        const properties = manifest.contributes?.configuration?.[0]?.properties || {};

        assert.ok(commands.some((command: any) => command.command === 'keil.build'));
        assert.ok(commands.some((command: any) => command.command === 'keil.configureWorkspace'));
        assert.ok(findMenuEntries(viewTitleEntries, 'keil.build').some(entry => entry.when === 'view == project'));
        assert.deepEqual(taskDefinition.required, ['projectFile', 'targetName', 'action']);
        assert.deepEqual(taskDefinition.properties.action.enum, ['build', 'rebuild', 'download']);
        assert.equal(properties['KeilAssistant.Workspace.AutoConfigure'].default, true);
        assert.equal(properties['KeilAssistant.Workspace.GenerateTasks'].default, true);
        assert.deepEqual(properties['KeilAssistant.Workspace.TaskActions'].default, ['build', 'rebuild']);
    });
});
