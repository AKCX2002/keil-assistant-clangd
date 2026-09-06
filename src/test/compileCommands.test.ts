import { strict as assert } from 'assert';
import * as path from 'path';
import { createCompileCommands, mergeCompilationDatabases, splitDefines } from '../project/compileCommands';

function target(): any {
    return {
        TargetName: 'Debug', uAC6: '1', pCCUsed: '6240000::V6.24::ARMCLANG',
        TargetOption: { TargetCommonOption: { Cpu: 'CPUTYPE("Cortex-M3") ELITTLE' },
            TargetArmAds: { Cads: { v6Lang: '3', VariousControls: { IncludePath: '../include', Define: 'BOARD=1' } } } },
        Groups: { Group: { GroupName: 'Sources', Files: { File: [
            { FilePath: '../source/main.c', FileType: '1' },
            { FilePath: '../source/main.cpp', FileType: '8' },
            { FilePath: '../source/disabled.c', FileOption: { CommonProperty: { IncludeInBuild: '0' } } },
            { FilePath: '../include/main.h' }, { FilePath: '../source/startup.s' }
        ] } } }
    };
}

const options = { projectFile: path.resolve('project with spaces/MDK/app.uvprojx'), compiler: 'clang' };

describe('clangd compilation database', () => {
    it('keeps quoted macro values and function macro commas intact', () => {
        assert.deepEqual(splitDefines('NAME="hello world",SUM(a,b)=((a)+(b)) FLAG'),
            ['NAME="hello world"', 'SUM(a,b)=((a)+(b))', 'FLAG']);
        assert.throws(() => splitDefines('NAME="broken'), /Unbalanced/);
    });

    it('emits enabled C/C++ sources with stable working directories and argument boundaries', () => {
        const result = createCompileCommands(target(), options);
        assert.equal(result.entries.length, 2);
        const c = result.entries[0];
        assert.equal(c.directory, path.dirname(options.projectFile));
        assert.equal(c.file, path.resolve('project with spaces/source/main.c'));
        assert.ok(c.arguments.includes('-mcpu=cortex-m3'));
        assert.ok(c.arguments.includes('-D__ARMCOMPILER_VERSION=6240000'));
        assert.ok(c.arguments.includes(path.resolve('project with spaces/include')));
        assert.equal(result.entries[1].arguments[result.entries[1].arguments.indexOf('-x') + 1], 'c++');
        assert.ok(!c.arguments.some(arg => arg.startsWith('-D__attribute__')));
    });

    it('does not compile files in an excluded group', () => {
        const dom = target();
        dom.Groups.Group.GroupOption = { CommonProperty: { IncludeInBuild: '0' } };
        assert.throws(() => createCompileCommands(dom, options), /no enabled/);
    });

    it('preserves per-file define/undefine order and explicit overrides', () => {
        const dom = target();
        dom.Groups.Group.GroupOption = { GroupArmAds: { Cads: { VariousControls: { Define: 'GROUP=1' } } } };
        dom.Groups.Group.Files.File[0].FileOption = { FileArmAds: { Cads: {
            VariousControls: { Define: 'FILE=1', Undefine: 'BOARD' }
        } } };
        const args = createCompileCommands(dom, { ...options, extraArgs: ['-DBOARD=9', '-std=c11'] }).entries[0].arguments;
        assert.ok(args.indexOf('-DGROUP=1') < args.indexOf('-DFILE=1'));
        assert.ok(args.indexOf('-DBOARD=1') < args.indexOf('-UBOARD'));
        assert.ok(args.indexOf('-UBOARD') < args.indexOf('-DBOARD=9'));
    });

    it('matches uVision language selectors and file-first include search order', () => {
        const dom = target();
        dom.TargetOption.TargetArmAds.Cads.v6Lang = '5';
        dom.Groups.Group.GroupOption = { GroupArmAds: { Cads: { v6Lang: '3', VariousControls: { IncludePath: '../group' } } } };
        dom.Groups.Group.Files.File[0].FileOption = { FileArmAds: { Cads: { v6Lang: '0', VariousControls: { IncludePath: '../file' } } } };
        const args = createCompileCommands(dom, options).entries[0].arguments;
        assert.ok(args.includes('-std=c99'));
        assert.ok(args.indexOf(path.resolve('project with spaces/file')) < args.indexOf(path.resolve('project with spaces/group')));
        assert.ok(args.indexOf(path.resolve('project with spaces/group')) < args.indexOf(path.resolve('project with spaces/include')));
    });

    it('maps Cortex-M4 FPU selection without treating hardware capability as forced use', () => {
        const dom = target();
        dom.TargetOption.TargetCommonOption.Cpu = 'CPUTYPE("Cortex-M4") FPU2';
        dom.TargetOption.TargetArmAds.ArmAdsMisc = { RvdsVP: '1' };
        const soft = createCompileCommands(dom, options).entries[0].arguments;
        assert.ok(soft.includes('-mfpu=none') && soft.includes('-mfloat-abi=soft'));
        dom.TargetOption.TargetArmAds.ArmAdsMisc.RvdsVP = '2';
        const hard = createCompileCommands(dom, options).entries[0].arguments;
        assert.ok(hard.includes('-mfpu=fpv4-sp-d16') && hard.includes('-mfloat-abi=hard'));
    });

    it('keeps libc++ headers out of C commands and preserves their supplied precedence for C++', () => {
        const dom = target();
        const includes = [path.resolve('tool/include/libcxx'), path.resolve('tool/include')];
        const result = createCompileCommands(dom, { ...options, systemIncludes: includes });
        assert.ok(!result.entries[0].arguments.includes(includes[0]));
        const cpp = result.entries[1].arguments;
        assert.ok(cpp.indexOf(includes[0]) < cpp.indexOf(includes[1]));
        assert.ok(cpp.includes('-fno-exceptions'));
    });

    it('retains the active-project command for shared sources', () => {
        const first = createCompileCommands(target(), options).entries;
        const second = createCompileCommands(target(), { ...options, extraArgs: ['-DACTIVE=1'] }).entries;
        const merged = mergeCompilationDatabases([first, second]);
        assert.equal(merged.length, 2);
        assert.ok(merged[0].arguments.includes('-DACTIVE=1'));
    });

    it('refuses unresolved path variables and unknown CPUs instead of emitting plausible wrong commands', () => {
        const dom = target();
        dom.TargetOption.TargetCommonOption.Cpu = '';
        assert.throws(() => createCompileCommands(dom, options), /determine CPU/);
        dom.TargetOption.TargetCommonOption.Cpu = 'CPUTYPE("Cortex-M3")';
        dom.Groups.Group.Files.File[0].FilePath = '$UNKNOWN$/main.c';
        assert.throws(() => createCompileCommands(dom, options), /Unresolved/);
    });

    it('reports AC5 approximation without deleting packed or intrinsic semantics', () => {
        const dom = target(); dom.uAC6 = '0'; dom.pCCUsed = '5060960::V5.06::ARMCC';
        const result = createCompileCommands(dom, options);
        assert.equal(result.toolchain, 'armcc');
        assert.ok(result.warnings.some(warning => warning.includes('AC5 approximation')));
        assert.ok(!result.entries[0].arguments.some(arg => arg.startsWith('-D__packed') || arg.startsWith('-D__builtin')));
    });
});
