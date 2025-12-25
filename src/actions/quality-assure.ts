'use server';

import { SyntaxAdviceEmbedAgent, SyntaxEvaluateAgent, SyntaxMarkerExtractAgent } from '@/agents';
import { createLogger } from '@/lib/logger';
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
        const agent = new SyntaxMarkerExtractAgent();
        const result = await agent.execute({
            source,
            target,
            prompt: options?.prompt,
        });
        logger.info('句法标记提取成功:', result);
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
        const agent = new SyntaxEvaluateAgent(
            options?.targetLanguage,
            options?.domain,
            options?.locale
        );
        const result = await agent.execute(
            {
                source,
                target,
                targetLanguage: options?.targetLanguage,
                domain: options?.domain,
                prompt: options?.prompt,
                locale: options?.locale,
            },
            {
                locale: options?.locale,
            }
        );
        logger.info('句法评估成功:', result);
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
        const agent = new SyntaxAdviceEmbedAgent();
        const result = await agent.execute({
            source,
            target,
            issues,
            prompt: options?.prompt,
        });
        return result;
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
    try {
        // 1. 双语句法标记提取（相当于原来的双语术语评估）
        const biTerm = await extractBilingualSyntaxMarkersAction(sourceText, targetText, {
            prompt: options?.prompt,
        });

        // 2. 句法评估
        const syntax = await evaluateSyntaxAction(sourceText, targetText, {
            targetLanguage: options?.targetLanguage,
            domain: options?.domain,
            prompt: options?.prompt,
            locale: options?.locale,
        });

        // 3. 句法建议嵌入（生成改进的译文）
        const issues = syntax?.issues || [];
        const syntaxEmbedded = await embedSyntaxAdviceAction(sourceText, targetText, issues, {
            prompt: options?.prompt,
        });

        return {
            biTerm,
            syntax,
            syntaxEmbedded,
        };
    } catch (error) {
        logger.error('质检流程失败:', error);
        throw new Error('质检流程失败');
    }
}
