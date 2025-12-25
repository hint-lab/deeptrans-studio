'use server';

import { DiscourseEmbedAgent } from '@/agents/postedit/DiscourseEmbedAgent';
import { DiscourseEvaluateAgent } from '@/agents/postedit/DiscourseEvaluateAgent';
import { DiscourseQueryAgent } from '@/agents/postedit/DiscourseQueryAgent';
import type { MemoryHit } from '@/agents/tools/memory';
import { createLogger } from '@/lib/logger';
const logger = createLogger({
    type: 'actions:postedit',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
/**
 * 语篇查询 Server Action
 */
export async function queryDiscourseAction(
    source: string,
    options?: {
        tenantId?: string;
        prompt?: string;
    }
): Promise<{ hits: MemoryHit[] }> {
    try {
        const agent = new DiscourseQueryAgent();
        const result = await agent.execute({
            source,
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });
        return result;
    } catch (error) {
        logger.error('语篇查询失败:', error);
        throw new Error('语篇查询失败');
    }
}

/**
 * 语篇评估 Server Action
 */
export async function evaluateDiscourseAction(
    source: string,
    target?: string,
    options?: {
        references?: MemoryHit[];
        tenantId?: string;
        prompt?: string;
    }
): Promise<any> {
    try {
        const agent = new DiscourseEvaluateAgent();
        const result = await agent.execute({
            source,
            target,
            references: options?.references,
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });
        return result;
    } catch (error) {
        logger.error('语篇评估失败:', error);
        throw new Error('语篇评估失败');
    }
}

/**
 * 语篇嵌入改写 Server Action
 */
export async function embedDiscourseAction(
    source: string,
    target: string,
    references: MemoryHit[],
    options?: {
        tenantId?: string;
        prompt?: string;
    }
): Promise<string> {
    try {
        const agent = new DiscourseEmbedAgent();
        const result = await agent.execute({
            source,
            target,
            references,
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });
        return result;
    } catch (error) {
        logger.error('语篇嵌入改写失败:', error);
        throw new Error('语篇嵌入改写失败');
    }
}

/**
 * 完整译后编辑流程 Server Action
 */
export async function runPostEditAction(
    sourceText: string,
    targetText: string,
    options?: {
        tenantId?: string;
        prompt?: string;
    }
): Promise<{
    query: { hits: MemoryHit[] };
    evaluation: any;
    rewrite: string;
}> {
    try {
        // 1. 语篇查询
        const query = await queryDiscourseAction(sourceText, {
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });

        // 2. 语篇评估（使用查询到的所有结果作为参考）
        const evaluation = await evaluateDiscourseAction(sourceText, targetText, {
            references: query.hits,
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });

        // 3. 语篇嵌入改写（使用查询到的所有结果作为参考）
        const rewrite = await embedDiscourseAction(sourceText, targetText, query.hits, {
            tenantId: options?.tenantId,
            prompt: options?.prompt,
        });

        return {
            query,
            evaluation,
            rewrite,
        };
    } catch (error) {
        logger.error('译后编辑流程失败:', error);
        throw new Error('译后编辑流程失败');
    }
}
