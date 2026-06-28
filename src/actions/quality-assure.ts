'use server';

import { requireUser } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    embedSyntaxAdvice,
    evaluateSyntax,
    extractBilingualSyntaxMarkers,
    runQualityAssureForOwner,
} from '@/server/quality-assure';
const logger = createLogger({
    type: 'actions:quality-assure',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
/**
 * 双语句法标记提取 Server Action
 */
export async function extractBilingualSyntaxMarkersAction(
    source: string,
    target: string,
    options?: { prompt?: string }
): Promise<any> {
    try {
        await requireUser();
        const result = await extractBilingualSyntaxMarkers(source, target, options);
        logger.info('句法标记提取成功:', { hasResult: !!result });
        return result;
    } catch (error) {
        logger.error('句法标记提取失败:', error);
        throw new Error('句法标记提取失败');
    }
}

/**
 * 句法评估 Server Action
 */
export async function evaluateSyntaxAction(
    source: string,
    target: string,
    options?: {
        targetLanguage?: string;
        domain?: string;
        prompt?: string;
        locale?: string;
    }
): Promise<any> {
    try {
        await requireUser();
        const result = await evaluateSyntax(source, target, options);
        logger.info('句法评估成功:', {
            issuesCount: Array.isArray(result?.issues) ? result.issues.length : undefined,
        });
        return result;
    } catch (error) {
        logger.error('句法评估失败:', error);
        throw new Error('句法评估失败');
    }
}

/**
 * 句法建议嵌入 Server Action
 */
export async function embedSyntaxAdviceAction(
    source: string,
    target: string,
    issues: Array<{ type?: string; span?: string; advice?: string }>,
    options?: { prompt?: string }
): Promise<string> {
    try {
        await requireUser();
        return embedSyntaxAdvice(source, target, issues, options);
    } catch (error) {
        logger.error('句法建议嵌入失败:', error);
        throw new Error('句法建议嵌入失败');
    }
}

/**
 * 完整质检流程 Server Action
 */
export async function runQualityAssureAction(
    sourceText: string,
    targetText: string,
    options?: {
        targetLanguage?: string;
        domain?: string;
        prompt?: string;
        projectId?: string;
        locale?: string;
    }
): Promise<{
    biTerm: any;
    syntax: any;
    syntaxEmbedded: string;
}> {
    const authCtx = await requireUser();
    return runQualityAssureForOwner(sourceText, targetText, authCtx, options);
}
