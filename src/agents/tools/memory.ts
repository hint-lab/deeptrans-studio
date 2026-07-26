// Memory Tool - 记忆库查询工具
import { createLogger } from '@/lib/logger';
import { memorySearchPublicErrorMessage } from '@/lib/memory-search';
import { type HybridSearchConfig } from '@/types/hybrid-search';
const logger = createLogger(
    {
        type: 'agents:memory',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export interface MemoryHit {
    id: string;
    source: string;
    target: string;
    score: number;
    vectorScore?: number;
    keywordScore?: number;
    searchMode?: string;
}

export interface MemorySearchOptions {
    limit?: number;
    searchConfig?: Partial<HybridSearchConfig>;
    owner?: {
        userId: string;
        tenantId?: string | null;
    };
    // This value is only accepted from a server-resolved project binding.
    // Browser callers never receive a path to widen the memory scope.
    memoryIds?: string[];
}

function optionalFiniteNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}

type MemorySearchResponse = {
    success?: unknown;
    data?: unknown;
    error?: unknown;
};

/**
 * A retrieval outage is materially different from an honest empty result.
 * Preserve that distinction through the agent layer so a post-edit workflow
 * never tells a reviewer that no references exist when search did not run.
 */
export class MemorySearchError extends Error {
    constructor(error?: unknown) {
        super(memorySearchPublicErrorMessage(error));
        this.name = 'MemorySearchError';
    }
}

export function memoryHitsFromSearchResponse(response: unknown): MemoryHit[] {
    const payload =
        response && typeof response === 'object' ? (response as MemorySearchResponse) : undefined;
    if (payload?.success !== true) {
        throw new MemorySearchError(payload?.error);
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((item: any) => ({
        id: item.id,
        source: item.source ?? item.sourceText ?? '',
        target: item.target ?? item.targetText ?? '',
        score: optionalFiniteNumber(item.score) ?? 0,
        vectorScore: optionalFiniteNumber(item.vectorScore),
        keywordScore: optionalFiniteNumber(item.keywordScore),
        searchMode: item.searchMode,
    }));
}

export class MemoryTool {
    private readonly apiBase: string;

    constructor(apiBase?: string) {
        this.apiBase = (
            apiBase ||
            process.env.MEMORY_API_URL ||
            process.env.INTERNAL_API_BASE ||
            ''
        ).replace(/\/$/, '');
    }

    async search(query: string, options?: MemorySearchOptions): Promise<MemoryHit[]> {
        if (!query?.trim()) return [];

        try {
            if (typeof window === 'undefined') {
                if (!options?.owner?.userId) {
                    throw new MemorySearchError();
                }
                const { searchMemoryForOwner } = await import('@/server/memory');
                const result = await searchMemoryForOwner(query, options.owner, {
                    limit: options?.limit || 5,
                    searchConfig: options?.searchConfig,
                    memoryIds: options?.memoryIds,
                });
                return memoryHitsFromSearchResponse(result);
            }

            const url = this.apiBase
                ? `${this.apiBase}/api/memories/hybrid-search`
                : '/api/memories/hybrid-search';

            // 使用新的混合检索 API
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify({
                    query,
                    limit: options?.limit || 5,
                    searchConfig: options?.searchConfig,
                }),
            });

            let data: unknown;
            try {
                data = await response.json();
            } catch {
                data = undefined;
            }

            if (!response.ok) {
                logger.warn('Memory hybrid search failed:', response.statusText);
                const payload =
                    data && typeof data === 'object' ? (data as MemorySearchResponse) : undefined;
                throw new MemorySearchError(payload?.error);
            }

            return memoryHitsFromSearchResponse(data);
        } catch (error) {
            logger.error('Memory search failed:', error);
            if (error instanceof MemorySearchError) throw error;
            throw new MemorySearchError(error);
        }
    }

    private tokenize(text: string): string[] {
        const normalized = String(text || '').toLowerCase();
        const words = normalized
            .split(/[\s,.;:!?，。；：！、()\[\]{}"'""''<>\-_/]+/)
            .filter(Boolean);
        const chars = Array.from(normalized.replace(/\s+/g, ''));
        const bigrams: string[] = [];

        for (let i = 0; i < Math.min(chars.length - 1, 50); i++) {
            const bigram = (chars[i] || '') + (chars[i + 1] || '');
            if (bigram.trim().length >= 2) {
                bigrams.push(bigram);
            }
        }

        return Array.from(new Set([...words, ...bigrams]));
    }
}

// Global instance
export const memoryTool = new MemoryTool();
