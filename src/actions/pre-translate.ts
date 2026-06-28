'use server';

import { requireUser } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    baselineTranslate,
    embedAndTranslate,
    extractMonolingualTerms,
    lookupDictionaryForOwner,
    runPreTranslateForOwner,
} from '@/server/pre-translate';
import type { DictEntry, TermCandidate } from '@/types/terms';
/**
 * 术语抽取 Server Action
 */
const logger = createLogger({
    type: 'actions:pre-translate',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function extractMonolingualTermsAction(
    text: string,
    options?: { prompt?: string; locale?: string }
): Promise<TermCandidate[]> {
    try {
        await requireUser();
        return extractMonolingualTerms(text, options);
    } catch (error) {
        logger.error('术语抽取失败:', error);
        throw new Error('术语抽取失败');
    }
}

/**
 * 词典查询 Server Action
 */
export async function lookupDictionaryAction(
    terms: TermCandidate[]
): Promise<DictEntry[]> {
    try {
        const authCtx = await requireUser();
        logger.debug('词典查询 Action 开始:', {
            termsCount: terms?.length,
        });

        const result = await lookupDictionaryForOwner(terms, authCtx);

        logger.debug('词典查询 Action 完成:', {
            resultCount: result?.length,
        });

        return result;
    } catch (error) {
        logger.error('词典查询失败:', error);
        throw new Error('词典查询失败');
    }
}

/**
 * 基线翻译 Server Action - 简单的大模型翻译，不涉及术语处理
 */
export async function baselineTranslateAction(
    text: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    options?: { prompt?: string }
): Promise<string> {
    try {
        await requireUser();
        logger.debug('基线翻译参数:', { sourceLanguage, targetLanguage });
        return baselineTranslate(text, sourceLanguage, targetLanguage, options);
    } catch (error) {
        logger.error('基线翻译失败:', error);
        throw new Error('基线翻译失败');
    }
}

/**
 * 术语嵌入翻译 Server Action
 */
export async function embedAndTranslateAction(
    text: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    dict?: DictEntry[],
    options?: { prompt?: string; locale?: string }
): Promise<string> {
    try {
        await requireUser();
        return embedAndTranslate(text, sourceLanguage, targetLanguage, dict, options);
    } catch (error) {
        logger.error('术语嵌入翻译失败:', error);
        throw new Error('术语嵌入翻译失败');
    }
}

/**
 * 完整预翻译流程 Server Action
 */
export async function runPreTranslateAction(
    sourceText: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    options?: {
        prompt?: string;
    }
): Promise<{
    terms: TermCandidate[];
    dict: DictEntry[];
    translation: string;
}> {
    const authCtx = await requireUser();
    return runPreTranslateForOwner(sourceText, sourceLanguage, targetLanguage, authCtx, options);
}
