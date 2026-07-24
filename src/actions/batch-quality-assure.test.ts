import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceRevision } from '@/lib/source-revision';
import { SYNTAX_CATEGORIES } from '@/lib/syntax-quality';
import {
    createBatchQAId,
    getBatchQAStaleReason,
    isBatchQAEligibleStatus,
    isBatchQATerminal,
    persistBatchQAResultsWithDeps,
} from './batch-quality-assure';

class FakeRedis {
    readonly values = new Map<string, string>();

    constructor(initial: Record<string, string> = {}) {
        Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
    }

    async get(key: string) {
        return this.values.get(key) ?? null;
    }

    async set(key: string, value: string, ...args: Array<string | number>) {
        if (args.includes('NX') && this.values.has(key)) return null;
        this.values.set(key, String(value));
        return 'OK';
    }

    async keys(pattern: string) {
        const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
        return [...this.values.keys()].filter(key => key.startsWith(prefix));
    }

    async del(...keys: string[]) {
        let deleted = 0;
        keys.forEach(key => {
            if (this.values.delete(key)) deleted += 1;
        });
        return deleted;
    }

    async eval(_script: string, _keyCount: number, key: string, token: string) {
        if (this.values.get(key) !== token) return 0;
        this.values.delete(key);
        return 1;
    }
}

const authCtx = { userId: 'user-1', tenantId: null, role: 'USER' };

function cachedResult(id: string, sourceText = 'source', targetText = 'target') {
    return {
        id,
        qualityAssureBiTerm: { version: 2, relations: [] },
        qualityAssureSyntax: {
            version: 2,
            status: 'complete',
            relations: [],
            issues: [],
            dimensions: SYNTAX_CATEGORIES.map(category => ({
                category,
                status: 'not_applicable',
            })),
            evaluation: {
                id: `eval-${id}`,
                sourceRevision: sourceRevision(sourceText),
                targetRevision: sourceRevision(targetText),
                baseSource: sourceText,
                baseTarget: targetText,
            },
        },
        qualityAssureSyntaxEmbedded: null,
    };
}

function terminalRedis(batchId: string, result = cachedResult('item-1')) {
    return new FakeRedis({
        [`qa.${batchId}.total`]: '1',
        [`qa.${batchId}.done`]: '1',
        [`qa.${batchId}.failed`]: '0',
        [`qa.${batchId}.cancel`]: '0',
        [`qa.${batchId}.userId`]: authCtx.userId,
        [`qa.${batchId}.terminal.${result.id}`]: 'done',
        [`qa.${batchId}.item.${result.id}`]: JSON.stringify(result),
    });
}

function writableItem(status = 'MT_REVIEW') {
    return {
        id: 'item-1',
        sourceText: 'source',
        targetText: 'target',
        status,
    };
}

test('allows only MT and MT_REVIEW as batch QA input states', () => {
    assert.equal(isBatchQAEligibleStatus('MT'), true);
    assert.equal(isBatchQAEligibleStatus('MT_REVIEW'), true);
    assert.equal(isBatchQAEligibleStatus('QA'), false);
    assert.equal(isBatchQAEligibleStatus('QA_REVIEW'), false);
    assert.equal(isBatchQAEligibleStatus('COMPLETED'), false);
});

test('requires the terminal counters to match exactly', () => {
    assert.equal(isBatchQATerminal(3, 2, 1), true);
    assert.equal(isBatchQATerminal(3, 2, 0), false);
    assert.equal(isBatchQATerminal(3, 3, 1), false);
    assert.equal(isBatchQATerminal(0, 0, 0), false);
});

test('adds a random suffix to timestamp-based batch IDs', () => {
    assert.equal(createBatchQAId(123, 'suffix-a'), 'qa.123.suffix-a');
    assert.notEqual(createBatchQAId(123, 'suffix-a'), createBatchQAId(123, 'suffix-b'));
});

test('classifies advanced status and changed text as stale', () => {
    const data = cachedResult('item-1');
    assert.equal(getBatchQAStaleReason(data, writableItem('QA_REVIEW')), 'STATUS_CHANGED');
    assert.equal(
        getBatchQAStaleReason(data, { ...writableItem(), sourceText: 'new source' }),
        'SOURCE_CHANGED'
    );
    assert.equal(
        getBatchQAStaleReason(data, { ...writableItem(), targetText: 'new target' }),
        'TARGET_CHANGED'
    );
    assert.equal(getBatchQAStaleReason(data, writableItem('MT')), undefined);
});

