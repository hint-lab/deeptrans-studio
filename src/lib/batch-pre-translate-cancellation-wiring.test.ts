import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const actionSection = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/ide/[id]/components/menu/action-section.tsx'),
    'utf8'
);
const worker = readFileSync(resolve(process.cwd(), 'src/worker/index.ts'), 'utf8');

test('both batch pre-translation UI paths wait for authoritative cancellation before persistence', () => {
    assert.match(actionSection, /startBatchPreTranslateFlow\(\)/);
    assert.match(actionSection, /settleBatchPreTranslateCancel\(batchId\)/);
    assert.match(
        actionSection,
        /canPersistBatchPreTranslateResults\(progress, persistCancelState\)/
    );
    assert.match(
        actionSection,
        /canPersistBatchPreTranslateResults\(preProgress, persistCancelState\)/
    );
    assert.match(actionSection, /batchPreTranslateActiveRef\.current \|\| preTranslateId/);
    assert.match(actionSection, /payload\?\.canceled !== true/);
    assert.doesNotMatch(
        actionSection,
        /if \(batchCancelRef\.current\) throw new Error\('批量(?:翻译|预译)已取消'\)/
    );
});

test('the worker publishes pre-translation results through the cancellation-fenced commit and excludes canceled jobs from failures', () => {
    assert.match(worker, /runBatchPreTranslateModelWithCancellation/);
    assert.match(worker, /commitBatchPreTranslateResultIfActive/);
    assert.match(worker, /commitBatchPreTranslateFailureIfActive/);
    assert.match(worker, /terminalReason === 'JOB_CANCELED'/);
    assert.match(worker, /if \(canceled\) \{\s*logger\.info\(`\[pre\] canceled job=/);
    assert.doesNotMatch(worker, /markPreTranslateBatchItemFailure\(/);
});
