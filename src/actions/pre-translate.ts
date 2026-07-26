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
import { resolveTranslationStyleInstruction } from '@/lib/translation-style';
import { omitClientWorkflowPrompt } from '@/lib/workflow-prompt-keys';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';
/**
 * 术语抽取 Server Action
 */
const logger = createLogger(
    {
        type: 'actions:pre-translate',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export async function extractMonolingualTermsAction(
    text: string,
    options?: { locale?: string }
): Promise<TermCandidate[]> {
    try {
        const authCtx = await requireUser();
        const safeOptions = omitClientWorkflowPrompt(options);
        const prompt = await resolveWorkflowPrompt(authCtx, 'mono-term-extract');
        return extractMonolingualTerms(text, { ...safeOptions, prompt });
    } catch (error) {
        logger.error('术语抽取失败:', error);
        throw new Error('术语抽取失败');
    }
}

/**
 * 词典查询 Server Action
 */
export async function lookupDictionaryAction(
    terms: TermCandidate[],
    options?: { projectId?: string }
): Promise<DictEntry[]> {
    try {
        const authCtx = await requireUser();
        logger.debug('词典查询 Action 开始:', {
            termsCount: terms?.length,
        });

        const result = await lookupDictionaryForOwner(terms, authCtx, {
            projectId: options?.projectId,
        });

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
    targetLanguage?: string
): Promise<string> {
    try {
        const authCtx = await requireUser();
        const prompt = await resolveWorkflowPrompt(authCtx, 'term-embed-trans');
        logger.debug('基线翻译参数:', { sourceLanguage, targetLanguage });
        return baselineTranslate(text, sourceLanguage, targetLanguage, { prompt });
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
    options?: { locale?: string; style?: string }
): Promise<string> {
    try {
        const authCtx = await requireUser();
        const safeOptions = omitClientWorkflowPrompt(options);
        const { style, ...agentOptions } = safeOptions;
        const prompt = await resolveWorkflowPrompt(
            authCtx,
            'term-embed-trans',
            resolveTranslationStyleInstruction(style)
        );
        return embedAndTranslate(text, sourceLanguage, targetLanguage, dict, {
            ...agentOptions,
            prompt,
        });
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
    targetLanguage?: string
): Promise<{
    terms: TermCandidate[];
    dict: DictEntry[];
    translation: string;
}> {
    const authCtx = await requireUser();
    const [termExtractPrompt, termEmbedPrompt] = await Promise.all([
        resolveWorkflowPrompt(authCtx, 'mono-term-extract'),
        resolveWorkflowPrompt(authCtx, 'term-embed-trans'),
    ]);
    return runPreTranslateForOwner(sourceText, sourceLanguage, targetLanguage, authCtx, {
        termExtractPrompt,
        termEmbedPrompt,
    });
}
