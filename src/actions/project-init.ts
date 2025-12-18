'use server';
import { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions';
import { DocumentTermExtractAgent } from '@/agents/preprocess/DocumentTermExtractAgent';
import { DocumentTermTranslateAgent } from '@/agents/preprocess/DocumentTermTranslateAgent';

import type { DocumentTerm } from '@/lib/terms/types';

/**
 * 文档术语提取 Server Action
 */
export async function extractDocumentTermsAction(
    text: string,
    options?: DocumentTermExtractOptions
): Promise<DocumentTerm[]> {
    try {
        const agent = new DocumentTermExtractAgent();
        const result = await agent.execute({ text, options });
        return result;
    } catch (error) {
        console.error('文档术语提取失败:', error);
        throw new Error('文档术语提取失败');
    }
}

/**
 * 术语批量翻译 Server Action（简化：逐条调用 embedAndTranslateAction）
 */
export async function translateTermsBatchAction(
    terms: string[],
    sourceLanguage?: string,
    targetLanguage?: string,
    options?: { domain?: string }
): Promise<Array<{ term: string; translation: string }>> {
    const agent = new DocumentTermTranslateAgent();
    const out = await agent.execute({
        terms,
        sourceLanguage,
        targetLanguage,
        domain: options?.domain,
    });
    return out;
}
