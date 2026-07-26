export type MemorySearchHighlightSegment = {
    text: string;
    highlighted: boolean;
};

// Retrieval errors cross several boundaries (server actions, API routes, and
// the post-edit workflow). Keep the user-facing vocabulary deliberately small
// so an unexpected database/provider error never turns into a browser-visible
// implementation detail or, worse, a misleading "no matches" result.
export const MEMORY_SEARCH_UNAVAILABLE_MESSAGE = '检索服务暂不可用，请稍后重试';
export const MEMORY_SEARCH_CONFIGURATION_MESSAGE = '请至少启用一种检索方式';
export const MEMORY_SEARCH_INCOMPLETE_MESSAGE =
    '部分检索服务暂不可用，无法确认是否存在相关结果，请稍后重试';
export const MEMORY_PROJECT_BINDING_UNAVAILABLE_MESSAGE =
    '当前项目关联的记忆库不可访问。请在项目资源中移除旧绑定，并绑定自己的记忆库后重试。';
export const MEMORY_VECTOR_SEARCH_UNAVAILABLE_MESSAGES = [
    '语义检索暂不可用，请检查嵌入服务后重试',
    '语义检索暂不可用，请检查向量索引后重试',
] as const;

/**
 * A successful keyword fallback is useful while another retrieval leg is
 * unavailable.  An empty fallback is different: it cannot prove that the
 * unavailable leg would have found nothing.  Keep that state out of the
 * ordinary "no matches" branch so discourse review does not make a false
 * negative claim when a vector index or keyword service is down.
 */
export function hasIncompleteMemorySearchResult(
    resultCount: unknown,
    unavailableLegs: unknown
) {
    if (
        typeof resultCount !== 'number' ||
        !Number.isFinite(resultCount) ||
        resultCount !== 0
    ) {
        return false;
    }
    if (!Array.isArray(unavailableLegs)) return false;

    return unavailableLegs.some(leg => leg === 'vector' || leg === 'keyword');
}

function errorText(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (value instanceof Error) return value.message.trim();
    return '';
}

/**
 * Converts an arbitrary retrieval failure to a message that is safe to show
 * to a signed-in user. The length error is intentionally preserved because it
 * is an actionable client input issue; provider and database messages are not.
 */
export function memorySearchPublicErrorMessage(error: unknown) {
    const message = errorText(error);
    if (/^查询内容不能超过 \d+ 个字符$/.test(message)) return message;
    if (
        message === MEMORY_SEARCH_UNAVAILABLE_MESSAGE ||
        message === MEMORY_SEARCH_CONFIGURATION_MESSAGE ||
        message === MEMORY_SEARCH_INCOMPLETE_MESSAGE ||
        message === MEMORY_PROJECT_BINDING_UNAVAILABLE_MESSAGE ||
        MEMORY_VECTOR_SEARCH_UNAVAILABLE_MESSAGES.includes(
            message as (typeof MEMORY_VECTOR_SEARCH_UNAVAILABLE_MESSAGES)[number]
        )
    ) {
        return message;
    }
    return MEMORY_SEARCH_UNAVAILABLE_MESSAGE;
}

/**
 * Stable failure shape for HTTP callers.  A retrieval failure is not a valid
 * empty result, and raw provider/database errors must never cross an API
 * boundary just because they happened before the search service could return
 * its own `{ success: false }` result.
 */
export function memorySearchFailurePayload(error: unknown) {
    return {
        success: false as const,
        error: memorySearchPublicErrorMessage(error),
        data: [] as unknown[],
    };
}

/**
 * Lets a client workflow surface only known-safe retrieval failures while
 * retaining generic handling for unrelated agent or persistence failures.
 */
export function isPublicMemorySearchErrorMessage(error: unknown) {
    const message = errorText(error);
    return (
        /^查询内容不能超过 \d+ 个字符$/.test(message) ||
        message === MEMORY_SEARCH_UNAVAILABLE_MESSAGE ||
        message === MEMORY_SEARCH_CONFIGURATION_MESSAGE ||
        message === MEMORY_SEARCH_INCOMPLETE_MESSAGE ||
        message === MEMORY_PROJECT_BINDING_UNAVAILABLE_MESSAGE ||
        MEMORY_VECTOR_SEARCH_UNAVAILABLE_MESSAGES.includes(
            message as (typeof MEMORY_VECTOR_SEARCH_UNAVAILABLE_MESSAGES)[number]
        )
    );
}

