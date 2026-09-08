import { strict as assert } from 'assert';
import * as path from 'path';
import { parse } from 'jsonc-parser';
import {
    collectExcludeDirectories,
    mergeSettingsJson,
    mergeTasksJson,
    WorkspaceProjectDefinition
} from '../project/workspaceFiles';

function project(): WorkspaceProjectDefinition {
    const directory = path.resolve('fixture', 'Firmware');
    return {
        projectFile: path.join(directory, 'Firmware.uvprojx'),
        projectName: 'Firmware',
        targets: [
            { targetName: 'Debug', generatedDirectories: ['.\\Build\\Objects', '.\\Build\\Listings'] },
            { targetName: 'Release', generatedDirectories: ['.\\Build\\Objects'] }
        ]
    };
}

describe('Keil project workspace files', () => {
    it('adds configured and project output exclusions without replacing user choices', () => {
        const current = `{
    // user setting must survive
    "files.exclude": { "**/Objects": false },
    "editor.tabSize": 2,
}`;
        const directories = collectExcludeDirectories(project(), ['Objects', '.keil-assistant-clangd']);
        const merged = mergeSettingsJson(current, directories);
        const value = parse(merged);

        assert.equal(value['editor.tabSize'], 2);
        assert.equal(value['files.exclude']['**/Objects'], false);
        assert.equal(value['files.exclude']['**/.keil-assistant-clangd'], true);
        assert.equal(value['search.exclude']['**/Build/Objects'], true);
        assert.equal(value['files.watcherExclude']['**/Build/Listings/**'], true);
        assert.match(merged, /user setting must survive/);
    });

    it('merges managed Keil tasks and keeps unrelated user tasks', () => {
        const current = `{
    "version": "2.0.0",
    "tasks": [
        // user task comment must survive
        { "label": "User task", "type": "shell", "command": "echo ok" }
    ]
}`;
        const mergedText = mergeTasksJson(current, project(), ['build', 'rebuild'], true);
        const merged = parse(mergedText);

        assert.equal(merged.tasks[0].label, 'User task');
        assert.equal(merged.tasks.filter((task: any) => task.keilAssistantManaged).length, 4);
        assert.ok(merged.tasks.filter((task: any) => task.action === 'build')
            .every((task: any) => task.group === 'build'));
        assert.match(mergedText, /user task comment must survive/);
    });

    it('removes only managed tasks when task generation is disabled', () => {
        const generated = mergeTasksJson(`{
    "tasks": [{ "label": "User task", "type": "shell", "command": "echo ok" }]
}`, project(), ['build'], true);
        const withUserTask = mergeTasksJson(generated, project(), ['build'], true);
        const disabled = parse(mergeTasksJson(withUserTask, project(), ['build'], false));

        assert.deepEqual(disabled.tasks.map((task: any) => task.label), ['User task']);
    });

    it('keeps managed tasks for multiple Keil project files in the same directory', () => {
        const first = project();
        const second = {
            ...project(),
            projectFile: path.join(path.dirname(first.projectFile), 'Bootloader.uvprojx'),
            projectName: 'Bootloader'
        };
        const withFirst = mergeTasksJson('{}', first, ['build'], true);
        const withBoth = parse(mergeTasksJson(withFirst, second, ['build'], true));

        assert.deepEqual(
            withBoth.tasks.map((task: any) => task.projectFile).sort(),
            [
                '${workspaceFolder}/Bootloader.uvprojx',
                '${workspaceFolder}/Bootloader.uvprojx',
                '${workspaceFolder}/Firmware.uvprojx',
                '${workspaceFolder}/Firmware.uvprojx'
            ]
        );
    });
});
