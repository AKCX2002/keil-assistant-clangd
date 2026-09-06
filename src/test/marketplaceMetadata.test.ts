import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function readPackageJson(): any {
    return JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
    );
}

function readReadme(): string {
    return fs.readFileSync(path.resolve(__dirname, '../../../README.md'), 'utf8');
}

function readReadmeEn(): string {
    return fs.readFileSync(path.resolve(__dirname, '../../../README_EN.md'), 'utf8');
}

describe('marketplace metadata', () => {
    it('uses a separate personal fork identity and repository', () => {
        const manifest = readPackageJson();

        assert.equal(manifest.name, 'keil-assistant-clangd');
        assert.equal(manifest.displayName, 'Keil Assistant clangd (Personal)');
        assert.match(manifest.description, /unofficial personal-use modifications/i);
        assert.equal(manifest.homepage, 'https://github.com/AKCX2002/keil-assistant-clangd');
        assert.equal(manifest.repository.url, 'https://github.com/AKCX2002/keil-assistant-clangd');
        assert.equal(manifest.bugs.url, 'https://github.com/AKCX2002/keil-assistant-clangd/issues');
        assert.equal(manifest.contributes.configuration[0].title, 'Keil Assistant clangd (Personal)');
    });

    it('makes the independent continuation and differentiators obvious at the top of the README', () => {
        const readme = readReadme();

        assert.match(readme, /^# Keil Assistant clangd \(Personal\)/m);
        assert.match(readme, /自用修改/);
        assert.match(readme, /## 使用/);
        assert.match(readme, /## 来源与许可/);
    });

    it('does not reference marketplace-risk screenshots in the public readmes', () => {
        const screenshotPatterns = [
            './images/copilot-tools.png',
            './images/help.jpg',
            './res/preview/preview.png',
            './res/preview/setting.png'
        ];
        const readmes = [readReadme(), readReadmeEn()];

        for (const readme of readmes) {
            for (const screenshotPattern of screenshotPatterns) {
                assert.doesNotMatch(readme, new RegExp(screenshotPattern.replace('.', '\\.')));
            }
        }
    });
});
