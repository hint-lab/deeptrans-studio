import pkg from '@prisma/client';
import type { Prisma as PrismaClientTypes } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertEmbeddingVector } from '@/lib/embedding-contract';
import {
    fuseHybridSearchResults,
    normalizeHybridSearchConfig,
    type KeywordMatchType,
} from '@/lib/hybrid-search-ranking';
import { createLogger } from '@/lib/logger';
import type {
    BM25Result,
    HybridSearchConfig,
    SearchResult,
    VectorResult,
} from '@/types/hybrid-search';

const { Prisma } = pkg as unknown as { Prisma: any };

const logger = createLogger(
    { type: 'lib:postgres-vector' },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

type SearchScope = {
    memoryId?: string;
    memoryIds?: string[];
    userId?: string;
    tenantId?: string | null;
};

const VECTOR_UPSERT_BATCH_SIZE = 50;

export type TranslationMemoryVectorPoint = {
    id: string;
    text?: string;
    vector: number[];
    meta?: Record<string, any>;
};

/**
 * The import receipt path supplies a Prisma interactive transaction here so
 * entry creation, embedding updates, and its durable acknowledgement share
 * one commit. Keep this intentionally small: the helper only needs raw SQL.
 */
export type TranslationMemoryVectorWriteClient = {
    $executeRaw(query: PrismaClientTypes.Sql): Promise<unknown>;
};

function vectorLiteral(vector: number[]) {
    const values = vector.map(v => {
        const fixed = Number(v.toFixed(8));
        return Object.is(fixed, -0) ? 0 : fixed;
    });
    return `[${values.join(',')}]`;
}

function textForRow(row: { sourceText?: string | null; targetText?: string | null }) {
    return `${String(row.sourceText || '')}\n${String(row.targetText || '')}`.trim();
}

function metaForRow(row: {
    memoryId?: string | null;
    sourceLang?: string | null;
    targetLang?: string | null;
    tenantId?: string | null;
    userId?: string | null;
}) {
    return {
        memoryId: row.memoryId || null,
        sourceLang: row.sourceLang || null,
        targetLang: row.targetLang || null,
        tenantId: row.tenantId || null,
        userId: row.userId || null,
    };
}

function scopeSql(scope?: SearchScope) {
    const clauses: any[] = [];
    const memoryIds = Array.isArray(scope?.memoryIds)
        ? [...new Set(scope.memoryIds.map(String).filter(Boolean))]
        : [];
    if (Array.isArray(scope?.memoryIds)) {
        if (!memoryIds.length) return Prisma.sql`AND FALSE`;
        clauses.push(Prisma.sql`e."memoryId" IN (${Prisma.join(memoryIds)})`);
    } else if (scope?.memoryId) {
        clauses.push(Prisma.sql`e."memoryId" = ${scope.memoryId}`);
    }
    if (scope?.userId) clauses.push(Prisma.sql`m."userId" = ${scope.userId}`);
    if (scope?.tenantId) clauses.push(Prisma.sql`m."tenantId" = ${scope.tenantId}`);
    if (!clauses.length) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}`;
}

function scopeFromFilter(filter?: string): SearchScope {
    if (!filter) return {};
    const match = String(filter).match(/%([^%"]+)%/);
    return match?.[1] ? { memoryId: match[1] } : {};
}

function assertTranslationMemoryVectorPoints(points: TranslationMemoryVectorPoint[]) {
    if (!points.length) return;

    const pointIds = new Set<string>();
    for (const point of points) {
        if (!point.id) throw new Error('translation memory vector write: missing point id');
        if (pointIds.has(point.id)) {
            throw new Error(`translation memory vector write: duplicate point id ${point.id}`);
        }
        pointIds.add(point.id);
        assertEmbeddingVector(point.vector, 'translation memory vector write');
    }
}

export async function upsertTranslationMemoryVectorsWithClient(
    client: TranslationMemoryVectorWriteClient,
    points: TranslationMemoryVectorPoint[]
) {
    if (!points.length) return;
    assertTranslationMemoryVectorPoints(points);

    logger.info(`[PGVECTOR] Upserting ${points.length} translation memory embeddings`);

    const batches: (typeof points)[] = [];
    for (let index = 0; index < points.length; index += VECTOR_UPSERT_BATCH_SIZE) {
        batches.push(points.slice(index, index + VECTOR_UPSERT_BATCH_SIZE));
    }

    const updatedCounts: number[] = [];
    for (const batch of batches) {
        const updatedCount = await client.$executeRaw(
            Prisma.sql`
                UPDATE "TranslationMemoryEntry" AS entry
                SET embedding = incoming.embedding
                FROM (
                    VALUES ${Prisma.join(
                        batch.map(
                            point =>
                                Prisma.sql`(${point.id}::text, ${vectorLiteral(point.vector)}::vector(2048))`
                        )
                    )}
                ) AS incoming(id, embedding)
                WHERE entry.id = incoming.id
            `
        );
        updatedCounts.push(Number(updatedCount || 0));
    }

    const updated = updatedCounts.reduce((sum, count) => sum + Number(count || 0), 0);
    if (updated !== points.length) {
        throw new Error(
            `translation memory vector write: expected ${points.length} updated rows, received ${updated}`
        );
    }
}

export async function upsertVectors(params: {
    collection: string;
    points: TranslationMemoryVectorPoint[];
}) {
    if (params.collection !== 'TranslationMemory') {
        throw new Error(`Unsupported vector collection: ${params.collection}`);
    }
    if (!params.points.length) return;

    await prisma.$transaction(async (transaction: PrismaClientTypes.TransactionClient) => {
        await upsertTranslationMemoryVectorsWithClient(transaction, params.points);
    });
}

export async function searchVectors(params: {
    collection: string;
    vector: number[];
    k?: number;
    filter?: string;
    metric?: 'COSINE';
    ef?: number;
    memoryId?: string;
    memoryIds?: string[];
    userId?: string;
    tenantId?: string | null;
}) {
    if (params.collection !== 'TranslationMemory') return [];
    assertEmbeddingVector(params.vector, 'translation memory vector search');

    const k = Math.max(1, Math.min(200, params.k || 10));
    const scope = { ...scopeFromFilter(params.filter), ...params };
    const queryVector = vectorLiteral(params.vector);

    const vectorQuery = Prisma.sql`
            SELECT
                e.id,
                e."sourceText",
                e."targetText",
                e."memoryId",
                e."sourceLang",
                e."targetLang",
                m."tenantId",
                m."userId",
                1 - ((e.embedding::halfvec(2048)) <=> (${queryVector}::halfvec(2048))) AS score
            FROM "TranslationMemoryEntry" e
            JOIN "TranslationMemory" m ON m.id = e."memoryId"
            WHERE e.embedding IS NOT NULL
            ${scopeSql(scope)}
            ORDER BY (e.embedding::halfvec(2048)) <=> (${queryVector}::halfvec(2048))
            LIMIT ${k}
        `;
    // HNSW cannot return a reliable top-k when its search budget is smaller
    // than the number of neighbours we request. Honour a larger configured
    // budget, but never lower it below this query's effective `k`.
    const configuredEf = Math.max(1, Math.min(10_000, Math.floor(Number(params.ef) || 128)));
    const ef = Math.max(k, configuredEf);
    const rows = (await prisma.$transaction(
        async (transaction: PrismaClientTypes.TransactionClient) => {
            // This setting is local to the transaction and makes the configured
            // HNSW recall budget real without leaking it to another request.
            await transaction.$executeRaw(
                Prisma.sql`SELECT set_config('hnsw.ef_search', ${String(ef)}, true)`
            );
            return transaction.$queryRaw(vectorQuery);
        }
    )) as Array<any>;

    return rows.map(row => ({
        id: String(row.id),
        // Cosine similarity is the only vector signal surfaced as a percentage
        // in the UI. Clamp floating-point edge cases before it leaves storage.
        score: Math.max(0, Math.min(1, Number(row.score || 0))),
        text: textForRow(row),
        meta: metaForRow(row),
    }));
}

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

function tokenizeCjkBigrams(text: string): string[] {
    const bigrams: string[] = [];
    for (const match of text.matchAll(CJK_RUN)) {
        const chars = Array.from(match[0]);
        for (let index = 0; index < chars.length - 1 && bigrams.length < 50; index += 1) {
            const bigram = `${chars[index] || ''}${chars[index + 1] || ''}`;
            if (bigram.trim().length >= 2) bigrams.push(bigram);
        }
        if (bigrams.length >= 50) break;
    }
    return bigrams;
}

function tokenizeQuery(query: string): string[] {
    const text = String(query || '').toLowerCase();
    const words = text.split(/[\s,.;:!?，。；：！？、()\[\]{}"'""''<>\-_/]+/).filter(Boolean);
    return Array.from(new Set([...words, ...tokenizeCjkBigrams(text)])).slice(0, 30);
}

const MAX_KEYWORD_QUERY_LENGTH = 500;
const FUZZY_MATCH_THRESHOLD = 0.3;

function clampUnitInterval(value: number) {
    return Math.max(0, Math.min(1, value));
}

function normalizeKeywordBoost(value: number | undefined) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(10, numeric)) : 1;
}

function applyKeywordBoost(score: number, boostFactor: number | undefined) {
    return clampUnitInterval(clampUnitInterval(score) * normalizeKeywordBoost(boostFactor));
}

/**
 * Escapes ILIKE wildcard syntax while retaining parameterized SQL. This keeps
 * a literal query such as `100%_complete` from broadening the requested match.
 */
function escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, character => `\\${character}`);
}

function calculateContainsKeywordScore(query: string, text: string, boostFactor?: number): number {
    const queryTokens = tokenizeQuery(query);
    const textLower = String(text || '').toLowerCase();
    if (!queryTokens.length || !textLower) return 0;

    let hits = 0;
    let positionQuality = 0;
    for (const token of queryTokens) {
        const index = textLower.indexOf(token);
        if (index >= 0) {
            hits += 1;
            positionQuality += 1 / (1 + index / 200);
        }
    }
    if (!hits) return 0;

    const coverage = hits / queryTokens.length;
    const averagePositionQuality = positionQuality / hits;
    return applyKeywordBoost(0.7 * coverage + 0.3 * averagePositionQuality, boostFactor);
}

function calculatePhraseKeywordScore(query: string, text: string, boostFactor?: number): number {
    const normalizedQuery = String(query || '').toLowerCase();
    const normalizedText = String(text || '').toLowerCase();
    if (!normalizedQuery || !normalizedText) return 0;

    const index = normalizedText.indexOf(normalizedQuery);
    if (index < 0) return 0;

    // A full phrase at the beginning is the strongest lexical signal. Keep
    // even later phrase matches useful without presenting this as a semantic
    // similarity percentage.
    const positionQuality = 1 / (1 + index / 200);
    return applyKeywordBoost(0.8 + 0.2 * positionQuality, boostFactor);
}

function calculateExactKeywordScore(boostFactor?: number): number {
    return applyKeywordBoost(1, boostFactor);
}

function extractHighlights(query: string, text: string): string[] {
    const textLower = String(text || '').toLowerCase();
    return tokenizeQuery(query).filter(token => textLower.includes(token));
}

export async function searchKeywords(params: {
    collection: string;
    query: string;
    k?: number;
    filter?: string;
    matchType?: KeywordMatchType;
    boostFactor?: number;
    memoryId?: string;
    memoryIds?: string[];
    userId?: string;
    tenantId?: string | null;
}): Promise<BM25Result[]> {
    if (params.collection !== 'TranslationMemory') return [];
    const query = String(params.query || '')
        .trim()
        .slice(0, MAX_KEYWORD_QUERY_LENGTH);
    if (!query) return [];

    const k = Math.max(1, Math.min(200, params.k || 10));
    const candidateLimit = Math.min(1000, Math.max(k * 5, 50));
    const scope = { ...scopeFromFilter(params.filter), ...params };
    const matchType: NonNullable<KeywordMatchType> =
        params.matchType === 'exact' ||
        params.matchType === 'phrase' ||
        params.matchType === 'fuzzy' ||
        params.matchType === 'contains'
            ? params.matchType
            : 'contains';
    const sourceOrTargetColumns = Prisma.sql`
        e.id,
        e."sourceText",
        e."targetText",
        e."memoryId",
        e."sourceLang",
        e."targetLang",
        m."tenantId",
        m."userId"
    `;
    const fromMemoryEntries = Prisma.sql`
        FROM "TranslationMemoryEntry" e
        JOIN "TranslationMemory" m ON m.id = e."memoryId"
    `;
    const selectRows = (predicate: any, orderBy: any, limit: number) =>
        prisma.$queryRaw(
            Prisma.sql`
                SELECT ${sourceOrTargetColumns}
                ${fromMemoryEntries}
                WHERE ${predicate}
                ${scopeSql(scope)}
                ${orderBy}
                LIMIT ${limit}
            `
        ) as Promise<Array<any>>;

    let rows: Array<any> = [];
    let scoreForRow: (row: any) => number;

    switch (matchType) {
        case 'exact': {
            rows = await selectRows(
                Prisma.sql`(
                    LOWER(e."sourceText") = LOWER(${query})
                    OR LOWER(e."targetText") = LOWER(${query})
                )`,
                Prisma.sql`ORDER BY e."updatedAt" DESC`,
                k
            );
            scoreForRow = () => calculateExactKeywordScore(params.boostFactor);
            break;
        }
        case 'phrase': {
            const phrasePattern = `%${escapeLikePattern(query)}%`;
            rows = await selectRows(
                Prisma.sql`(
                    e."sourceText" ILIKE ${phrasePattern} ESCAPE ${'\\'}
                    OR e."targetText" ILIKE ${phrasePattern} ESCAPE ${'\\'}
                )`,
                Prisma.sql`ORDER BY e."updatedAt" DESC`,
                candidateLimit
            );
            scoreForRow = row =>
                calculatePhraseKeywordScore(query, textForRow(row), params.boostFactor);
            break;
        }
        case 'fuzzy': {
            // Trigram matching is lexical tolerance, not embedding similarity.
            // A single character has too little signal and would create a broad,
            // expensive candidate set, so it deliberately has no fuzzy result.
            if (Array.from(query).length < 2) return [];
            const fuzzyScore = Prisma.sql`GREATEST(
                word_similarity(LOWER(${query}), LOWER(e."sourceText")),
                word_similarity(LOWER(${query}), LOWER(e."targetText"))
            )`;
            rows = (await prisma.$queryRaw(
                Prisma.sql`
                    SELECT ${sourceOrTargetColumns}, ${fuzzyScore} AS "fuzzyScore"
                    ${fromMemoryEntries}
                    WHERE ${fuzzyScore} >= ${FUZZY_MATCH_THRESHOLD}
                    ${scopeSql(scope)}
                    ORDER BY "fuzzyScore" DESC, e."updatedAt" DESC
                    LIMIT ${candidateLimit}
                `
            )) as Array<any>;
            scoreForRow = row => applyKeywordBoost(Number(row.fuzzyScore || 0), params.boostFactor);
            break;
        }
        case 'contains':
        default: {
            const tokens = tokenizeQuery(query);
            if (!tokens.length) return [];
            const predicates = tokens.map(token => {
                const pattern = `%${escapeLikePattern(token)}%`;
                return Prisma.sql`(
                    e."sourceText" ILIKE ${pattern} ESCAPE ${'\\'}
                    OR e."targetText" ILIKE ${pattern} ESCAPE ${'\\'}
                )`;
            });
            rows = await selectRows(
                Prisma.sql`(${Prisma.join(predicates, ' OR ')})`,
                Prisma.sql`ORDER BY e."updatedAt" DESC`,
                candidateLimit
            );
            scoreForRow = row =>
                calculateContainsKeywordScore(query, textForRow(row), params.boostFactor);
            break;
        }
    }

    return rows
        .map(row => {
            const text = textForRow(row);
            return {
                id: String(row.id),
                score: scoreForRow(row),
                text,
                meta: metaForRow(row),
                highlights: extractHighlights(query, text),
            };
        })
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}

type HybridSearchParams = {
    collection: string;
    query: string;
    vector?: number[];
    config?: Partial<HybridSearchConfig>;
    filter?: string;
    memoryId?: string;
    memoryIds?: string[];
    userId?: string;
    tenantId?: string | null;
};

export type HybridSearchExecution = {
    results: SearchResult[];
    configuredMode: 'vector' | 'keyword' | 'hybrid';
    effectiveMode: 'vector' | 'keyword' | 'hybrid';
    unavailableLegs: Array<'vector' | 'keyword'>;
};

function resolveEffectiveSearchMode(
    configuredMode: HybridSearchExecution['configuredMode'],
    unavailableLegs: HybridSearchExecution['unavailableLegs'],
    requestedLegs: { vector: boolean; keyword: boolean }
): HybridSearchExecution['effectiveMode'] {
    if (configuredMode !== 'hybrid') return configuredMode;

    // `effectiveMode` describes the configured execution path and any real
    // service degradation. It must not be inferred from result count: a
    // healthy vector leg can honestly find zero candidates while the keyword
    // leg finds one. Per-result `source` remains the evidence exposed to UI
    // callers as `searchMode` (vector, keyword, or both).
    const vectorUnavailable = requestedLegs.vector && unavailableLegs.includes('vector');
    const keywordUnavailable = requestedLegs.keyword && unavailableLegs.includes('keyword');

    // A hybrid configuration can intentionally disable one leg. Report the
    // retrieval path that actually ran; callers reserve the degraded warning
    // for a service that was requested but unavailable.
    if (requestedLegs.vector && !requestedLegs.keyword) return 'vector';
    if (requestedLegs.keyword && !requestedLegs.vector) return 'keyword';

    if (vectorUnavailable && !keywordUnavailable && requestedLegs.keyword) return 'keyword';
    if (keywordUnavailable && !vectorUnavailable && requestedLegs.vector) return 'vector';

    return configuredMode;
}

/**
 * Runs the configured retrieval legs and reports any unavailable leg separately
 * from an honest empty result. Callers that need strict vector-only behavior
 * can use the status without silently substituting a keyword search.
 */
export async function hybridSearchWithStatus(
    params: HybridSearchParams
): Promise<HybridSearchExecution> {
    const config = normalizeHybridSearchConfig(params.config);
    const { query, collection, vector, filter, memoryId, memoryIds, userId, tenantId } = params;

    logger.info(`[PGVECTOR] Hybrid search in collection: ${collection}, mode: ${config.mode}`);

    let vectorResults: VectorResult[] = [];
    let keywordResults: BM25Result[] = [];
    const unavailableLegs = new Set<'vector' | 'keyword'>();
    const tasks: Promise<void>[] = [];
    const vectorRequested = config.mode !== 'keyword' && config.vectorSearch.enabled;
    const keywordRequested =
        config.mode !== 'vector' && config.keywordSearch.enabled && Boolean(query.trim());

    if (vectorRequested && !vector?.length) {
        unavailableLegs.add('vector');
    }

    if (vectorRequested && vector?.length) {
        tasks.push(
            searchVectors({
                collection,
                vector,
                k: config.vectorSearch.topK,
                filter,
                metric: config.vectorSearch.metric,
                ef: config.vectorSearch.ef,
                memoryId,
                memoryIds,
                userId,
                tenantId,
            })
                .then(results => {
                    vectorResults = results.map(r => ({ ...r, similarity: r.score }));
                })
                .catch(error => {
                    logger.error('[PGVECTOR] Vector search error:', error);
                    vectorResults = [];
                    unavailableLegs.add('vector');
                })
        );
    }

    if (keywordRequested) {
        tasks.push(
            searchKeywords({
                collection,
                query,
                k: config.keywordSearch.topK,
                filter,
                matchType: config.keywordSearch.matchType,
                boostFactor: config.keywordSearch.boostFactor,
                memoryId,
                memoryIds,
                userId,
                tenantId,
            })
                .then(results => {
                    keywordResults = results;
                })
                .catch(error => {
                    logger.error('[PGVECTOR] Keyword search error:', error);
                    keywordResults = [];
                    unavailableLegs.add('keyword');
                })
        );
    }

    await Promise.all(tasks);

    let results: SearchResult[];
    if (config.mode === 'vector') {
        results = vectorResults.map(r => ({
            ...r,
            source: 'vector' as const,
            originalScore: r.score,
            vectorScore: r.score,
        }));
    } else if (config.mode === 'keyword') {
        results = keywordResults.map(r => ({
            ...r,
            source: 'keyword' as const,
            originalScore: r.score,
            keywordScore: r.score,
        }));
    } else {
        results = fuseHybridSearchResults(vectorResults, keywordResults, config);
    }

    const unavailable = [...unavailableLegs];
    return {
        results,
        configuredMode: config.mode,
        effectiveMode: resolveEffectiveSearchMode(config.mode, unavailable, {
            vector: vectorRequested,
            keyword: keywordRequested,
        }),
        unavailableLegs: unavailable,
    };
}

export async function hybridSearch(params: HybridSearchParams): Promise<SearchResult[]> {
    return (await hybridSearchWithStatus(params)).results;
}