/**
 * Preserve a known-safe retrieval failure through a larger workflow while
 * collapsing every other error to that workflow's ordinary public fallback.
 */
export function memorySearchErrorOrFallback(error: unknown, fallback: string) {
    const message = errorText(error);
    return isPublicMemorySearchErrorMessage(message) ? message : fallback;
}

type HybridCandidateConfig = {
    finalTopK?: number;
    vectorSearch?: { topK?: number; [key: string]: unknown };
    keywordSearch?: { topK?: number; [key: string]: unknown };
    [key: string]: unknown;
};

function positiveInteger(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

/**
 * A user-facing result limit must not be silently reduced by the default
 * hybrid-search candidate pool. Keep the configured options, but ensure both
 * retrieval legs and fusion have enough candidates to honour that limit.
 */
export function expandMemorySearchCandidatePool<T extends HybridCandidateConfig>(
    config: T | undefined,
    minimumCandidates: number
): T {
    const minimum = Math.max(1, positiveInteger(minimumCandidates));
    const vectorSearch = config?.vectorSearch;
    const keywordSearch = config?.keywordSearch;

    return {
        ...(config || ({} as T)),
        finalTopK: Math.max(minimum, positiveInteger(config?.finalTopK)),
        vectorSearch: {
            ...(vectorSearch || {}),
            topK: Math.max(minimum, positiveInteger(vectorSearch?.topK)),
        },
        keywordSearch: {
            ...(keywordSearch || {}),
            topK: Math.max(minimum, positiveInteger(keywordSearch?.topK)),
        },
    } as T;
}

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(value: string) {
    return value.replace(REGEXP_SPECIAL_CHARACTERS, '\\$&');
}

function getSearchTerms(query: string) {
    return Array.from(
        new Set(
            String(query || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map(term => term.toLowerCase())
        )
    ).sort((left, right) => right.length - left.length);
}

/**
 * Splits a result into plain-text and matched segments for React to render safely.
 * Search terms are escaped before building the matcher so literal terms such as
 * `C++`, `[draft]`, and `a.b` do not change its meaning.
 */
export function splitMemorySearchHighlights(
    text: string,
    query: string
): MemorySearchHighlightSegment[] {
    const value = String(text || '');
    const terms = getSearchTerms(query);
    if (!terms.length) return [{ text: value, highlighted: false }];

    const matcher = new RegExp(terms.map(escapeRegExp).join('|'), 'gi');
    const segments: MemorySearchHighlightSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(value)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ text: value.slice(lastIndex, match.index), highlighted: false });
        }
        segments.push({ text: match[0], highlighted: true });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < value.length) {
        segments.push({ text: value.slice(lastIndex), highlighted: false });
    }

    return segments.length ? segments : [{ text: value, highlighted: false }];
}

/**
 * Search responses are expected to contain a numeric score. Missing or malformed
 * scores must not bypass a positive similarity threshold.
 */
export function meetsMemorySimilarityThreshold(score: unknown, threshold: number) {
    return typeof score === 'number' && Number.isFinite(score) && score >= threshold;
}

type MemorySearchScore = {
    score?: unknown;
    vectorScore?: unknown;
    keywordScore?: unknown;
    searchMode?: unknown;
};

export type MemorySearchDisplaySignal =
    | { kind: 'semantic'; score: number }
    | { kind: 'keyword' }
    | { kind: 'match' };

function finiteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The hybrid `score` is a fusion value used to order results. It is not a
 * semantic-similarity percentage, so never surface it as one. Prefer the raw
 * vector signal when available; keyword retrieval is intentionally presented
 * as a match type instead of a calibrated percentage.
 */
