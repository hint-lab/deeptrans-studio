import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { hybridSearch } from '@/lib/vector/postgres';
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

function memoryScope(owner: MemoryOwner) {
    return {
        userId: owner.userId,
    };
}

function tokenize(text: string) {
    const t = String(text || '').toLowerCase();
    const words = t.split(/[\s,.;:!?，。；：！、()\[\]{}"'“”‘’<>\-_/]+/).filter(Boolean);
    const chars = Array.from(t.replace(/\s+/g, '')) as string[];
    const bigrams: string[] = [];
    for (let i = 0; i < Math.min(Math.max(0, chars.length - 1), 50); i++) {
        const left = chars[i] || '';
        const right = chars[i + 1] || '';
        const bg = String(left) + String(right);
        if (bg.trim().length >= 2) bigrams.push(bg);
    }
    return Array.from(new Set([...words, ...bigrams]));
}

export async function searchMemoryForOwner(
    query: string,
    owner: MemoryOwner,
    opts?: {
        limit?: number;
        searchConfig?: Partial<HybridSearchConfig>;
    }
) {
    try {
        if (!owner.userId) throw new Error('缺少内部用户身份');
        const scope = memoryScope(owner);
        const hasTm = (prisma as any).translationMemoryEntry;
        if (!hasTm) {
            return {
                success: true,
                data: [] as Array<{ id: string; source: string; target: string; score: number }>,
            } as const;
        }

        if (!query?.trim()) return { success: true, data: [] as any[] } as const;
        const limit = Math.max(1, opts?.limit || 5);
        const searchConfig = opts?.searchConfig;

        try {
            const qv = await embedTextForOwner(query, owner);
            if (Array.isArray(qv) && qv.length) {
                const hits = await hybridSearch({
                    collection: 'TranslationMemory',
                    query,
                    vector: qv,
                    userId: owner.userId,
                    config: {
                        finalTopK: limit * 2,
                        ...searchConfig,
                    },
                });

                if (hits?.length) {
                    const ids = hits.map(h => h.id);
                    const rows: Array<{ id: string; sourceText: string; targetText: string }> =
                        await (prisma as any).translationMemoryEntry.findMany({
                            where: {
                                id: { in: ids },
                                memory: scope,
                            },
                            select: { id: true, sourceText: true, targetText: true },
                        });
                    const map = new Map<
                        string,
                        { id: string; sourceText: string; targetText: string }
                    >(rows.map(r => [r.id, r]));
                    const merged = hits
                        .map(h => ({
                            id: h.id,
                            source: map.get(h.id)?.sourceText || '',
                            target: map.get(h.id)?.targetText || '',
                            score: h.score || 0,
                            searchMode: h.source,
                            vectorScore: h.vectorScore,
                            keywordScore: h.keywordScore,
                        }))
                        .filter(x => x.source)
                        .slice(0, limit);

                    if (merged.length) {
                        logger.log(
                            `[SEARCH] Hybrid search found ${merged.length} results using ${searchConfig?.mode || 'hybrid'} mode`
                        );
                        return { success: true, data: merged, searchMode: 'hybrid' } as const;
                    }
                }
            }
        } catch (error) {
            logger.error('[SEARCH] Hybrid search error:', error);
        }

        const tokens = tokenize(query).slice(0, 20);
        if (!tokens.length) return { success: true, data: [] as any[] } as const;
        const ors = tokens.map(tok => ({
            sourceText: { contains: tok, mode: 'insensitive' as const },
        }));
        const rows = await (prisma as any).translationMemoryEntry.findMany({
            where: {
                OR: ors,
                memory: scope,
            },
            select: { id: true, sourceText: true, targetText: true },
            take: Math.max(50, limit * 20),
            orderBy: { createdAt: 'desc' },
        });
        const tokenSet = new Set(tokens);
        const scored = rows
            .map((r: any) => {
                const sTokens = tokenize(r.sourceText);
                const inter = sTokens.filter((t: string) => tokenSet.has(t));
                const recall = inter.length / Math.max(1, tokens.length);
                const precision = inter.length / Math.max(1, sTokens.length);
                const f1 = (2 * recall * precision) / Math.max(1e-6, recall + precision);
                const score = 0.6 * recall + 0.4 * f1;
                return { id: r.id, source: r.sourceText, target: r.targetText, score };
            })
            .sort((a: any, b: any) => b.score - a.score);
        return { success: true, data: scored.slice(0, limit) } as const;
    } catch (e: any) {
        return { success: false, error: e?.message || '检索失败' } as const;
    }
}
