import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '@/lib/db';
import {
    hybridSearchWithStatus,
    searchKeywords,
    searchVectors,
    upsertTranslationMemoryVectorsWithClient,
} from './postgres';

type CapturedSql = { sql?: string; values?: unknown[] };

const matchingRow = {
    id: 'entry-1',
    sourceText: '100%_complete contract clause',
    targetText: '合同条款',
    memoryId: 'memory-1',
    sourceLang: 'en',
    targetLang: 'zh',
    tenantId: 'tenant-1',
    userId: 'user-1',
    fuzzyScore: 0.9,
};

const queryEmbedding = Array.from({ length: 2048 }, () => 0.125);

test('transaction-bound vector upsert writes every batch through the caller transaction', async () => {
    const statements: CapturedSql[] = [];
    const result = await upsertTranslationMemoryVectorsWithClient(
        {
            $executeRaw: async statement => {
                statements.push(statement as CapturedSql);
                return 2;
            },
        },
        [
            { id: 'entry-a', vector: queryEmbedding },
            { id: 'entry-b', vector: queryEmbedding },
        ]
    );

    assert.equal(result, undefined);
    assert.equal(statements.length, 1);
    assert.match(statements[0]?.sql || '', /UPDATE "TranslationMemoryEntry" AS entry/);
    assert.ok(statements[0]?.values?.includes('entry-a'));
    assert.ok(statements[0]?.values?.includes('entry-b'));
});

test('transaction-bound vector upsert rejects a partial raw update', async () => {
    await assert.rejects(
        upsertTranslationMemoryVectorsWithClient({ $executeRaw: async () => 1 }, [
            { id: 'entry-a', vector: queryEmbedding },
            { id: 'entry-b', vector: queryEmbedding },
        ]),
        /expected 2 updated rows, received 1/
    );
});

test('HNSW ef_search is never below the effective vector retrieval k', async () => {
    const originalTransaction = prisma.$transaction;
    const statements: CapturedSql[] = [];
    (prisma as any).$transaction = async (callback: (transaction: any) => Promise<unknown>) =>
        callback({
            $executeRaw: async (statement: unknown) => {
                statements.push(statement as CapturedSql);
                return 0;
            },
            $queryRaw: async () => [],
        });

    try {
        await searchVectors({
            collection: 'TranslationMemory',
            vector: queryEmbedding,
            k: 40,
            ef: 3,
        });
    } finally {
        prisma.$transaction = originalTransaction;
    }

    assert.equal(statements.length, 1);
    assert.match(statements[0]?.sql || '', /set_config\('hnsw\.ef_search', \?, true\)/);
    assert.ok(statements[0]?.values?.includes('40'));
});

test('applies the exact owner and selected-library scope to both retrieval legs', async () => {
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    let vectorQuery: CapturedSql | undefined;
    let keywordQuery: CapturedSql | undefined;
    (prisma as any).$transaction = async (callback: (transaction: any) => Promise<unknown>) =>
        callback({
            $executeRaw: async () => 0,
            $queryRaw: async (statement: unknown) => {
                vectorQuery = statement as CapturedSql;
                return [];
            },
        });
    prisma.$queryRaw = async (statement: unknown) => {
        keywordQuery = statement as CapturedSql;
        return [];
    };

    try {
        await searchVectors({
            collection: 'TranslationMemory',
            vector: queryEmbedding,
            userId: 'owner-a',
            memoryIds: ['memory-a', 'memory-b'],
        });
        await searchKeywords({
            collection: 'TranslationMemory',
            query: 'contract',
            userId: 'owner-a',
            memoryIds: ['memory-a', 'memory-b'],
        });
    } finally {
        prisma.$transaction = originalTransaction;
        prisma.$queryRaw = originalQueryRaw;
    }

    for (const statement of [vectorQuery, keywordQuery]) {
        assert.match(statement?.sql || '', /e\."memoryId" IN \(\?,\?\)/);
        assert.match(statement?.sql || '', /m\."userId" = \?/);
        assert.ok(statement?.values?.includes('memory-a'));
        assert.ok(statement?.values?.includes('memory-b'));
        assert.ok(statement?.values?.includes('owner-a'));
    }
});

test('healthy hybrid zero-hit legs retain hybrid execution mode and per-result evidence', async () => {
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    (prisma as any).$transaction = async (callback: (transaction: any) => Promise<unknown>) =>
        callback({
            $executeRaw: async () => 0,
            $queryRaw: async () => [],
        });
    prisma.$queryRaw = async () => [matchingRow];

    try {
        const execution = await hybridSearchWithStatus({
            collection: 'TranslationMemory',
            query: 'contract clause',
            vector: queryEmbedding,
            config: { mode: 'hybrid' },
        });

        assert.equal(execution.configuredMode, 'hybrid');
        assert.equal(execution.effectiveMode, 'hybrid');
        assert.deepEqual(execution.unavailableLegs, []);
        assert.equal(execution.results[0]?.source, 'keyword');
        assert.ok((execution.results[0]?.keywordScore || 0) > 0);
        assert.equal(execution.results[0]?.vectorScore, undefined);
    } finally {
        prisma.$transaction = originalTransaction;
        prisma.$queryRaw = originalQueryRaw;
    }
});

