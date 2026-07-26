'use server';

import { requireUser, requireWritableDocumentItem } from '@/lib/guards';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import {
    embedSyntaxAdvice,
    evaluateSyntax,
    extractBilingualSyntaxMarkers,
    runQualityAssureForOwner,
} from '@/server/quality-assure';
import {
    isSyntaxEvaluationTargetCompatible,
    normalizeSyntaxQualityResult,
    type SyntaxIssue,
    type SyntaxQualityResult,
} from '@/lib/syntax-quality';
import { sourceRevision, withSourceRevisions } from '@/lib/source-revision';
import { omitClientWorkflowPrompt } from '@/lib/workflow-prompt-keys';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';
const logger = createLogger(
    {
        type: 'actions:quality-assure',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
/**
 * 双语句法标记提取 Server Action
 */
export async function extractBilingualSyntaxMarkersAction(
    source: string,
    target: string
): Promise<any> {
    try {
        const authCtx = await requireUser();
        // This legacy single-step entry shares the syntax-evaluation instruction
        // layer. It must never accept a raw client prompt.
        const prompt = await resolveWorkflowPrompt(authCtx, 'syntax-evaluate');
        const result = await extractBilingualSyntaxMarkers(source, target, { prompt });
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
        locale?: string;
    }
): Promise<any> {
    try {
        const authCtx = await requireUser();
        const prompt = await resolveWorkflowPrompt(authCtx, 'syntax-evaluate');
        const result = await evaluateSyntax(source, target, {
            ...omitClientWorkflowPrompt(options),
            prompt,
        });
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
    issues: Array<Partial<SyntaxIssue> & { type?: string; span?: string }>,
    options?: { locale?: string }
): Promise<string> {
    try {
        const authCtx = await requireUser();
        const prompt = await resolveWorkflowPrompt(authCtx, 'syntax-advice-embed');
        return embedSyntaxAdvice(source, target, issues, {
            ...omitClientWorkflowPrompt(options),
            prompt,
        });
    } catch (error) {
        logger.error('句法建议嵌入失败:', error);
        throw new Error('句法建议嵌入失败');
    }
}

/**
 * Only embeds issues that belong to the persisted evaluation for this item.
 * The client supplies IDs rather than editable issue objects, so permissions,
 * revisions and the exact suggestions are all verified server-side.
 */
export async function embedSelectedSyntaxIssuesAction(
    itemId: string,
    evaluationId: string,
    selectedIssueIds: string[],
    locale?: string
): Promise<{ text: string; syntax: SyntaxQualityResult }> {
    try {
        const authCtx = await requireUser();
        const item = await requireWritableDocumentItem(itemId, authCtx);
        const syntax = normalizeSyntaxQualityResult((item as any).qualityAssureSyntax);
        if (syntax.status !== 'complete' || syntax.legacy) {
            throw new Error('质检结果不完整，请重新质检后再生成');
        }
        const evaluation = syntax.evaluation;
        if (!evaluation || evaluation.id !== evaluationId) {
            throw new Error('质检结果已变化，请重新质检后再生成');
        }
        if (evaluation.sourceRevision !== sourceRevision((item as any).sourceText)) {
            throw new Error('当前分段原文已变化，请重新质检');
        }

        const requestedIds = [...new Set(selectedIssueIds.map(String).filter(Boolean))];
        if (!requestedIds.length) throw new Error('请先勾选至少一条质检问题');
        const requested = new Set(requestedIds);
        const persistedSelectedIds = syntax.issues
            .filter(issue => syntax.selectedMap[issue.id] === true)
            .map(issue => issue.id);
        if (!sameIssueIds(requestedIds, persistedSelectedIds)) {
            throw new Error('问题选择已变化，请等待保存完成后重试');
        }
        const issues = syntax.issues.filter(issue => requested.has(issue.id));
        if (issues.length !== requested.size) {
            throw new Error('所选质检问题已失效，请重新选择');
        }

        const currentTarget = String((item as any).targetText || '');
        const previousProposal = String((item as any).qualityAssureSyntaxEmbedded || '');
        if (!isSyntaxEvaluationTargetCompatible(evaluation, currentTarget, previousProposal)) {
            throw new Error('当前译文已被修改，请重新质检后再生成');
        }
        const proposalBaseTarget = currentTarget;

        const prompt = await resolveWorkflowPrompt(authCtx, 'syntax-advice-embed');
        const text = await embedSyntaxAdvice(
            String((item as any).sourceText || ''),
            proposalBaseTarget,
            issues,
            { locale, prompt }
        );
        if (!String(text || '').trim()) throw new Error('未生成有效修订译文，请重试');

        // The model call is slow. Re-read every piece of provenance before writing so
        // a rerun, edit or selection change that happened meanwhile cannot be overwritten.
        const latestItem = await requireWritableDocumentItem(itemId, authCtx);
        const latestSyntax = normalizeSyntaxQualityResult((latestItem as any).qualityAssureSyntax);
        if (latestSyntax.status !== 'complete' || latestSyntax.legacy) {
            throw new Error('质检结果不完整，请重新质检后再生成');
        }
        const latestEvaluation = latestSyntax.evaluation;
        if (!latestEvaluation || latestEvaluation.id !== evaluationId) {
            throw new Error('质检结果已变化，请重新质检后再生成');
        }
        if (latestEvaluation.sourceRevision !== sourceRevision((latestItem as any).sourceText)) {
            throw new Error('当前分段原文已变化，请重新质检');
        }
        const latestSelectedIds = latestSyntax.issues
            .filter(issue => latestSyntax.selectedMap[issue.id] === true)
            .map(issue => issue.id);
        if (!sameIssueIds(requestedIds, latestSelectedIds)) {
            throw new Error('问题选择已变化，请重新生成');
        }
        const latestTarget = String((latestItem as any).targetText || '');
        const latestProposal = String((latestItem as any).qualityAssureSyntaxEmbedded || '');
        if (!isSyntaxEvaluationTargetCompatible(latestEvaluation, latestTarget, latestProposal)) {
            throw new Error('当前译文已被修改，请重新质检后再生成');
        }
        if (latestTarget !== proposalBaseTarget) {
            throw new Error('当前译文已变化，请按最新译文重新生成');
        }

        const selectedMap = Object.fromEntries(
            latestSyntax.issues.map(issue => [issue.id, requested.has(issue.id)])
        );
        const nextSyntax: SyntaxQualityResult = {
            ...latestSyntax,
            selectedMap,
            evaluation: {
                ...latestEvaluation,
                embeddedIssueIds: requestedIds,
                proposalBaseTarget,
            },
        };
        await updateDocumentItemAtomically(
            latestItem,
            {
                qualityAssureSyntax: nextSyntax as any,
                qualityAssureSyntaxEmbedded: text as any,
            },
            '质检结果已被其他操作更新，请重试'
        );
        return { text, syntax: nextSyntax };
    } catch (error) {
        logger.error('按所选问题生成句法修订失败:', error);
        throw error;
    }
}

/**
 * Persists only the user's issue selection against a specific evaluation.
 * The client never writes model-produced relations, advice or provenance.
 */
export async function updateSyntaxIssueSelectionAction(
    itemId: string,
    evaluationId: string,
    selectedIssueIds: string[]
): Promise<SyntaxQualityResult> {
    const item = await requireWritableDocumentItem(itemId);
    const syntax = normalizeSyntaxQualityResult((item as any).qualityAssureSyntax);
    if (syntax.status !== 'complete' || syntax.legacy) {
        throw new Error('质检结果不完整，请重新质检后再选择');
    }
    const evaluation = syntax.evaluation;
    if (!evaluation || evaluation.id !== evaluationId) {
        throw new Error('质检结果已变化，请重新质检后再选择');
    }
    if (evaluation.sourceRevision !== sourceRevision((item as any).sourceText)) {
        throw new Error('当前分段原文已变化，请重新质检');
    }

    const requestedIds = [...new Set(selectedIssueIds.map(String).filter(Boolean))];
    const requested = new Set(requestedIds);
    if (syntax.issues.filter(issue => requested.has(issue.id)).length !== requested.size) {
        throw new Error('所选质检问题已失效，请重新选择');
    }

    const currentTarget = String((item as any).targetText || '');
    const proposal = String((item as any).qualityAssureSyntaxEmbedded || '');
    if (!isSyntaxEvaluationTargetCompatible(evaluation, currentTarget, proposal)) {
        throw new Error('当前译文已被修改，请重新质检后再选择');
    }

    const nextSyntax: SyntaxQualityResult = {
        ...syntax,
        selectedMap: Object.fromEntries(
            syntax.issues.map(issue => [issue.id, requested.has(issue.id)])
        ),
    };
    await updateDocumentItemAtomically(
        item,
        { qualityAssureSyntax: nextSyntax as any },
        '问题选择与其他操作冲突，请重试'
    );
    return nextSyntax;
}

export async function applySyntaxRevisionAction(
    itemId: string,
    evaluationId: string,
    version: 'base' | 'proposal'
): Promise<{ text: string }> {
    const item = await requireWritableDocumentItem(itemId);
    const syntax = normalizeSyntaxQualityResult((item as any).qualityAssureSyntax);
    if (syntax.status !== 'complete' || syntax.legacy) {
        throw new Error('质检结果不完整，请重新质检后再应用');
    }
    const evaluation = syntax.evaluation;
    if (!evaluation || evaluation.id !== evaluationId) {
        throw new Error('质检结果已变化，请重新质检后再应用');
    }
    if (evaluation.sourceRevision !== sourceRevision((item as any).sourceText)) {
        throw new Error('当前分段原文已变化，请重新质检');
    }

    const proposal = String((item as any).qualityAssureSyntaxEmbedded || '');
    const selectedIds = syntax.issues
        .filter(issue => syntax.selectedMap[issue.id] === true)
        .map(issue => issue.id);
    if (
        version === 'proposal' &&
        (!proposal || !sameIssueIds(selectedIds, evaluation.embeddedIssueIds || []))
    ) {
        throw new Error('修订译文已过期，请按当前选择重新生成');
    }

    const currentTarget = String((item as any).targetText || '');
    if (!isSyntaxEvaluationTargetCompatible(evaluation, currentTarget, proposal)) {
        throw new Error('当前译文已被修改，请重新质检后再应用');
    }

    const text = version === 'base' ? evaluation.baseTarget : proposal;
    const metadata = withSourceRevisions(
        (item as any).metadata as Record<string, unknown> | null,
        (item as any).sourceText,
        { target: true }
    );
    await updateDocumentItemAtomically(
        item,
        { targetText: text, metadata } as any,
        '当前译文已被其他操作更新，请重试'
    );
    return { text };
}

async function updateDocumentItemAtomically(
    item: any,
    data: Record<string, unknown>,
    conflictMessage: string
) {
    const result = await prisma.documentItem.updateMany({
        where: { id: item.id, updatedAt: item.updatedAt },
        data,
    });
    if (Number(result?.count || 0) !== 1) throw new Error(conflictMessage);
}

function sameIssueIds(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
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
        projectId?: string;
        locale?: string;
    }
): Promise<{
    biTerm: any;
    syntax: any;
    syntaxEmbedded: null;
}> {
    const authCtx = await requireUser();
    const safeOptions = omitClientWorkflowPrompt(options);
    const prompt = await resolveWorkflowPrompt(authCtx, 'syntax-evaluate');
    return runQualityAssureForOwner(sourceText, targetText, authCtx, { ...safeOptions, prompt });
}
