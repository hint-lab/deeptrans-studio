'use server';
import { DocumentTermExtractAgent } from '@/agents/preprocess/DocumentTermExtractAgent';
import { DocumentTermTranslateAgent } from '@/agents/preprocess/DocumentTermTranslateAgent';
import { createLogger } from '@/lib/logger';
import type { DocumentTerm } from '@/lib/terms/types';
import { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions';
const logger = createLogger({
    type: 'actions:project-init',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
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
        logger.info("文档术语提取成功:", result)
        return result;
    } catch (error) {
        logger.error('文档术语提取失败:', error);
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
