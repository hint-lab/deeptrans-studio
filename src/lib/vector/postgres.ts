import pkg from '@prisma/client';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import {
    BM25Result,
    DEFAULT_HYBRID_CONFIG,
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
    userId?: string;
    tenantId?: string | null;
};

function vectorLiteral(vector: number[]) {
    const values = vector
        .map(v => Number(v))
        .filter(v => Number.isFinite(v))
        .map(v => {
            const fixed = Number(v.toFixed(8));
            return Object.is(fixed, -0) ? 0 : fixed;
        });
    if (!values.length) throw new Error('EMPTY_VECTOR');
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
    if (scope?.memoryId) clauses.push(Prisma.sql`e."memoryId" = ${scope.memoryId}`);
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

export async function upsertVectors(params: {
    collection: string;
    points: Array<{ id: string; text?: string; vector: number[]; meta?: Record<string, any> }>;
}) {
    if (params.collection !== 'TranslationMemory') {
        throw new Error(`Unsupported vector collection: ${params.collection}`);
    }

    const points = params.points.filter(p => p.id && Array.isArray(p.vector) && p.vector.length);
    if (!points.length) return;

    logger.info(`[PGVECTOR] Upserting ${points.length} translation memory embeddings`);

    await prisma.$transaction(
        points.map(point =>
            prisma.$executeRaw(
                Prisma.sql`
                    UPDATE "TranslationMemoryEntry"
                    SET embedding = ${vectorLiteral(point.vector)}::vector
                    WHERE id = ${point.id}
                `
            )
        )
    );
}

export async function searchVectors(params: {
    collection: string;
    vector: number[];
    k?: number;
    filter?: string;
    metric?: 'L2' | 'IP' | 'COSINE';
    ef?: number;
    memoryId?: string;
    userId?: string;
    tenantId?: string | null;
}) {
    if (params.collection !== 'TranslationMemory') return [];
    if (!Array.isArray(params.vector) || !params.vector.length) return [];

    const k = Math.max(1, Math.min(200, params.k || 10));
    const scope = { ...scopeFromFilter(params.filter), ...params };
    const queryVector = vectorLiteral(params.vector);

    const rows = (await prisma.$queryRaw(
        Prisma.sql`
            SELECT
                e.id,
                e."sourceText",
                e."targetText",
                e."memoryId",
                e."sourceLang",
                e."targetLang",
                m."tenantId",
                m."userId",
                1 - (e.embedding <=> ${queryVector}::vector) AS score
            FROM "TranslationMemoryEntry" e
            JOIN "TranslationMemory" m ON m.id = e."memoryId"
            WHERE e.embedding IS NOT NULL
            ${scopeSql(scope)}
            ORDER BY e.embedding <=> ${queryVector}::vector
            LIMIT ${k}
        `
    )) as Array<any>;

    return rows.map(row => ({
        id: String(row.id),
        score: Number(row.score || 0),
        text: textForRow(row),
        meta: metaForRow(row),
    }));
}

function tokenizeQuery(query: string): string[] {
    const text = String(query || '').toLowerCase();
    const words = text.split(/[\s,.;:!?，。；：！？、()\[\]{}"'""''<>\-_/]+/).filter(Boolean);
    const chars = Array.from(text.replace(/\s+/g, ''));
    const bigrams: string[] = [];
    for (let i = 0; i < Math.min(chars.length - 1, 50); i++) {
        const bigram = (chars[i] || '') + (chars[i + 1] || '');
        if (bigram.trim().length >= 2) bigrams.push(bigram);
    }
    return Array.from(new Set([...words, ...bigrams])).slice(0, 30);
}

function calculateKeywordScore(query: string, text: string, boostFactor = 1.0): number {
    const queryTokens = tokenizeQuery(query);
    const textLower = String(text || '').toLowerCase();
    if (!queryTokens.length || !textLower) return 0;

    let hits = 0;
    let weighted = 0;
    for (const token of queryTokens) {
        const index = textLower.indexOf(token);
        if (index >= 0) {
            hits += 1;
            weighted += 1 / (1 + index / 200);
        }
    }
    return boostFactor * (0.7 * (hits / queryTokens.length) + 0.3 * weighted);
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
    matchType?: 'exact' | 'phrase' | 'fuzzy' | 'contains';
    boostFactor?: number;
    memoryId?: string;
    userId?: string;
    tenantId?: string | null;
}): Promise<BM25Result[]> {
    if (params.collection !== 'TranslationMemory') return [];
    const tokens = tokenizeQuery(params.query);
    if (!tokens.length) return [];

    const k = Math.max(1, Math.min(200, params.k || 10));
    const scope = { ...scopeFromFilter(params.filter), ...params };
    const pgroongaQuery = tokens.join(' OR ');

    const rows = (await prisma.$queryRaw(
        Prisma.sql`
            SELECT
                e.id,
                e."sourceText",
                e."targetText",
                e."memoryId",
                e."sourceLang",
                e."targetLang",
                m."tenantId",
                m."userId"
            FROM "TranslationMemoryEntry" e
            JOIN "TranslationMemory" m ON m.id = e."memoryId"
            WHERE (e."sourceText" &@~ ${pgroongaQuery} OR e."targetText" &@~ ${pgroongaQuery})
            ${scopeSql(scope)}
            ORDER BY e."updatedAt" DESC
            LIMIT ${Math.max(k * 5, 50)}
        `
    )) as Array<any>;

    return rows
        .map(row => {
            const text = textForRow(row);
            return {
                id: String(row.id),
                score: calculateKeywordScore(params.query, text, params.boostFactor || 1),
                text,
                meta: metaForRow(row),
                highlights: extractHighlights(params.query, text),
            };
        })
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}

export async function hybridSearch(params: {
    collection: string;
    query: string;
    vector?: number[];
    config?: Partial<HybridSearchConfig>;
    filter?: string;
    memoryId?: string;
    userId?: string;
    tenantId?: string | null;
}): Promise<SearchResult[]> {
    const config = { ...DEFAULT_HYBRID_CONFIG, ...params.config };
    const { query, collection, vector, filter, memoryId, userId, tenantId } = params;

    logger.info(`[PGVECTOR] Hybrid search in collection: ${collection}, mode: ${config.mode}`);

    let vectorResults: VectorResult[] = [];
    let keywordResults: BM25Result[] = [];
    const tasks: Promise<void>[] = [];

    if (config.mode !== 'keyword' && config.vectorSearch?.enabled && vector?.length) {
        tasks.push(
            searchVectors({
                collection,
                vector,
                k: config.vectorSearch.topK,
                filter,
                metric: config.vectorSearch.metric,
                ef: config.vectorSearch.ef,
                memoryId,
                userId,
                tenantId,
            })
                .then(results => {
                    vectorResults = results.map(r => ({ ...r, similarity: r.score }));
                })
                .catch(error => {
                    logger.error('[PGVECTOR] Vector search error:', error);
                    vectorResults = [];
                })
        );
    }

    if (config.mode !== 'vector' && config.keywordSearch?.enabled && query.trim()) {
        tasks.push(
            searchKeywords({
                collection,
                query,
                k: config.keywordSearch.topK,
                filter,
                matchType: config.keywordSearch.matchType,
                boostFactor: config.keywordSearch.boostFactor,
                memoryId,
                userId,
                tenantId,
            })
                .then(results => {
                    keywordResults = results;
                })
                .catch(error => {
                    logger.error('[PGVECTOR] Keyword search error:', error);
                    keywordResults = [];
                })
        );
    }

    await Promise.all(tasks);

    if (config.mode === 'vector') {
        return vectorResults.map(r => ({
            ...r,
            source: 'vector' as const,
            originalScore: r.score,
            vectorScore: r.score,
        }));
    }

    if (config.mode === 'keyword') {
        return keywordResults.map(r => ({
            ...r,
            source: 'keyword' as const,
            originalScore: r.score,
            keywordScore: r.score,
        }));
    }

    return fuseResults(vectorResults, keywordResults, config);
}

function fuseResults(
    vectorResults: VectorResult[],
    keywordResults: BM25Result[],
    config: HybridSearchConfig
): SearchResult[] {
    const finalTopK = config.finalTopK || 10;
    const byId = new Map<string, SearchResult>();
    const vectorWeight = config.fusionStrategy?.weights?.vectorWeight ?? 0.7;
    const keywordWeight = config.fusionStrategy?.weights?.keywordWeight ?? 0.3;

    for (const result of vectorResults) {
        byId.set(result.id, {
            ...result,
            source: 'vector',
            score: result.score * vectorWeight,
            originalScore: result.score,
            vectorScore: result.score,
        });
    }

    for (const result of keywordResults) {
        const existing = byId.get(result.id);
        if (existing) {
            existing.source = 'hybrid';
            existing.keywordScore = result.score;
            existing.score += result.score * keywordWeight;
            existing.text = existing.text || result.text;
            existing.meta = existing.meta || result.meta;
        } else {
            byId.set(result.id, {
                ...result,
                source: 'keyword',
                score: result.score * keywordWeight,
                originalScore: result.score,
                keywordScore: result.score,
            });
        }
    }

    return Array.from(byId.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, finalTopK);
}
