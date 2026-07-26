import assert from 'node:assert/strict';
import test from 'node:test';

import { requestBatchPreTranslateCancelWithRedis } from '@/lib/batch-pre-translate-cancellation';
import type { AuthContext } from '@/lib/guards';
import { sourceRevision } from '@/lib/source-revision';
import {
    createBatchPreTranslateId,
    getBatchPreTranslateStaleReason,
    isBatchPreTranslateEligibleStatus,
    isBatchPreTranslateTerminal,
    persistBatchPreTranslateResultsWithDeps,
    resolveBatchPreTranslatePromptSnapshot,
} from './batch-pre-translate';

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

    async eval(script: string, keyCount: number, ...args: Array<string | number>) {
        const keys = args.slice(0, keyCount).map(String);
        const values = args.slice(keyCount).map(String);

        if (script.includes('batch-pre-translate-acquire-persist-lock')) {
            const [cancelKey, lockKey, completedKey] = keys;
            const [lockToken] = values;
            if (this.values.get(cancelKey!) === '1') return 'CANCELED';
            if (this.values.get(completedKey!) === '1') return 'COMMITTED';
            if (this.values.has(lockKey!)) return 'LOCKED';
            this.values.set(lockKey!, lockToken!);
            return 'ACQUIRED';
        }

        if (script.includes('batch-pre-translate-request-cancel')) {
            const [lockKey, completedKey, cancelKey] = keys;
            if (this.values.get(completedKey!) === '1') return 'COMMITTED';
            if (this.values.has(lockKey!)) return 'PERSISTING';
            this.values.set(cancelKey!, '1');
            return 'CANCELED';
        }

        const [key] = keys;
        const [token] = values;
        if (this.values.get(key!) !== token) return 0;
        this.values.delete(key!);
        return 1;
    }
}

const authCtx = { userId: 'user-1', tenantId: null, role: 'USER' } as AuthContext;

function cachedResult(id = 'item-1', sourceText = 'source', targetText: string | null = null) {
    return {
        id,
        sourceText,
        targetText,
        sourceRevision: sourceRevision(sourceText),
        translation: 'translated source',
        terms: [],
        dict: [],
    };
}

function terminalRedis(batchId: string, result = cachedResult()) {
    return new FakeRedis({
        [`batch.${batchId}.total`]: '1',
        [`batch.${batchId}.done`]: '1',
        [`batch.${batchId}.failed`]: '0',
        [`batch.${batchId}.cancel`]: '0',
        [`batch.${batchId}.userId`]: authCtx.userId,
        [`batch.${batchId}.terminal.${result.id}`]: 'done',
        [`batch.${batchId}.item.${result.id}`]: JSON.stringify(result),
    });
}

function writableItem(status = 'NOT_STARTED') {
    return {
        id: 'item-1',
        sourceText: 'source',
        targetText: null,
        status,
        metadata: {},
    };
}

test('allows only an untouched item into a batch pre-translation', () => {
    assert.equal(isBatchPreTranslateEligibleStatus('NOT_STARTED'), true);
    assert.equal(isBatchPreTranslateEligibleStatus('MT'), false);
    assert.equal(isBatchPreTranslateEligibleStatus('QA_REVIEW'), false);
});

test('requires all jobs to reach exactly one terminal state before persist', () => {
    assert.equal(isBatchPreTranslateTerminal(2, 1, 1), true);
    assert.equal(isBatchPreTranslateTerminal(2, 1, 0), false);
    assert.equal(isBatchPreTranslateTerminal(2, 2, 1), false);
});

test('uses a collision-resistant batch id suffix', () => {
    assert.equal(createBatchPreTranslateId(123, 'one'), 'bt.123.one');
    assert.notEqual(createBatchPreTranslateId(123, 'one'), createBatchPreTranslateId(123, 'two'));
});

test('freezes both owner-resolved pre-translation prompts before jobs are enqueued', async () => {
    const resolvedKeys: string[] = [];
    const snapshot = await resolveBatchPreTranslatePromptSnapshot(authCtx, async (ctx, key) => {
        assert.equal(ctx.userId, authCtx.userId);
        resolvedKeys.push(key);
        return key === 'mono-term-extract' ? 'extract only legal terms' : 'preserve legal force';
    });

    assert.deepEqual(resolvedKeys.sort(), ['mono-term-extract', 'term-embed-trans']);
    assert.deepEqual(snapshot, {
        termExtractPrompt: 'extract only legal terms',
        termEmbedPrompt: 'preserve legal force',
    });
});

test('discards a late result when source, target, or workflow status changes', () => {
    const data = cachedResult();
    assert.equal(getBatchPreTranslateStaleReason(data, writableItem('MT')), 'STATUS_CHANGED');
    assert.equal(
        getBatchPreTranslateStaleReason(data, { ...writableItem(), sourceText: 'new source' }),
        'SOURCE_CHANGED'
    );
    assert.equal(
        getBatchPreTranslateStaleReason(data, { ...writableItem(), targetText: 'manual target' }),
        'TARGET_CHANGED'
    );
});

test('rejects an incomplete batch without consuming cached outputs', async () => {
    const batchId = 'incomplete';
    const redis = terminalRedis(batchId);
    redis.values.set(`batch.${batchId}.total`, '2');

    await assert.rejects(
        persistBatchPreTranslateResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            requireWritableDocumentItem: async () => writableItem(),
            persistItemAtomically: async () => true,
            lockToken: 'lock-incomplete',
        }),
        /尚未结束/
    );
    assert.equal(redis.values.has(`batch.${batchId}.item.item-1`), true);
});

