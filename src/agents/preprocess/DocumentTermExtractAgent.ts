// 文档级术语提取智能体
import { BaseAgent, type AgentRunContext } from '../base'
import type { DocumentTerm } from '@/lib/terms/types'
import { buildStatCandidates } from '@/lib/terms/termStats'
import { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions'
import { createAgentI18n } from '../i18n'

export class DocumentTermExtractAgent extends BaseAgent<{ text: string; options?: DocumentTermExtractOptions; locale?: string }, DocumentTerm[]> {

  constructor(locale?: string) {
    super({
      name: 'preprocess:doc-term-extract',
      role: 'terminology_extractor',
      domain: 'terminology',
      specialty: '大规模文档术语识别与评估', // This will be replaced by i18n
      quality: 'review',
      locale: locale || 'zh'
    });
  }

  async execute(input: { text: string; options?: DocumentTermExtractOptions; locale?: string }, ctx?: AgentRunContext): Promise<DocumentTerm[]> {
    const text = String(input.text || '').trim();
    if (!text) return [];

    const options = input.options || {};
    const maxTerms = Math.max(1, Math.min(200, options.maxTerms ?? 100));
    const chunkSize = Math.max(1000, Math.min(12000, options.chunkSize ?? 5000));
    const overlap = Math.max(0, Math.min(Math.floor(chunkSize / 4), options.overlap ?? 300));

    // 先用统计方法获取候选术语
    const candidates = buildStatCandidates(text, chunkSize, overlap, Math.max(400, maxTerms * 5));

    // 然后用 LLM 进行评分和筛选
    const locale = ctx?.locale || input.locale || this.locale;
    const finalTerms = await this.scoreWithLLM(candidates, text, options.prompt, maxTerms, locale);

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
      i18n.getAgentPrompt('document_term_extract', 'output_json')
    ]);

    const contextTruncated = i18n.getAgentPrompt('document_term_extract', 'context_truncated');
    const candidatePhrases = i18n.getAgentPrompt('document_term_extract', 'candidate_phrases');
    const outputInstruction = i18n.getAgentPrompt('document_term_extract', 'output_instruction', { topK: topK.toString() });

    const userContent = [
      userPref,
      contextTruncated,
      String(context || '').slice(0, contextMaxLen),
      candidatePhrases,
      JSON.stringify(terms),
      outputInstruction
    ].filter(Boolean).join('\n\n');

    try {
      const messages = this.messages(systemPrompt, userContent);
      const result = await this.json<Array<{ term: string; score?: number }>>(messages, { maxTokens: termMaxLen });

      const arr = Array.isArray(result) ? result : [];
      const scoreMap = new Map<string, number>();

      for (const item of arr) {
        const term = String((item as any)?.term || '').trim();
        if (!term) continue;

        const score = typeof (item as any)?.score === 'number'
          ? Math.max(0, Math.min(1, Number((item as any).score)))
          : 0.5;

        scoreMap.set(term, Math.max(score, scoreMap.get(term) || 0));
      }

      const countMap = new Map<string, number>(candidates.map(c => [c.term, c.count]));
      const merged: DocumentTerm[] = Array.from(scoreMap.entries()).map(([term, score]) => ({
        term,
        score,
        count: countMap.get(term) || 1
      }));

      merged.sort((a, b) => ((b.score || 0) - (a.score || 0)) || (b.count - a.count));
      return merged.slice(0, topK);
    } catch (error) {
      console.warn('LLM scoring failed, returning statistical candidates:', error);
      return candidates.slice(0, topK);
    }
  }
}
