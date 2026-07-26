import { BaseAgent, type AgentRunContext } from '../base';
import { memoryTool, type MemoryHit, type MemorySearchOptions } from '../tools/memory';
import { meetsDiscourseMemoryQuality } from '@/lib/memory-search';

export class DiscourseQueryAgent extends BaseAgent<
    {
        source: string;
        prompt?: string;
        locale?: string;
        owner?: { userId: string; tenantId?: string | null };
        memoryIds?: string[];
    },
    { hits: MemoryHit[] }
> {
    constructor(locale?: string) {
        super({
            name: 'postedit:discourse-query',
            role: 'discourse_query_assistant',
            domain: 'discourse',
            specialty: '相似语段检索',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: {
            source: string;
            prompt?: string;
            owner?: { userId: string; tenantId?: string | null };
            memoryIds?: string[];
        },
        _ctx?: AgentRunContext
    ): Promise<{ hits: MemoryHit[] }> {
        // 使用混合检索获取高质量的相关翻译，限制为5条
        const options: MemorySearchOptions = {
            limit: 5,
            searchConfig: {
                mode: 'hybrid',
                fusionStrategy: {
                    method: 'weighted_sum',
                    weights: {
                        vectorWeight: 0.8, // 语义相似度权重更高
                        keywordWeight: 0.2,
                    },
                },
                finalTopK: 5,
            },
            owner: input.owner,
            memoryIds: input.memoryIds,
        };
        const hits = await memoryTool.search(input.source, options);

        // `score` may be a weighted hybrid fusion value.  Judge relevance by
        // the strongest raw vector/keyword signal so keyword-only fallback
        // stays available while embeddings are being backfilled.
        let qualityHits = hits.filter(hit => meetsDiscourseMemoryQuality(hit));

        // Weak vector neighbours are not useful discourse references. Do not
        // let their mere presence suppress an exact keyword fallback, which is
        // especially important while a memory index is still being backfilled.
        if (!qualityHits.length) {
            const keywordHits = await memoryTool.search(input.source, {
                ...options,
                searchConfig: { mode: 'keyword', finalTopK: 5 },
            });
            qualityHits = keywordHits.filter(hit => meetsDiscourseMemoryQuality(hit));
        }

        return { hits: qualityHits.slice(0, 5) };
    }
}