test('rejects persistence before every worker job reaches a terminal state', async () => {
    const batchId = 'incomplete';
    const redis = terminalRedis(batchId);
    redis.values.set(`qa.${batchId}.total`, '2');

    await assert.rejects(
        persistBatchQAResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            loadWritableItem: async () => writableItem(),
            persistItemAtomically: async () => true,
            lockToken: 'lock-incomplete',
        }),
        /尚未结束/
    );
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), true);
    assert.equal(redis.values.has(`qa.${batchId}.userId`), true);
});

test('atomically persisted results are consumed and batch metadata is cleaned', async () => {
    const batchId = 'success';
    const redis = terminalRedis(batchId);
    let writes = 0;
    const result = await persistBatchQAResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        loadWritableItem: async () => writableItem('MT_REVIEW'),
        persistItemAtomically: async () => {
            writes += 1;
            return true;
        },
        lockToken: 'lock-success',
    });

    assert.equal(writes, 1);
    assert.deepEqual(result.updatedIds, ['item-1']);
    assert.equal(result.complete, true);
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), false);
    assert.equal(redis.values.has(`qa.${batchId}.userId`), false);
    assert.equal(redis.values.has(`qa.${batchId}.terminal.item-1`), false);
    assert.equal(redis.values.has(`qa.${batchId}.persist.lock`), false);
});

test('returns the real item IDs for terminal worker failures', async () => {
    const batchId = 'worker-failure';
    const redis = new FakeRedis({
        [`qa.${batchId}.total`]: '1',
        [`qa.${batchId}.done`]: '0',
        [`qa.${batchId}.failed`]: '1',
        [`qa.${batchId}.cancel`]: '0',
        [`qa.${batchId}.userId`]: authCtx.userId,
        [`qa.${batchId}.terminal.item-9`]: 'failed',
        [`qa.${batchId}.fail.item-9`]: 'MODEL_ERROR',
    });

    const result = await persistBatchQAResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        loadWritableItem: async () => {
            throw new Error('should not load a failed item');
        },
        persistItemAtomically: async () => false,
        lockToken: 'lock-worker-failure',
    });

    assert.deepEqual(result.failedIds, ['item-9']);
    assert.equal(result.complete, true);
    assert.equal(redis.values.has(`qa.${batchId}.userId`), false);
});

test('transient item persistence failures retain the result and batch metadata', async () => {
    const batchId = 'retryable';
    const redis = terminalRedis(batchId);
    const result = await persistBatchQAResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        loadWritableItem: async () => writableItem('MT'),
        persistItemAtomically: async () => {
            throw new Error('database temporarily unavailable');
        },
        lockToken: 'lock-retryable',
    });

    assert.deepEqual(result.retryableIds, ['item-1']);
    assert.equal(result.complete, false);
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), true);
    assert.equal(redis.values.has(`qa.${batchId}.userId`), true);
    assert.equal(redis.values.has(`qa.${batchId}.terminal.item-1`), true);
    assert.equal(redis.values.has(`qa.${batchId}.persist.lock`), false);
});

test('explicitly stale results are discarded without regressing item status', async () => {
    const batchId = 'stale';
    const redis = terminalRedis(batchId);
    let writes = 0;
    const result = await persistBatchQAResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        loadWritableItem: async () => writableItem('POST_EDIT'),
        persistItemAtomically: async () => {
            writes += 1;
            return true;
        },
        lockToken: 'lock-stale',
    });

    assert.equal(writes, 0);
    assert.deepEqual(result.staleIds, ['item-1']);
    assert.equal(result.complete, true);
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), false);
    assert.equal(redis.values.has(`qa.${batchId}.userId`), false);
});

test('a failed conditional update is treated as a stale race and consumed', async () => {
    const batchId = 'atomic-race';
    const redis = terminalRedis(batchId);
    const result = await persistBatchQAResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        loadWritableItem: async () => writableItem('MT_REVIEW'),
        persistItemAtomically: async () => false,
        lockToken: 'lock-atomic-race',
    });

    assert.deepEqual(result.staleIds, ['item-1']);
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), false);
});

test('a concurrent persistence call cannot consume the same batch', async () => {
    const batchId = 'locked';
    const redis = terminalRedis(batchId);
    redis.values.set(`qa.${batchId}.persist.lock`, 'other-lock');

    await assert.rejects(
        persistBatchQAResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            loadWritableItem: async () => writableItem(),
            persistItemAtomically: async () => true,
            lockToken: 'our-lock',
        }),
        /正在保存/
    );
    assert.equal(redis.values.has(`qa.${batchId}.item.item-1`), true);
});
