import assert from 'node:assert/strict';
import test from 'node:test';

import {
    beginBatchPreTranslateCancel,
    canPersistBatchPreTranslateResults,
    commitBatchPreTranslateFailureIfActive,
    commitBatchPreTranslateResultIfActive,
    isBatchPreTranslateCancelConfirmed,
    resolveBatchPreTranslateCancelAttempt,
    runBatchPreTranslateModelWithCancellation,
} from './batch-pre-translate-cancellation';

class FakePreTranslateResultRedis {
    readonly values = new Map<string, string>();

    async eval(script: string, keyCount: number, ...args: Array<string | number>) {
        assert.equal(keyCount, 4);
        const [cancelKey, terminalKey, itemKey, doneKey] = args.slice(0, keyCount).map(String);
        const [serializedPayload] = args.slice(keyCount).map(String);

        if (this.values.get(cancelKey!) === '1') {
            return [0, Number(this.values.get(doneKey!) || 0)];
        }
        if (this.values.has(terminalKey!)) {
            return [2, Number(this.values.get(doneKey!) || 0)];
        }

        if (script.includes('batch-pre-translate-commit-failure')) {
            this.values.set(terminalKey!, 'failed');
            this.values.set(itemKey!, serializedPayload!);
        } else {
            assert.match(script, /batch-pre-translate-commit-result/);
            this.values.set(terminalKey!, 'done');
            this.values.set(itemKey!, serializedPayload!);
        }
        const count = Number(this.values.get(doneKey!) || 0) + 1;
        this.values.set(doneKey!, String(count));
        return [1, count];
    }
}

test('does not pass a late pre-translation model result to Redis publication after cancellation', async () => {
    let canceled = false;

    const outcome = await runBatchPreTranslateModelWithCancellation({
        isCancellationRequested: async () => canceled,
        runModel: async () => {
            canceled = true;
            return { translation: 'late output' };
        },
    });

    assert.deepEqual(outcome, { canceled: true });
});

test('returns a pre-translation result while the batch remains active', async () => {
    let modelCalls = 0;
    const outcome = await runBatchPreTranslateModelWithCancellation({
        isCancellationRequested: async () => false,
        runModel: async () => {
            modelCalls += 1;
            return { translation: 'result' };
        },
    });

    assert.equal(modelCalls, 1);
    assert.deepEqual(outcome, { canceled: false, result: { translation: 'result' } });
});

test('an accepted cancellation wins over pre-translation cache, terminal, and done writes', async () => {
    const batchId = 'cancel-wins';
    const itemId = 'item-1';
    const redis = new FakePreTranslateResultRedis();
    redis.values.set(`batch.${batchId}.cancel`, '1');
    redis.values.set(`batch.${batchId}.done`, '0');

    const outcome = await commitBatchPreTranslateResultIfActive(
        redis,
        batchId,
        itemId,
        { id: itemId, translation: 'late output' },
        3600
    );

    assert.deepEqual(outcome, { canceled: true, committed: false, count: 0 });
    assert.equal(redis.values.has(`batch.${batchId}.item.${itemId}`), false);
    assert.equal(redis.values.has(`batch.${batchId}.terminal.${itemId}`), false);
    assert.equal(redis.values.get(`batch.${batchId}.done`), '0');
});

test('an active pre-translation failure writes detail before it marks the failed counter terminal', async () => {
    const batchId = 'failure-commit';
    const itemId = 'item-1';
    const redis = new FakePreTranslateResultRedis();
    redis.values.set(`batch.${batchId}.failed`, '0');

    const outcome = await commitBatchPreTranslateFailureIfActive(
        redis,
        batchId,
        itemId,
        'MODEL_ERROR',
        3600
    );

    assert.deepEqual(outcome, { canceled: false, committed: true, count: 1 });
    assert.equal(redis.values.get(`batch.${batchId}.terminal.${itemId}`), 'failed');
    assert.equal(redis.values.get(`batch.${batchId}.fail.${itemId}`), 'MODEL_ERROR');
    assert.equal(redis.values.get(`batch.${batchId}.failed`), '1');
});

test('a cancel arriving before the failure commit cannot increment the pre-translation failed counter', async () => {
    const batchId = 'failure-cancel-wins';
    const itemId = 'item-1';
    const redis = new FakePreTranslateResultRedis();
    redis.values.set(`batch.${batchId}.cancel`, '1');
    redis.values.set(`batch.${batchId}.failed`, '0');

    const outcome = await commitBatchPreTranslateFailureIfActive(
        redis,
        batchId,
        itemId,
        'MODEL_ERROR',
        3600
    );

    assert.deepEqual(outcome, { canceled: true, committed: false, count: 0 });
    assert.equal(redis.values.has(`batch.${batchId}.terminal.${itemId}`), false);
    assert.equal(redis.values.has(`batch.${batchId}.fail.${itemId}`), false);
    assert.equal(redis.values.get(`batch.${batchId}.failed`), '0');
});

test('only a server-confirmed cancel is reported as canceled or allowed to fence persistence', () => {
    const queued = beginBatchPreTranslateCancel('idle', false);
    assert.equal(queued, 'requested');
    assert.equal(isBatchPreTranslateCancelConfirmed(queued), false);
    assert.equal(
        canPersistBatchPreTranslateResults({ terminal: true, canceled: false }, queued),
        false
    );

    const requesting = beginBatchPreTranslateCancel(queued, true);
    assert.equal(requesting, 'requesting');
    assert.equal(
        canPersistBatchPreTranslateResults({ terminal: true, canceled: false }, requesting),
        false
    );

    const confirmed = resolveBatchPreTranslateCancelAttempt(requesting, true);
    assert.equal(confirmed, 'confirmed');
    assert.equal(isBatchPreTranslateCancelConfirmed(confirmed), true);
    assert.equal(
        canPersistBatchPreTranslateResults({ terminal: true, canceled: false }, confirmed),
        false
    );
});

test('a persist-wins cancel rejection returns the client to idle instead of falsely announcing a stop', () => {
    const requesting = beginBatchPreTranslateCancel('idle', true);
    const rejected = resolveBatchPreTranslateCancelAttempt(requesting, false);

    assert.equal(rejected, 'idle');
    assert.equal(isBatchPreTranslateCancelConfirmed(rejected), false);
    assert.equal(
        canPersistBatchPreTranslateResults({ terminal: true, canceled: false }, rejected),
        true
    );
});
