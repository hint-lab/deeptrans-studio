import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const actionSection = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/ide/[id]/components/menu/action-section.tsx'),
    'utf8'
);
const worker = readFileSync(resolve(process.cwd(), 'src/worker/index.ts'), 'utf8');

test('both batch-QA UI paths wait for authoritative cancellation before persistence', () => {
    assert.match(actionSection, /startBatchQAFlow\(\)/);
    assert.match(actionSection, /settleBatchQACancel\(batchId\)/);
    assert.match(actionSection, /canPersistBatchQAResults\(progress, persistCancelState\)/);
    assert.match(actionSection, /canPersistBatchQAResults\(qaProgress, persistCancelState\)/);
    assert.match(actionSection, /batchQAActiveRef\.current \|\| qaId/);
});

test('the QA worker fences late results and never turns a canceled job into a failure', () => {
    assert.match(worker, /runBatchQAModelWithCancellation/);
    assert.match(worker, /commitBatchQAResultIfActive/);
    assert.match(worker, /commitBatchQAFailureIfActive/);

    const failedHandler = worker.indexOf("qaWorker.on('failed'");
    assert.ok(failedHandler >= 0, 'QA failed handler must exist');
    const canceledReturn = worker.indexOf("if (terminalReason === 'JOB_CANCELED')", failedHandler);
    const failureCommit = worker.indexOf('commitBatchQAFailureIfActive(', failedHandler);
    assert.ok(canceledReturn >= 0, 'QA canceled jobs must be recognized');
    assert.ok(failureCommit >= 0, 'real QA failures must be atomically published');
    assert.ok(
        canceledReturn < failureCommit,
        'canceled jobs must return before failure publication'
    );
    assert.doesNotMatch(worker, /markQABatchItemTerminal/);
});
