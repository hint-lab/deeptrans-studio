import assert from 'node:assert/strict';
import test from 'node:test';

import {
    beginDocumentTermsCancel,
    commitDocumentTermsResultIfActive,
    createDocumentTermsRetryBatchId,
    isDocumentTermsCancellationConfirmed,
    requestDocumentTermsCancelWithRedis,
    resolveDocumentTermsCancelAttempt,
    runDocumentTermsModelWithCancellation,
} from './document-term-cancellation';

class FakeDocumentTermsRedis {
    readonly values = new Map<string, string>();

    async eval(script: string, keyCount: number, ...args: Array<string | number>) {
        const keys = args.slice(0, keyCount).map(String);
        const values = args.slice(keyCount).map(String);

        if (script.includes('doc-terms-commit-result')) {
            assert.equal(keyCount, 5);
            const [cancelKey, terminalKey, itemKey, doneKey, totalKey] = keys;
            const [serializedResult] = values;
            if (this.values.get(cancelKey!) === '1') return 0;
            if (this.values.has(terminalKey!)) return 2;
            this.values.set(terminalKey!, 'done');
            this.values.set(itemKey!, serializedResult!);
            this.values.set(doneKey!, '1');
            this.values.set(totalKey!, '1');
            return 1;
        }

        if (script.includes('doc-terms-request-cancel')) {
            assert.equal(keyCount, 4);
            const [terminalKey, cancelKey, itemKey, doneKey] = keys;
            if (this.values.has(terminalKey!)) return 'COMPLETED';
            this.values.set(cancelKey!, '1');
            this.values.delete(itemKey!);
            this.values.set(doneKey!, '0');
            return 'CANCELED';
        }

        throw new Error(`unexpected script: ${script}`);
    }
}

test('does not publish a document-term model result when cancellation arrives during the model call', async () => {
    let canceled = false;
    const result = await runDocumentTermsModelWithCancellation({
        isCancellationRequested: async () => canceled,
        runModel: async () => {
            canceled = true;
            return [{ term: 'late result' }];
        },
    });

    assert.deepEqual(result, { canceled: true });
});

test('the document-term Redis commit gives cancellation precedence over result publication', async () => {
    const batchId = 'project:cancel-wins';
    const redis = new FakeDocumentTermsRedis();
    redis.values.set(`docTerms.${batchId}.cancel`, '1');

    const outcome = await commitDocumentTermsResultIfActive(
        redis,
        batchId,
        'terms.all',
        { id: 'terms.all', terms: [{ term: 'late result' }] },
        3600
    );

    assert.deepEqual(outcome, { canceled: true, committed: false });
    assert.equal(redis.values.has(`docTerms.${batchId}.item.terms.all`), false);
    assert.equal(redis.values.has(`docTerms.${batchId}.terminal.terms.all`), false);
    assert.equal(redis.values.get(`docTerms.${batchId}.done`), undefined);
});

test('cancel and result publication are linearly ordered: cancel wins before commit, commit wins after terminal', async () => {
    const batchId = 'project:race';
    const redis = new FakeDocumentTermsRedis();
    redis.values.set(`docTerms.${batchId}.item.terms.all`, 'legacy cache');
    redis.values.set(`docTerms.${batchId}.done`, '1');

    const canceled = await requestDocumentTermsCancelWithRedis(redis, batchId, 3600);
    assert.deepEqual(canceled, { canceled: true });
    assert.equal(redis.values.has(`docTerms.${batchId}.item.terms.all`), false);
    assert.equal(redis.values.get(`docTerms.${batchId}.done`), '0');

    const lateCommit = await commitDocumentTermsResultIfActive(
        redis,
        batchId,
        'terms.all',
        { id: 'terms.all', terms: [{ term: 'late result' }] },
        3600
    );
    assert.deepEqual(lateCommit, { canceled: true, committed: false });

    const completedBatchId = 'project:commit-wins';
    const committed = await commitDocumentTermsResultIfActive(
        redis,
        completedBatchId,
        'terms.all',
        { id: 'terms.all', terms: [{ term: 'completed result' }] },
        3600
    );
    assert.deepEqual(committed, { canceled: false, committed: true });
    const tooLate = await requestDocumentTermsCancelWithRedis(redis, completedBatchId, 3600);
    assert.deepEqual(tooLate, { canceled: false, reason: 'completed' });
});

test('cancel UI state is only confirmed after the server accepts it', () => {
    const queued = beginDocumentTermsCancel('idle', false);
    assert.equal(queued, 'requested');
    assert.equal(isDocumentTermsCancellationConfirmed(queued), false);

    const requesting = beginDocumentTermsCancel(queued, true);
    assert.equal(requesting, 'requesting');
    assert.equal(resolveDocumentTermsCancelAttempt(requesting, false), 'idle');
    assert.equal(resolveDocumentTermsCancelAttempt(requesting, true), 'confirmed');
});

test('creates a fresh retry namespace after cancellation', () => {
    assert.equal(
        createDocumentTermsRetryBatchId('project-1', 1234, 'retry-a'),
        'project-1.1234.retry-a'
    );
    assert.throws(() => createDocumentTermsRetryBatchId('', 1234, 'retry-a'), /missing project id/);
});
