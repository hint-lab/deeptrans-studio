import { BaseAgent, type AgentRunContext } from '../base'
import { createAgentI18n } from '../i18n'

// 文档术语批量翻译智能体（不依赖外部动作，内部完成提示与调用）
export interface DocumentTermTranslateInput {
  terms: string[];
  sourceLanguage?: string;
  targetLanguage?: string;
  domain?: string; // 领域/项目风格
  style?: string;  // 风格/语域说明
  locale?: string;
}

export interface DocumentTermTranslateItem {
  term: string;
  translation: string;
  notes?: string;
}

export class DocumentTermTranslateAgent extends BaseAgent<DocumentTermTranslateInput, DocumentTermTranslateItem[]> {
  constructor(locale?: string) {
    super({
      name: 'preprocess:doc-term-translate',
      role: 'terminology_translator',
      domain: 'terminology',
      specialty: '术语翻译与标准化', // This will be replaced by i18n
      quality: 'review',
      locale: locale || 'zh'
    })
  }

  async execute(input: DocumentTermTranslateInput, ctx?: AgentRunContext): Promise<DocumentTermTranslateItem[]> {
    const terms = Array.from(new Set((input.terms || []).map(t => String(t || '').trim()).filter(Boolean)))
    if (!terms.length) return []

    const locale = ctx?.locale || input.locale || this.locale;
    const i18n = await createAgentI18n(locale);

    const src = String(input.sourceLanguage || 'auto')
    const tgt = String(input.targetLanguage || 'zh')
    const extra: string[] = []
    if (input.domain) extra.push(i18n.getAgentPrompt('document_term_translate', 'domain', { domain: input.domain }))
    if (input.style) extra.push(i18n.getAgentPrompt('document_term_translate', 'style', { style: input.style }))

    const systemPrompt = await this.buildPrompt('json', [
      i18n.getAgentPrompt('document_term_translate', 'assistant_role'),
      i18n.getAgentPrompt('document_term_translate', 'avoid_explanations'),
      i18n.getAgentPrompt('document_term_translate', 'return_json'),
    ])

    const sourceLanguage = i18n.getAgentPrompt('document_term_translate', 'source_language', { language: src });
    const targetLanguage = i18n.getAgentPrompt('document_term_translate', 'target_language', { language: tgt });
    const termList = i18n.getAgentPrompt('document_term_translate', 'term_list');
    const returnOnlyArray = i18n.getAgentPrompt('document_term_translate', 'return_only_array');

    const userContent = [
      sourceLanguage,
      targetLanguage,
      extra.length ? extra.join('\n') : undefined,
      termList,
      JSON.stringify(terms),
      returnOnlyArray
    ].filter(Boolean).join('\n\n')

    try {
      const messages = this.messages(systemPrompt, userContent)
      const result = await this.json<Array<{ term: string; translation?: string; notes?: string }>>(messages, { maxTokens: 2000 })
      const arr = Array.isArray(result) ? result : []
      const map = new Map<string, DocumentTermTranslateItem>()
      for (const it of arr) {
        const t = String((it as any)?.term || '').trim()
        if (!t) continue
        const tr = String((it as any)?.translation || '').trim()
        const nt = String((it as any)?.notes || '').trim()
        if (!map.has(t)) map.set(t, { term: t, translation: tr, notes: nt || undefined })
      }
      // 保持输入顺序
      return terms.map(t => map.get(t) || { term: t, translation: '' })
    } catch (e) {
      // 回退：若 LLM 失败，按空译文返回
      return terms.map(t => ({ term: t, translation: '' }))
    }
  }
}
