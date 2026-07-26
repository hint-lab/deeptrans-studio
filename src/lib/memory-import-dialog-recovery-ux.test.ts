import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('translation-memory recovery UI stays fail-closed while exposing recovery controls', () => {
    const component = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'import-memory-dialog.tsx'
    );

    assert.match(
        component,
        /enqueueRequested &&[\s\S]*apiError\.status === 409[\s\S]*apiError\.status === 503/
    );
    assert.match(
        component,
        /apiError\.status === 409 &&[\s\S]*MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE/
    );
    assert.match(component, /apiError\.status === 403 \|\| apiError\.status === 404/);
    assert.match(component, /role="alert"/);
    assert.match(component, /retryRecoveryCheck/);
    assert.match(component, /reservedImports/);
    assert.match(component, /clearSelectedFile\(\)/);
    assert.match(component, /disabled=\{recoveryInteractionBusy\}/);
    assert.match(component, /memoryName/);
    assert.match(component, /role="progressbar"/);
});

test('translation-memory recovery UI ships the Chinese and English recovery copy it renders', () => {
    for (const locale of ['zh', 'en']) {
        const messages = JSON.parse(read('src', 'i18n', `${locale}.json`));
        const importDialog = messages.Dashboard.Memories.ImportDialog;
        for (const key of [
            'retryRecoveryCheck',
            'recoveryBlockedSelectedMemory',
            'recoveryTargetMemory',
            'recoveryTargetMemoryUnavailable',
            'viewTargetMemory',
            'acknowledgingUnconfirmedImport',
        ]) {
            assert.equal(typeof importDialog[key], 'string', `${locale}:${key}`);
        }
    }
});