test('hybrid mode downgrades only after an enabled retrieval leg is unavailable', async () => {
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    (prisma as any).$transaction = async () => {
        throw new Error('vector index unavailable');
    };
    prisma.$queryRaw = async () => [matchingRow];

    try {
        const execution = await hybridSearchWithStatus({
            collection: 'TranslationMemory',
            query: 'contract clause',
            vector: queryEmbedding,
            config: { mode: 'hybrid' },
        });

        assert.equal(execution.effectiveMode, 'keyword');
        assert.deepEqual(execution.unavailableLegs, ['vector']);
        assert.equal(execution.results[0]?.source, 'keyword');
    } finally {
        prisma.$transaction = originalTransaction;
        prisma.$queryRaw = originalQueryRaw;
    }
});

test('hybrid mode reports the sole enabled retrieval leg as its effective mode', async () => {
    const originalQueryRaw = prisma.$queryRaw;
    prisma.$queryRaw = async () => [matchingRow];

    try {
        const execution = await hybridSearchWithStatus({
            collection: 'TranslationMemory',
            query: 'contract clause',
            config: {
                mode: 'hybrid',
                vectorSearch: { enabled: false, topK: 10 },
                keywordSearch: { enabled: true, topK: 10 },
            },
        });

        assert.equal(execution.configuredMode, 'hybrid');
        assert.equal(execution.effectiveMode, 'keyword');
        assert.deepEqual(execution.unavailableLegs, []);
        assert.equal(execution.results[0]?.source, 'keyword');
    } finally {
        prisma.$queryRaw = originalQueryRaw;
    }
});

test('contains matching adds bigrams only for CJK runs, not English word fragments', async () => {
    const originalQueryRaw = prisma.$queryRaw;
    const queries: CapturedSql[] = [];
    prisma.$queryRaw = async (query: unknown) => {
        queries.push(query as CapturedSql);
        return [matchingRow];
    };

    try {
        await searchKeywords({
            collection: 'TranslationMemory',
            query: 'contract clause',
            matchType: 'contains',
        });
        await searchKeywords({
            collection: 'TranslationMemory',
            query: '术语管理',
            matchType: 'contains',
        });
    } finally {
        prisma.$queryRaw = originalQueryRaw;
    }

    const patterns = (query: CapturedSql) =>
        Array.from(
            new Set(
                (query.values || []).filter(
                    (value): value is string => typeof value === 'string' && value.startsWith('%')
                )
            )
        );

    assert.deepEqual(patterns(queries[0]!), ['%contract%', '%clause%']);
    assert.deepEqual(patterns(queries[1]!), ['%术语管理%', '%术语%', '%语管%', '%管理%']);
});

test('keyword match types generate distinct parameterized PostgreSQL predicates', async () => {
    const originalQueryRaw = prisma.$queryRaw;
    const queries: CapturedSql[] = [];
    prisma.$queryRaw = async (query: unknown) => {
        queries.push(query as CapturedSql);
        return [matchingRow];
    };

    try {
        await searchKeywords({
            collection: 'TranslationMemory',
            query: '100%_complete contract clause',
            matchType: 'exact',
        });
        await searchKeywords({
            collection: 'TranslationMemory',
            query: '100%_complete',
            matchType: 'phrase',
        });
        await searchKeywords({
            collection: 'TranslationMemory',
            query: 'contract clause',
            matchType: 'fuzzy',
        });
        await searchKeywords({
            collection: 'TranslationMemory',
            query: '100%_complete',
            matchType: 'contains',
        });
    } finally {
        prisma.$queryRaw = originalQueryRaw;
    }

    assert.equal(queries.length, 4);
    assert.match(queries[0]?.sql || '', /LOWER\(e\."sourceText"\) = LOWER\(\?\)/);
    assert.match(queries[1]?.sql || '', /ILIKE \? ESCAPE \?/);
    assert.match(queries[2]?.sql || '', /word_similarity/);
    assert.match(queries[3]?.sql || '', /ILIKE \? ESCAPE \?/);
    assert.doesNotMatch(queries[3]?.sql || '', /&@~/);
    assert.ok(queries[1]?.values?.includes('%100\\%\\_complete%'));
    assert.ok(queries[1]?.values?.includes('\\'));
});