export function memorySearchDisplaySignal(result: MemorySearchScore): MemorySearchDisplaySignal {
    const vectorScore = finiteNumber(result.vectorScore);
    if (vectorScore !== undefined) {
        return { kind: 'semantic', score: Math.max(0, Math.min(1, vectorScore)) };
    }

    if (finiteNumber(result.keywordScore) !== undefined || result.searchMode === 'keyword') {
        return { kind: 'keyword' };
    }

    return { kind: 'match' };
}

/**
 * Human-readable retrieval evidence for chat responses. Keep this separate
 * from fusion ordering so a weighted score is never called a similarity.
 */
export function formatMemorySearchDisplaySignal(result: MemorySearchScore, locale: 'zh' | 'en') {
    const signal = memorySearchDisplaySignal(result);
    if (signal.kind === 'semantic') {
        const label = locale === 'zh' ? '语义相似度' : 'Semantic similarity';
        return `${label} ${Math.round(signal.score * 100)}%`;
    }
    if (signal.kind === 'keyword') {
        return locale === 'zh' ? '关键词匹配' : 'Keyword match';
    }
    return locale === 'zh' ? '检索命中' : 'Retrieved match';
}

/**
 * A hybrid result's `score` is a weighted fusion value, not necessarily a raw
 * similarity value.  Keep the strongest available raw signal when deciding
 * whether a discourse reference is useful, otherwise a keyword-only result
 * can be discarded merely because its configured fusion weight is small.
 */
export function memorySearchRelevanceScore(result: MemorySearchScore) {
    const rawSignals = [result.vectorScore, result.keywordScore].filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    if (rawSignals.length) return Math.max(...rawSignals);

    // Legacy/fallback callers may only have one ranking score. New hybrid
    // results always carry their raw evidence, so do not let rank-fusion or
    // RRF ordering values masquerade as a relevance signal.
    return finiteNumber(result.score) ?? 0;
}

/**
 * Apply a user-facing threshold to the best available raw retrieval signal.
 * Weighted fusion scores are useful for ordering, but a keyword-only result
 * must not disappear merely because the keyword weight is below the slider.
 */
export function meetsMemorySearchRelevanceThreshold(result: MemorySearchScore, threshold: number) {
    return memorySearchRelevanceScore(result) >= threshold;
}

export function meetsDiscourseMemoryQuality(result: MemorySearchScore, threshold = 0.4) {
    return memorySearchRelevanceScore(result) >= threshold;
}

/**
 * Build the keyword fallback query so terms can match either side of a translation
 * memory pair. The caller retains its existing owner or library scope.
 */
export function buildMemoryKeywordFallbackClauses(tokens: readonly string[]) {
    return Array.from(new Set(tokens.filter(Boolean))).flatMap(token => [
        { sourceText: { contains: token, mode: 'insensitive' as const } },
        { targetText: { contains: token, mode: 'insensitive' as const } },
    ]);
}

export function tokenizeMemorySearchText(text: string) {
    const normalized = String(text || '').toLowerCase();
    const words = normalized.split(/[\s,.;:!?，。；：！、()\[\]{}"'“”‘’<>\-_/]+/).filter(Boolean);
    const chars = Array.from(normalized.replace(/\s+/g, ''));
    const bigrams: string[] = [];

    for (let index = 0; index < Math.min(Math.max(0, chars.length - 1), 50); index += 1) {
        const bigram = `${chars[index] || ''}${chars[index + 1] || ''}`;
        if (bigram.trim().length >= 2) bigrams.push(bigram);
    }

    return Array.from(new Set([...words, ...bigrams]));
}

/**
 * Keyword fallback searches both sides of a translation pair, so its ranking
 * must do the same. Otherwise a target-only reference receives a false zero.
 */
export function scoreMemoryKeywordFallback(
    queryTokens: readonly string[],
    sourceText: string,
    targetText: string
) {
    const tokenSet = new Set(queryTokens);
    const entryTokens = tokenizeMemorySearchText(`${sourceText}\n${targetText}`);
    const matched = entryTokens.filter(token => tokenSet.has(token));
    const recall = matched.length / Math.max(1, queryTokens.length);
    const precision = matched.length / Math.max(1, entryTokens.length);
    const f1 = (2 * recall * precision) / Math.max(1e-6, recall + precision);

    return 0.6 * recall + 0.4 * f1;
}
