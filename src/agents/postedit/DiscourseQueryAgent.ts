import { BaseAgent, type AgentRunContext } from '../base';
import { memoryTool, type MemoryHit } from '../tools/memory';

export class DiscourseQueryAgent extends BaseAgent<
    { source: string; tenantId?: string; prompt?: string; locale?: string },
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
        input: { source: string; tenantId?: string; prompt?: string },
        _ctx?: AgentRunContext
    ): Promise<{ hits: MemoryHit[] }> {
        // 使用混合检索获取高质量的相关翻译，限制为5条
        const hits = await memoryTool.search(input.source, {
            tenantId: input.tenantId,
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
        });

        // 过滤相似度过低的结果
        const qualityHits = hits.filter(hit => hit.score >= 0.4);

        return { hits: qualityHits.slice(0, 5) };
    }
}