test('a confirmed cancel fences pre-translation persistence before any item is read or written', async () => {
    const batchId = 'cancel-wins';
    const redis = terminalRedis(batchId);
    const canceled = await requestBatchPreTranslateCancelWithRedis(batchId, redis, 60);
    let itemReads = 0;
    let writes = 0;

    assert.deepEqual(canceled, { canceled: true });
    assert.equal(redis.values.get(`batch.${batchId}.cancel`), '1');
    await assert.rejects(
        persistBatchPreTranslateResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            requireWritableDocumentItem: async () => {
                itemReads += 1;
                return writableItem();
            },
            persistItemAtomically: async () => {
                writes += 1;
                return true;
            },
            lockToken: 'lock-cancel-wins',
        }),
        /已取消/
    );

    assert.equal(itemReads, 0);
    assert.equal(writes, 0);
    assert.equal(redis.values.has(`batch.${batchId}.item.item-1`), true);
    assert.equal(redis.values.has(`batch.${batchId}.userId`), true);
});

test('cancel is rejected when an already-started persistence owns the batch lease', async () => {
    const batchId = 'persist-wins';
    const redis = terminalRedis(batchId);
    redis.values.set(`batch.${batchId}.persist.lock`, 'existing-persist');

    assert.deepEqual(await requestBatchPreTranslateCancelWithRedis(batchId, redis, 60), {
        canceled: false,
        reason: 'persisting',
    });
    assert.equal(redis.values.get(`batch.${batchId}.cancel`), '0');
});

test('cancel is rejected after a completed persistence instead of falsely reporting a stop', async () => {
    const batchId = 'already-committed';
    const redis = terminalRedis(batchId);
    redis.values.set(`batch.${batchId}.persist.completed`, '1');

    assert.deepEqual(await requestBatchPreTranslateCancelWithRedis(batchId, redis, 60), {
        canceled: false,
        reason: 'committed',
    });
    assert.equal(redis.values.get(`batch.${batchId}.cancel`), '0');
});

test('a completed batch cannot reacquire persistence after its completion fence is published', async () => {
    const batchId = 'repeat-persist';
    const redis = terminalRedis(batchId);
    redis.values.set(`batch.${batchId}.persist.completed`, '1');
    let writes = 0;

    await assert.rejects(
        persistBatchPreTranslateResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            requireWritableDocumentItem: async () => writableItem(),
            persistItemAtomically: async () => {
                writes += 1;
                return true;
            },
            lockToken: 'repeat-persist-lock',
        }),
        /已保存/
    );
    assert.equal(writes, 0);
});

test('persists only conditionally accepted results and cleans a finished batch', async () => {
    const batchId = 'success';
    const redis = terminalRedis(batchId);
    let writes = 0;
    const result = await persistBatchPreTranslateResultsWithDeps(batchId, {
        connection: redis,
        authCtx,
        requireWritableDocumentItem: async () => writableItem(),
        persistItemAtomically: async () => {
            writes += 1;
            return true;
        },
        lockToken: 'lock-success',
    });

    assert.equal(writes, 1);
    assert.deepEqual(result.updatedIds, ['item-1']);
    assert.equal(result.complete, true);
    assert.equal(redis.values.has(`batch.${batchId}.item.item-1`), false);
    assert.equal(redis.values.has(`batch.${batchId}.userId`), false);
    assert.equal(redis.values.get(`batch.${batchId}.persist.completed`), '1');
});

test('keeps transient persistence failures retryable but consumes stale results', async () => {
    const retryable = terminalRedis('retryable');
    const retryResult = await persistBatchPreTranslateResultsWithDeps('retryable', {
        connection: retryable,
        authCtx,
        requireWritableDocumentItem: async () => writableItem(),
        persistItemAtomically: async () => {
            throw new Error('temporary database failure');
        },
        lockToken: 'lock-retryable',
    });
    assert.deepEqual(retryResult.retryableIds, ['item-1']);
    assert.equal(retryResult.complete, false);
    assert.equal(retryable.values.has('batch.retryable.item.item-1'), true);

    const stale = terminalRedis('stale');
    const staleResult = await persistBatchPreTranslateResultsWithDeps('stale', {
        connection: stale,
        authCtx,
        requireWritableDocumentItem: async () => writableItem('POST_EDIT'),
        persistItemAtomically: async () => true,
        lockToken: 'lock-stale',
    });
    assert.deepEqual(staleResult.staleIds, ['item-1']);
    assert.equal(staleResult.complete, true);
    assert.equal(stale.values.has('batch.stale.item.item-1'), false);
});

test('a concurrent pre-translation persist cannot consume the same cached batch twice', async () => {
    const batchId = 'locked';
    const redis = terminalRedis(batchId);
    redis.values.set(`batch.${batchId}.persist.lock`, 'other-lock');

    await assert.rejects(
        persistBatchPreTranslateResultsWithDeps(batchId, {
            connection: redis,
            authCtx,
            requireWritableDocumentItem: async () => writableItem(),
            persistItemAtomically: async () => true,
            lockToken: 'our-lock',
        }),
        /正在保存/
    );
    assert.equal(redis.values.has(`batch.${batchId}.item.item-1`), true);
});
