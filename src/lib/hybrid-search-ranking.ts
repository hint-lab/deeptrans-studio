import type {
    BM25Result,
    HybridSearchConfig,
    SearchResult,
    VectorResult,
} from '@/types/hybrid-search';

export type KeywordMatchType = NonNullable<HybridSearchConfig['keywordSearch']>['matchType'];

export type NormalizedHybridSearchConfig = {
    mode: HybridSearchConfig['mode'];
    vectorSearch: {
        enabled: boolean;
        topK: number;
        metric: 'COSINE';
        ef: number;
        weight: number;
    };
    keywordSearch: {
        enabled: boolean;
        topK: number;
        matchType: NonNullable<KeywordMatchType>;
        boostFactor: number;
        weight: number;
    };
    fusionStrategy: {
        method: 'weighted_sum' | 'rank_fusion' | 'reciprocal_rank_fusion';
        weights: { vectorWeight: number; keywordWeight: number };
        rankFusion: { k: number };
    };
    finalTopK: number;
};

const SEARCH_MODES = new Set<HybridSearchConfig['mode']>(['vector', 'keyword', 'hybrid']);
const FUSION_METHODS = new Set<NormalizedHybridSearchConfig['fusionStrategy']['method']>([
    'weighted_sum',
    'rank_fusion',
    'reciprocal_rank_fusion',
]);
const KEYWORD_MATCH_TYPES = new Set<NonNullable<KeywordMatchType>>([
    'exact',
    'phrase',
    'fuzzy',
    'contains',
]);

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function booleanOrDefault(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeWeights(vectorValue: unknown, keywordValue: unknown) {
    const vectorWeight = boundedNumber(vectorValue, 0.7, 0, 1);
    const keywordWeight = boundedNumber(keywordValue, 0.3, 0, 1);
    const total = vectorWeight + keywordWeight;
    if (total <= 0) return { vectorWeight: 0.7, keywordWeight: 0.3 };
    return { vectorWeight: vectorWeight / total, keywordWeight: keywordWeight / total };
}

/**
 * Deeply normalizes client-supplied search settings. This is deliberately
 * separate from the UI so API callers cannot disable a default retrieval leg
 * by supplying only one nested field or request unbounded candidate pools.
 */
export function normalizeHybridSearchConfig(
    config?: Partial<HybridSearchConfig>
): NormalizedHybridSearchConfig {
    const mode = SEARCH_MODES.has(config?.mode as HybridSearchConfig['mode'])
        ? (config?.mode as HybridSearchConfig['mode'])
        : 'hybrid';
    const matchType = KEYWORD_MATCH_TYPES.has(config?.keywordSearch?.matchType as any)
        ? (config?.keywordSearch?.matchType as NonNullable<KeywordMatchType>)
        : 'contains';
    const fusionMethod = FUSION_METHODS.has(config?.fusionStrategy?.method as any)
        ? (config?.fusionStrategy
              ?.method as NormalizedHybridSearchConfig['fusionStrategy']['method'])
        : 'weighted_sum';
    const vectorWeight = boundedNumber(config?.vectorSearch?.weight, 0.7, 0, 1);
    const keywordWeight = boundedNumber(config?.keywordSearch?.weight, 0.3, 0, 1);

    return {
        mode,
        vectorSearch: {
            enabled: booleanOrDefault(config?.vectorSearch?.enabled, true),
            topK: boundedInteger(config?.vectorSearch?.topK, 10, 1, 200),
            metric: 'COSINE',
            ef: boundedInteger(config?.vectorSearch?.ef, 128, 1, 10_000),
            weight: vectorWeight,
        },
        keywordSearch: {
            enabled: booleanOrDefault(config?.keywordSearch?.enabled, true),
            topK: boundedInteger(config?.keywordSearch?.topK, 10, 1, 200),
            matchType,
            boostFactor: boundedNumber(config?.keywordSearch?.boostFactor, 1, 0, 10),
            weight: keywordWeight,
        },
        fusionStrategy: {
            method: fusionMethod,
            weights: normalizeWeights(
                config?.fusionStrategy?.weights?.vectorWeight ?? vectorWeight,
                config?.fusionStrategy?.weights?.keywordWeight ?? keywordWeight
            ),
            rankFusion: {
                k: boundedInteger(config?.fusionStrategy?.rankFusion?.k, 60, 1, 1_000),
            },
        },
        finalTopK: boundedInteger(config?.finalTopK, 10, 1, 200),
    };
}

type FusedCandidate = SearchResult & {
    vectorRank?: number;
    keywordRank?: number;
};

function sortedByScore<T extends { score: number }>(results: T[]) {
    return [...results].sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
}

function rankContribution(rank: number | undefined, size: number) {
    if (!rank || !size) return 0;
    return (size - rank + 1) / size;
}

function reciprocalRankContribution(rank: number | undefined, k: number) {
    return rank ? 1 / (k + rank) : 0;
}

/**
 * Fuses raw vector and keyword rankings using the method selected in the UI.
 * The returned `score` is always an ordering score; raw evidence remains in
 * `vectorScore` and `keywordScore` for truthful presentation and thresholds.
 */
export function fuseHybridSearchResults(
    vectorResults: VectorResult[],
    keywordResults: BM25Result[],
    config?: Partial<HybridSearchConfig>
): SearchResult[] {
    const normalized = normalizeHybridSearchConfig(config);
    const rankedVectors = sortedByScore(vectorResults);
    const rankedKeywords = sortedByScore(keywordResults);
    const candidates = new Map<string, FusedCandidate>();

    rankedVectors.forEach((result, index) => {
        candidates.set(result.id, {
            id: result.id,
            text: result.text,
            meta: result.meta,
            source: 'vector',
            score: 0,
            originalScore: result.score,
            vectorScore: result.score,
            vectorRank: index + 1,
        });
    });

    rankedKeywords.forEach((result, index) => {
        const existing = candidates.get(result.id);
        if (existing) {
            existing.source = 'hybrid';
            existing.keywordScore = result.score;
            existing.keywordRank = index + 1;
            existing.text = existing.text || result.text;
            existing.meta = existing.meta || result.meta;
            return;
        }
        candidates.set(result.id, {
            id: result.id,
            text: result.text,
            meta: result.meta,
            source: 'keyword',
            score: 0,
            originalScore: result.score,
            keywordScore: result.score,
            keywordRank: index + 1,
        });
    });

    for (const candidate of candidates.values()) {
        const vectorScore = Number(candidate.vectorScore || 0);
        const keywordScore = Number(candidate.keywordScore || 0);
        candidate.originalScore = Math.max(vectorScore, keywordScore);

        switch (normalized.fusionStrategy.method) {
            case 'rank_fusion':
                candidate.score =
                    rankContribution(candidate.vectorRank, rankedVectors.length) +
                    rankContribution(candidate.keywordRank, rankedKeywords.length);
                break;
            case 'reciprocal_rank_fusion':
                candidate.score =
                    reciprocalRankContribution(
                        candidate.vectorRank,
                        normalized.fusionStrategy.rankFusion.k
                    ) +
                    reciprocalRankContribution(
                        candidate.keywordRank,
                        normalized.fusionStrategy.rankFusion.k
                    );
                break;
            case 'weighted_sum':
            default:
                candidate.score =
                    vectorScore * normalized.fusionStrategy.weights.vectorWeight +
                    keywordScore * normalized.fusionStrategy.weights.keywordWeight;
                break;
        }
    }

    return [...candidates.values()]
        .sort(
            (left, right) =>
                Number(right.score || 0) - Number(left.score || 0) ||
                Number(right.originalScore || 0) - Number(left.originalScore || 0)
        )
        .slice(0, normalized.finalTopK)
        .map(({ vectorRank: _vectorRank, keywordRank: _keywordRank, ...result }) => result);
}
