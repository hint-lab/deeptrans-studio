'use server';

import { DiscourseEmbedAgent } from '@/agents/postedit/DiscourseEmbedAgent';
import { DiscourseEvaluateAgent } from '@/agents/postedit/DiscourseEvaluateAgent';
import { DiscourseQueryAgent } from '@/agents/postedit/DiscourseQueryAgent';
import type { MemoryHit } from '@/agents/tools/memory';
import { GuardError, requireUser, requireWritableDocumentItem } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { memorySearchErrorOrFallback, memorySearchPublicErrorMessage } from '@/lib/memory-search';
import { omitClientWorkflowPrompt } from '@/lib/workflow-prompt-keys';
import { resolveAuthorizedProjectMemoryScope } from '@/server/memory';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';

type PostEditRunPhase = 'query' | 'evaluation' | 'rewrite';

export type PostEditRunResult =
    | {
          success: true;
          query: { hits: MemoryHit[] };
          evaluation: any;
          rewrite: string;
      }
    | {
          success: false;
          phase: PostEditRunPhase;
          /** A deliberately public workflow or retrieval message. */
          error: string;
      };

const logger = createLogger(
    {
        type: 'actions:postedit',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
/**
 * 语篇查询 Server Action
 */
export async function queryDiscourseAction(
    source: string,
    options?: {
        documentItemId?: string;
    }
): Promise<{ hits: MemoryHit[] }> {
    try {
        const authCtx = await requireUser();
        const safeOptions = omitClientWorkflowPrompt(options);
        let memoryIds: string[] | undefined;
        if (safeOptions.documentItemId) {
            const item = await requireWritableDocumentItem(safeOptions.documentItemId, authCtx);
            const scope = await resolveAuthorizedProjectMemoryScope(
                item.document.projectId,
                authCtx
            );
            memoryIds = scope.hasBindings ? scope.memoryIds : undefined;
        }
        const agent = new DiscourseQueryAgent();
        const result = await agent.execute({
            source,
            owner: authCtx,
            memoryIds,
        });
        return result;
    } catch (error) {
        logger.error('语篇查询失败:', error);
        // Permission failures retain their normal guard semantics. All other
        // retrieval/provider failures are deliberately reduced to a known-safe
        // message that the IDE can distinguish from a genuine empty query.
        if (error instanceof GuardError) throw error;
        throw new Error(memorySearchPublicErrorMessage(error));
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
    }
): Promise<any> {
    try {
        const authCtx = await requireUser();
        const safeOptions = omitClientWorkflowPrompt(options);
        const prompt = await resolveWorkflowPrompt(authCtx, 'discourse-evaluate');
        const agent = new DiscourseEvaluateAgent();
        const result = await agent.execute({
            source,
            target,
            references: safeOptions.references,
            prompt,
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
    references: MemoryHit[]
): Promise<string> {
    try {
        const authCtx = await requireUser();
        const prompt = await resolveWorkflowPrompt(authCtx, 'discourse-embed');
        const agent = new DiscourseEmbedAgent();
        const result = await agent.execute({
            source,
            target,
            references,
            prompt,
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
        documentItemId?: string;
    }
): Promise<PostEditRunResult> {
    let phase: PostEditRunPhase = 'query';
    try {
        await requireUser();
        const safeOptions = omitClientWorkflowPrompt(options);
        // 1. 语篇查询
        const query = await queryDiscourseAction(sourceText, {
            documentItemId: safeOptions.documentItemId,
        });

        // 2. 语篇评估（使用查询到的所有结果作为参考）
        phase = 'evaluation';
        const evaluation = await evaluateDiscourseAction(sourceText, targetText, {
            references: query.hits,
        });

        // 3. 语篇嵌入改写（使用查询到的所有结果作为参考）
        phase = 'rewrite';
        const rewrite = await embedDiscourseAction(sourceText, targetText, query.hits);

        return {
            success: true,
            query,
            evaluation,
            rewrite,
        };
    } catch (error) {
        logger.error('译后编辑流程失败:', error);
        // The query action already reduced retrieval outages to the small
        // public vocabulary above. Preserve only that known-safe detail here;
        // evaluation, rewrite, and persistence errors stay workflow-generic.
        return {
            success: false,
            phase,
            error: memorySearchErrorOrFallback(error, '译后编辑流程失败'),
        };
    }
}
