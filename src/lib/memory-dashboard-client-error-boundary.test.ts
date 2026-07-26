import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8');

test('memory dashboard clients do not render arbitrary action or API error messages', () => {
    const page = read('src', 'app', '(app)', 'dashboard', 'memories', 'page.tsx');
    const settings = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'memory-settings-dialog.tsx'
    );
    const importDialog = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'import-memory-dialog.tsx'
    );

    assert.doesNotMatch(page, /error instanceof Error \? error\.message/);
    assert.doesNotMatch(settings, /e\?\.message \|\| String\(e\)/);
    assert.doesNotMatch(importDialog, /apiError\.message/);
    assert.doesNotMatch(importDialog, /String\(apiError\)/);
    assert.doesNotMatch(importDialog, /setPreviewLines\(\[`预览失败:/);
    assert.match(importDialog, /classifyMemoryImportClientFailure/);
    assert.match(importDialog, /role="alert"/);
});

test('memory import dialog ships localized safe fallback copy', () => {
    for (const locale of ['zh', 'en']) {
        const messages = JSON.parse(read('src', 'i18n', `${locale}.json`));
        const importDialog = messages.Dashboard.Memories.ImportDialog;
        for (const key of [
            'emptyFile',
            'emptyPairs',
            'importPairLimitExceeded',
            'authRequired',
            'accessDenied',
            'acknowledgementUnavailable',
        ]) {
            assert.equal(typeof importDialog[key], 'string', `${locale}:${key}`);
        }
    }
});
