import { prisma } from '@/lib/db';
import { requireOwnedProject } from '@/lib/guards';
import { normalizeHybridSearchConfig } from '@/lib/hybrid-search-ranking';
import { createLogger } from '@/lib/logger';
import {
    expandMemorySearchCandidatePool,
    hasIncompleteMemorySearchResult,
    MEMORY_PROJECT_BINDING_UNAVAILABLE_MESSAGE,
    MEMORY_SEARCH_CONFIGURATION_MESSAGE,
    MEMORY_SEARCH_INCOMPLETE_MESSAGE,
    MEMORY_SEARCH_UNAVAILABLE_MESSAGE,
    memorySearchPublicErrorMessage,
} from '@/lib/memory-search';
import { hybridSearchWithStatus } from '@/lib/vector/postgres';
import { embedTextForOwner } from '@/server/embedding';
import type { HybridSearchConfig } from '@/types/hybrid-search';

type MemoryOwner = {
    userId: string;
    tenantId?: string | null;
};

const logger = createLogger(
    {
        type: 'server:memory',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

const MAX_MEMORY_SEARCH_QUERY_LENGTH = 500;
const MAX_MEMORY_SCOPE_IDS = 10_000;

/**
 * Preserve the complete server-authorized memory scope. A project can bind
 * more than 100 libraries, so silently slicing this list would make later
 * bindings unreachable. Keep a high explicit ceiling instead: an oversized
 * trusted scope fails safely rather than returning a partial result set.
 */
export function normalizeMemoryIds(memoryIds: unknown): string[] | undefined {
    if (!Array.isArray(memoryIds)) return undefined;
    const ids = new Set<string>();
    for (const value of memoryIds) {
        if (typeof value !== 'string') continue;
        const id = value.trim();
        if (!id) continue;
        ids.add(id);
        if (ids.size > MAX_MEMORY_SCOPE_IDS) {
            throw new Error(`记忆库范围不能超过 ${MAX_MEMORY_SCOPE_IDS} 个`);
        }
    }
    return [...ids];
}

/**
 * Converts persisted project bindings into an explicit retrieval scope.  An
 * existing binding that is not owned by the active user is intentionally an
 * empty scope, not a signal to fall back to all of that user's memories.
 */
export function projectMemoryScopeFromBindingIds(allBindingIds: unknown, ownedBindingIds: unknown) {
    const allIds = normalizeMemoryIds(allBindingIds) || [];
    const memoryIds = normalizeMemoryIds(ownedBindingIds) || [];
    const ownedIdSet = new Set(memoryIds);
    return {
        hasBindings: allIds.length > 0,
        memoryIds,
        inaccessibleBindingCount: allIds.filter(id => !ownedIdSet.has(id)).length,
    };
}

type ProjectMemoryBindingSnapshotRow = {
    memoryId?: unknown;
    memory?: { userId?: unknown } | null;
};

/**
 * Derive both the "does this project have bindings" flag and the owner-safe
 * ids from the same database snapshot. Reading those two facts in separate
 * queries leaves a race: a binding created or removed between the queries can
 * accidentally turn an explicit project scope into an all-personal-memory
 * search (or report a false inaccessible binding).
 */
export function projectMemoryScopeFromBindingSnapshot(rows: unknown, ownerId: string) {
    const allBindingIds: string[] = [];
    const ownedBindingIds: string[] = [];

    for (const row of Array.isArray(rows) ? (rows as ProjectMemoryBindingSnapshotRow[]) : []) {
        const memoryId = typeof row?.memoryId === 'string' ? row.memoryId.trim() : '';
        if (!memoryId) continue;

        allBindingIds.push(memoryId);
        if (row?.memory?.userId === ownerId) {
            ownedBindingIds.push(memoryId);
        }
    }

    return projectMemoryScopeFromBindingIds(allBindingIds, ownedBindingIds);
}

/**
 * A legacy project can retain a link to a memory owned by another account.
 * Do not turn that authorization boundary into a misleading zero-hit result:
 * callers need an actionable, non-sensitive failure instead.
 */
export function assertProjectMemoryScopeIsUsable(scope: {
    hasBindings: boolean;
    memoryIds: string[];
    inaccessibleBindingCount?: number;
}) {
    if (
        scope.hasBindings &&
        scope.memoryIds.length === 0 &&
        Number(scope.inaccessibleBindingCount || 0) > 0
    ) {
        throw new Error(MEMORY_PROJECT_BINDING_UNAVAILABLE_MESSAGE);
    }
    return scope;
}

function memoryScope(owner: MemoryOwner, memoryIds?: string[]) {
    return {
        userId: owner.userId,
        ...(memoryIds !== undefined ? { id: { in: memoryIds } } : {}),
    };
}

/**
 * Project bindings are the authoritative memory scope for a workflow. The
 * project itself is re-authorized, and every binding is re-intersected with
 * the requesting user's owned memories so browser-local selections never
 * widen retrieval access.
 */
export async function resolveAuthorizedProjectMemoryScope(projectId: string, owner: MemoryOwner) {
    await requireOwnedProject(projectId, owner as any);
    // Keep the complete binding state in one query. See
    // `projectMemoryScopeFromBindingSnapshot` for why this must not be split
    // into independently-timed "all" and "owned" reads.
    const bindings = await (prisma as any).projectMemory.findMany({
        where: { projectId },
        select: { memoryId: true, memory: { select: { userId: true } } },
    });
    return assertProjectMemoryScopeIsUsable(
        projectMemoryScopeFromBindingSnapshot(bindings, owner.userId)
    );
}

export async function searchMemoryForOwner(
    query: string,
    owner: MemoryOwner,
    opts?: {
        limit?: number;
        searchConfig?: Partial<HybridSearchConfig>;
        memoryIds?: string[];
    }
) {
    try {
        if (!owner.userId) throw new Error('缺少内部用户身份');
        const memoryIds = normalizeMemoryIds(opts?.memoryIds);
        // `[]` is an explicit server-resolved project scope with no memories
        // the caller owns; it must never fall back to all personal memories.
        if (memoryIds !== undefined && !memoryIds.length) {
            return { success: true, data: [] as any[] } as const;
        }
        const scope = memoryScope(owner, memoryIds);
        const hasTm = (prisma as any).translationMemoryEntry;
        if (!hasTm) {
            return {
                success: false,
                error: MEMORY_SEARCH_UNAVAILABLE_MESSAGE,
                data: [] as Array<{ id: string; source: string; target: string; score: number }>,
            } as const;
        }

        const searchQuery = String(query || '').trim();
        if (!searchQuery) return { success: true, data: [] as any[] } as const;
        if (searchQuery.length > MAX_MEMORY_SEARCH_QUERY_LENGTH) {
            return {
                success: false,
                error: `查询内容不能超过 ${MAX_MEMORY_SEARCH_QUERY_LENGTH} 个字符`,
                data: [] as any[],
            } as const;
        }
        const limit = Math.max(1, Math.min(200, Number(opts?.limit) || 5));
        const searchConfig = normalizeHybridSearchConfig(opts?.searchConfig);
        const candidateConfig = expandMemorySearchCandidatePool(searchConfig, limit * 2);
        const vectorRequested =
            searchConfig.mode !== 'keyword' && searchConfig.vectorSearch.enabled;
        const keywordRequested =
            searchConfig.mode !== 'vector' && searchConfig.keywordSearch.enabled;
        // A caller can send a partial config directly to the API even though
        // the current UI does not expose per-leg disable switches. Running no
        // retrieval leg is a configuration failure, not an honest zero-hit
        // result.
        if (!vectorRequested && !keywordRequested) {
            return {
                success: false,
                error: MEMORY_SEARCH_CONFIGURATION_MESSAGE,
                data: [] as any[],
                configuredMode: searchConfig.mode,
                effectiveMode: searchConfig.mode,
                unavailableLegs: [] as Array<'vector' | 'keyword'>,
            } as const;
        }
        let queryVector: number[] | undefined;
        let embeddingUnavailable = false;

        if (vectorRequested) {
            try {
                const embedded = await embedTextForOwner(searchQuery, owner);
                queryVector = Array.isArray(embedded) && embedded.length ? embedded : undefined;
                embeddingUnavailable = !queryVector;
            } catch (error) {
                embeddingUnavailable = true;
                logger.error('[SEARCH] Query embedding unavailable:', error);
            }
        }

        // A vector-only request is a product promise. Do not silently return
        // lexical hits when the embedding service is unavailable.
        if (searchConfig.mode === 'vector' && embeddingUnavailable) {
            return {
                success: false,
                error: '语义检索暂不可用，请检查嵌入服务后重试',
                data: [] as any[],
                configuredMode: searchConfig.mode,
                effectiveMode: searchConfig.mode,
                unavailableLegs: ['vector'] as const,
            } as const;
        }

        const execution = await hybridSearchWithStatus({
            collection: 'TranslationMemory',
            query: searchQuery,
            vector: queryVector,
            userId: owner.userId,
            memoryIds,
            config: candidateConfig,
        });
        const unavailableLegs = Array.from(
            new Set([
                ...execution.unavailableLegs,
                ...(embeddingUnavailable ? (['vector'] as const) : []),
            ])
        );

        if (searchConfig.mode === 'vector' && unavailableLegs.includes('vector')) {
            return {
                success: false,
                error: '语义检索暂不可用，请检查向量索引后重试',
                data: [] as any[],
                configuredMode: searchConfig.mode,
                effectiveMode: searchConfig.mode,
                unavailableLegs,
            } as const;
        }

        const allRequestedLegsUnavailable =
            (vectorRequested ? unavailableLegs.includes('vector') : true) &&
            (keywordRequested ? unavailableLegs.includes('keyword') : true);
        if ((vectorRequested || keywordRequested) && allRequestedLegsUnavailable) {
            return {
                success: false,
                error: '检索服务暂不可用，请稍后重试',
                data: [] as any[],
                configuredMode: searchConfig.mode,
                effectiveMode: searchConfig.mode,
                unavailableLegs,
            } as const;
        }

        const ids = execution.results.map(hit => hit.id);
        const rows: Array<{ id: string; sourceText: string; targetText: string }> = ids.length
            ? await (prisma as any).translationMemoryEntry.findMany({
                  where: {
                      id: { in: ids },
                      memory: scope,
                  },
                  select: { id: true, sourceText: true, targetText: true },
              })
            : [];
        const map = new Map<string, { id: string; sourceText: string; targetText: string }>(
            rows.map(row => [row.id, row])
        );
        const data = execution.results
            .map(hit => ({
                id: hit.id,
                source: map.get(hit.id)?.sourceText || '',
                target: map.get(hit.id)?.targetText || '',
                score: hit.score || 0,
                searchMode: hit.source,
                vectorScore: hit.vectorScore,
                keywordScore: hit.keywordScore,
            }))
            .filter(result => result.source)
            .slice(0, limit);

        // A partial hybrid result is still useful and remains explicitly
        // marked as degraded below.  By contrast, an empty result with an
        // unavailable requested leg cannot establish that no reference
        // exists: the unavailable leg may have supplied the only match.
        // Return a controlled retry state instead of letting IDE discourse
        // review present this as an honest zero-hit query.
        if (hasIncompleteMemorySearchResult(data.length, unavailableLegs)) {
            return {
                success: false,
                error: MEMORY_SEARCH_INCOMPLETE_MESSAGE,
                data: [] as any[],
                configuredMode: execution.configuredMode,
                effectiveMode: execution.effectiveMode,
                unavailableLegs,
            } as const;
        }

        logger.log(`[SEARCH] Found ${data.length} results using ${execution.effectiveMode} mode`);
        return {
            success: true,
            data,
            configuredMode: execution.configuredMode,
            effectiveMode: execution.effectiveMode,
            searchMode: execution.effectiveMode,
            degraded: unavailableLegs.length > 0,
            unavailableLegs,
        } as const;
    } catch (error) {
        // The caller only needs to know that retrieval did not complete. Raw
        // pgvector/provider messages must stay in server logs; returning them
        // here made an implementation failure both leak details and look like
        // a normal empty result in some downstream callers.
        logger.error('[SEARCH] Translation memory search failed:', error);
        return {
            success: false,
            error: memorySearchPublicErrorMessage(error),
            data: [] as any[],
        } as const;
    }
}
