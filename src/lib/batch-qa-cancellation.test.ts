import assert from 'node:assert/strict';
import test from 'node:test';

import {
    beginBatchQACancel,
    canPersistBatchQAResults,
    commitBatchQAFailureIfActive,
    commitBatchQAResultIfActive,
    isBatchQACancelConfirmed,
    resolveBatchQACancelAttempt,
    runBatchQAModelWithCancellation,
} from './batch-qa-cancellation';

class FakeQAResultRedis {
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

        if (script.includes('batch-qa-commit-failure')) {
            this.values.set(terminalKey!, 'failed');
            this.values.set(itemKey!, serializedPayload!);
        } else {
            assert.match(script, /batch-qa-commit-result/);
            this.values.set(terminalKey!, 'done');
            this.values.set(itemKey!, serializedPayload!);
        }
        const count = Number(this.values.get(doneKey!) || 0) + 1;
        this.values.set(doneKey!, String(count));
        return [1, count];
    }
}

test('does not pass a late QA model result to the Redis commit point after cancellation', async () => {
    let canceled = false;

    const outcome = await runBatchQAModelWithCancellation({
        isCancellationRequested: async () => canceled,
        runModel: async () => {
            canceled = true;
            return { syntax: 'late model output' };
        },
    });

    assert.deepEqual(outcome, { canceled: true });
});

test('returns a model result only when the QA batch remains active', async () => {
    let modelCalls = 0;

    const outcome = await runBatchQAModelWithCancellation({
        isCancellationRequested: async () => false,
        runModel: async () => {
            modelCalls += 1;
            return 'result';
        },
    });

    assert.equal(modelCalls, 1);
    assert.deepEqual(outcome, { canceled: false, result: 'result' });
});

test('atomic QA result commit gives cancellation precedence over cache and terminal writes', async () => {
    const batchId = 'cancel-wins';
    const itemId = 'item-1';
    const redis = new FakeQAResultRedis();
    redis.values.set(`qa.${batchId}.cancel`, '1');
    redis.values.set(`qa.${batchId}.done`, '0');

    const outcome = await commitBatchQAResultIfActive(
        redis,
        batchId,
        itemId,
        { id: itemId, qualityAssureSyntax: { status: 'complete' } },
        3600
    );

    assert.deepEqual(outcome, { canceled: true, committed: false, count: 0 });
    assert.equal(redis.values.has(`qa.${batchId}.item.${itemId}`), false);
    assert.equal(redis.values.has(`qa.${batchId}.terminal.${itemId}`), false);
    assert.equal(redis.values.get(`qa.${batchId}.done`), '0');
});

test('atomic QA failure publication writes detail before making the batch terminal', async () => {
    const batchId = 'failure-commit';
    const itemId = 'item-1';
    const redis = new FakeQAResultRedis();
    redis.values.set(`qa.${batchId}.failed`, '0');

    const outcome = await commitBatchQAFailureIfActive(redis, batchId, itemId, 'MODEL_ERROR', 3600);

    assert.deepEqual(outcome, { canceled: false, committed: true, count: 1 });
    assert.equal(redis.values.get(`qa.${batchId}.terminal.${itemId}`), 'failed');
    assert.equal(redis.values.get(`qa.${batchId}.fail.${itemId}`), 'MODEL_ERROR');
    assert.equal(redis.values.get(`qa.${batchId}.failed`), '1');
});

test('cancellation prevents a late QA failure from becoming terminal or persistable', async () => {
    const batchId = 'failure-cancel-wins';
    const itemId = 'item-1';
    const redis = new FakeQAResultRedis();
    redis.values.set(`qa.${batchId}.cancel`, '1');
    redis.values.set(`qa.${batchId}.failed`, '0');

    const outcome = await commitBatchQAFailureIfActive(redis, batchId, itemId, 'MODEL_ERROR', 3600);

    assert.deepEqual(outcome, { canceled: true, committed: false, count: 0 });
    assert.equal(redis.values.has(`qa.${batchId}.terminal.${itemId}`), false);
    assert.equal(redis.values.has(`qa.${batchId}.fail.${itemId}`), false);
    assert.equal(redis.values.get(`qa.${batchId}.failed`), '0');
});

test('a confirmed cancellation blocks persistence and is the only client state reported as canceled', () => {
    assert.equal(canPersistBatchQAResults({ terminal: true, canceled: false }, 'confirmed'), false);
    assert.equal(isBatchQACancelConfirmed('confirmed'), true);
    assert.equal(isBatchQACancelConfirmed('requesting'), false);
});

test('a persist-wins 409 returns the client to idle without falsely reporting cancellation', () => {
    const requesting = beginBatchQACancel('idle', true);
    assert.equal(requesting, 'requesting');

    const rejected = resolveBatchQACancelAttempt(requesting, false);
    assert.equal(rejected, 'idle');
    assert.equal(isBatchQACancelConfirmed(rejected), false);
    assert.equal(canPersistBatchQAResults({ terminal: true, canceled: false }, rejected), true);
});

test('cancel before a batch id queues the request and fences persistence until the server resolves it', () => {
    const queued = beginBatchQACancel('idle', false);
    assert.equal(queued, 'requested');
    assert.equal(isBatchQACancelConfirmed(queued), false);
    assert.equal(canPersistBatchQAResults({ terminal: true, canceled: false }, queued), false);

    const requesting = beginBatchQACancel(queued, true);
    assert.equal(requesting, 'requesting');
    assert.equal(canPersistBatchQAResults({ terminal: true, canceled: false }, requesting), false);
    assert.equal(canPersistBatchQAResults({ terminal: true, canceled: true }, 'idle'), false);
});
