// 文档级术语提取智能体
import { createLogger } from '@/lib/logger';
import { documentTermsLlmTimeoutMs } from '@/lib/terms/llm-config';
import { buildStatCandidates } from '@/lib/terms/termStats';
import type { DocumentTerm } from '@/lib/terms/types';
import { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions';
import { BaseAgent, type AgentRunContext } from '../base';
import { createAgentI18n } from '../i18n';
const logger = createLogger(
    {
        type: 'agents:documentTermExtractAgent',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

export function mergeDocumentTermScores(
    result: unknown,
    candidates: DocumentTerm[],
    topK: number
): DocumentTerm[] {
    const wrapped = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
    const items = Array.isArray(result)
        ? result
        : Array.isArray(wrapped.terms)
          ? wrapped.terms
          : Array.isArray(wrapped.items)
            ? wrapped.items
            : Array.isArray(wrapped.data)
              ? wrapped.data
              : [];
    const scoreMap = new Map<string, number>();

    for (const item of items) {
        const term = String((item as any)?.term || '').trim();
        if (!term) continue;

        const score =
            typeof (item as any)?.score === 'number'
                ? Math.max(0, Math.min(1, Number((item as any).score)))
                : 0.5;
        scoreMap.set(term, Math.max(score, scoreMap.get(term) || 0));
    }

    if (!scoreMap.size) return candidates.slice(0, topK);

    const countMap = new Map<string, number>(
        candidates.map(candidate => [candidate.term, candidate.count])
    );
    const merged: DocumentTerm[] = Array.from(scoreMap.entries()).map(([term, score]) => ({
        term,
        score,
        count: countMap.get(term) || 1,
    }));

    merged.sort((a, b) => (b.score || 0) - (a.score || 0) || b.count - a.count);
    return merged.slice(0, topK);
}

export class DocumentTermExtractAgent extends BaseAgent<
    { text: string; options?: DocumentTermExtractOptions; locale?: string },
    DocumentTerm[]
> {
    constructor(locale?: string) {
        super({
            name: 'preprocess:doc-term-extract',
            role: 'terminology_extractor',
            domain: 'terminology',
            specialty: '大规模文档术语识别与评估', // This will be replaced by i18n
            quality: 'review',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: { text: string; options?: DocumentTermExtractOptions; locale?: string },
        ctx?: AgentRunContext
    ): Promise<DocumentTerm[]> {
        const text = String(input.text || '').trim();
        if (!text) return [];

        const options = input.options || {};
        const maxTerms = Math.max(1, Math.min(200, options.maxTerms ?? 100));
        const chunkSize = Math.max(1000, Math.min(12000, options.chunkSize ?? 5000));
        const overlap = Math.max(0, Math.min(Math.floor(chunkSize / 4), options.overlap ?? 300));

        // 先用统计方法获取候选术语
        const candidates = buildStatCandidates(
            text,
            chunkSize,
            overlap,
            Math.max(400, maxTerms * 5)
        );

        // 然后用 LLM 进行评分和筛选
        const locale = ctx?.locale || input.locale || this.locale;
        const finalTerms = await this.scoreWithLLM(
            candidates,
            text,
            options.prompt,
            maxTerms,
            locale
        );

        return finalTerms;
    }

    private async scoreWithLLM(
        candidates: DocumentTerm[],
        context: string,
        userPrompt?: string,
        topK: number = 200,
        locale: string = 'zh',
        contextMaxLen: number = 8000,
        termMaxLen: number = 8000
    ): Promise<DocumentTerm[]> {
        if (!candidates.length) return [];

        const i18n = await createAgentI18n(locale);
        const terms = candidates.map(c => c.term);
        const userPref = await this.buildUserPref(userPrompt);

        // 构建系统提示词
        const systemPrompt = await this.buildPrompt('json', [
            i18n.getAgentPrompt('document_term_extract', 'select_score'),
            i18n.getAgentPrompt('document_term_extract', 'prioritize_relevant'),
            i18n.getAgentPrompt('document_term_extract', 'ignore_functional'),
            i18n.getAgentPrompt('document_term_extract', 'output_json'),
        ]);

        const contextTruncated = i18n.getAgentPrompt('document_term_extract', 'context_truncated');
        const candidatePhrases = i18n.getAgentPrompt('document_term_extract', 'candidate_phrases');
        const outputInstruction = i18n.getAgentPrompt(
            'document_term_extract',
            'output_instruction',
            { topK: topK.toString() }
        );

        const userContent = [
            userPref,
            contextTruncated,
            String(context || '').slice(0, contextMaxLen),
            candidatePhrases,
            JSON.stringify(terms),
            outputInstruction,
        ]
            .filter(Boolean)
            .join('\n\n');

        try {
            const messages = this.messages(systemPrompt, userContent);
            const result = await this.json<Array<{ term: string; score?: number }>>(messages, {
                maxTokens: termMaxLen,
                timeoutMs: documentTermsLlmTimeoutMs(),
            });

            const merged = mergeDocumentTermScores(result, candidates, topK);
            const wrapped = result && typeof result === 'object' ? (result as any) : {};
            const scoredItems = Array.isArray(result)
                ? result
                : wrapped.terms || wrapped.items || wrapped.data;
            if (
                !Array.isArray(scoredItems) ||
                !scoredItems.some(item => String(item?.term || '').trim())
            ) {
                logger.warn('LLM scoring returned no usable array; using statistical candidates');
            }
            logger.info('LLM scoring complete', { count: merged.length });
            return merged;
        } catch (error) {
            logger.error('LLM scoring failed: ', error);
            return candidates.slice(0, topK);
        }
    }
}
