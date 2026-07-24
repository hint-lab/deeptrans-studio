import { createLogger } from '@/lib/logger';
import { documentTermsLlmTimeoutMs } from '@/lib/terms/llm-config';
import { BaseAgent, type AgentRunContext } from '../base';
import { createAgentI18n } from '../i18n';

const logger = createLogger(
    { type: 'agents:documentTermTranslateAgent' },
    { json: false, pretty: false, colors: true, includeCaller: false }
);

export const DOCUMENT_TERM_TRANSLATE_BATCH_SIZE = 25;
export const DOCUMENT_TERM_TRANSLATE_CONCURRENCY = 3;

// 文档术语批量翻译智能体（不依赖外部动作，内部完成提示与调用）
export interface DocumentTermTranslateInput {
    terms: string[];
    sourceLanguage?: string;
    targetLanguage?: string;
    domain?: string; // 领域/项目风格
    style?: string; // 风格/语域说明
    locale?: string;
}

export interface DocumentTermTranslateItem {
    term: string;
    translation: string;
    notes?: string;
}

export function normalizeDocumentTermTranslations(
    result: unknown,
    requestedTerms: string[]
): DocumentTermTranslateItem[] {
    const wrapped = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
    const items = Array.isArray(result)
        ? result
        : Array.isArray(wrapped.translations)
          ? wrapped.translations
          : Array.isArray(wrapped.terms)
            ? wrapped.terms
            : Array.isArray(wrapped.items)
              ? wrapped.items
              : Array.isArray(wrapped.data)
                ? wrapped.data
                : [];
    const map = new Map<string, DocumentTermTranslateItem>();

    for (const item of items) {
        const term = String(
            (item as any)?.term || (item as any)?.sourceText || (item as any)?.source || ''
        ).trim();
        if (!term) continue;
        const translation = String(
            (item as any)?.translation || (item as any)?.targetText || (item as any)?.target || ''
        ).trim();
        const notes = String((item as any)?.notes || '').trim();
        if (!map.has(term)) {
            map.set(term, { term, translation, notes: notes || undefined });
        }
    }

    return requestedTerms.map(term => map.get(term) || { term, translation: '' });
}

export class DocumentTermTranslateAgent extends BaseAgent<
    DocumentTermTranslateInput,
    DocumentTermTranslateItem[]
> {
    constructor(locale?: string) {
        super({
            name: 'preprocess:doc-term-translate',
            role: 'terminology_translator',
            domain: 'terminology',
            specialty: '术语翻译与标准化', // This will be replaced by i18n
            quality: 'review',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: DocumentTermTranslateInput,
        ctx?: AgentRunContext
    ): Promise<DocumentTermTranslateItem[]> {
        const terms = Array.from(
            new Set((input.terms || []).map(t => String(t || '').trim()).filter(Boolean))
        );
        if (!terms.length) return [];

        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        const src = String(input.sourceLanguage || 'auto');
        const tgt = String(input.targetLanguage || 'zh');
        const extra: string[] = [];
        if (input.domain)
            extra.push(
                i18n.getAgentPrompt('document_term_translate', 'domain', { domain: input.domain })
            );
        if (input.style)
            extra.push(
                i18n.getAgentPrompt('document_term_translate', 'style', { style: input.style })
            );

        const systemPrompt = await this.buildPrompt('json', [
            i18n.getAgentPrompt('document_term_translate', 'assistant_role'),
            i18n.getAgentPrompt('document_term_translate', 'avoid_explanations'),
            i18n.getAgentPrompt('document_term_translate', 'return_json'),
        ]);

        const sourceLanguage = i18n.getAgentPrompt('document_term_translate', 'source_language', {
            language: src,
        });
        const targetLanguage = i18n.getAgentPrompt('document_term_translate', 'target_language', {
            language: tgt,
        });
        const termList = i18n.getAgentPrompt('document_term_translate', 'term_list');
        const returnOnlyArray = i18n.getAgentPrompt('document_term_translate', 'return_only_array');
        const timeoutMs = documentTermsLlmTimeoutMs();
        const batches: string[][] = [];
        for (let index = 0; index < terms.length; index += DOCUMENT_TERM_TRANSLATE_BATCH_SIZE) {
            batches.push(terms.slice(index, index + DOCUMENT_TERM_TRANSLATE_BATCH_SIZE));
        }

        const translateBatch = async (batch: string[]) => {
            const userContent = [
                sourceLanguage,
                targetLanguage,
                extra.length ? extra.join('\n') : undefined,
                termList,
                JSON.stringify(batch),
                returnOnlyArray,
            ]
                .filter(Boolean)
                .join('\n\n');

            try {
                const messages = this.messages(systemPrompt, userContent);
                const result = await this.json<unknown>(messages, {
                    maxTokens: Math.min(6000, Math.max(2000, batch.length * 120)),
                    timeoutMs,
                });
                const normalized = normalizeDocumentTermTranslations(result, batch);
                if (!normalized.some(item => item.translation)) {
                    throw new Error('LLM returned no usable term translations');
                }
                return normalized;
            } catch (error) {
                logger.error('term translation batch failed', {
                    batchSize: batch.length,
                    error: error instanceof Error ? error.message : String(error),
                });
                return batch.map(term => ({ term, translation: '' }));
            }
        };

        const translatedBatches: DocumentTermTranslateItem[][] = [];
        for (let index = 0; index < batches.length; index += DOCUMENT_TERM_TRANSLATE_CONCURRENCY) {
            const wave = batches.slice(index, index + DOCUMENT_TERM_TRANSLATE_CONCURRENCY);
            translatedBatches.push(...(await Promise.all(wave.map(translateBatch))));
        }

        return translatedBatches.flat();
    }
}
