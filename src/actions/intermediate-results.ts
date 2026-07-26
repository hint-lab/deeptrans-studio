'use server';

import {
    clearDocumentItemIntermediateResultsDB,
    fetchDocumentItemIntermediateResultsDB,
    updateDocumentItemByIdDB,
} from '@/db/documentItem';
import { prisma } from '@/lib/db';
import { requireWritableDocumentItem } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    applyMtReviewCandidateWithUpdate,
    type MtReviewCandidateSnapshot,
} from '@/lib/mt-review-candidate-apply';
import { deserializePostEditResults, serializePostEditResults } from '@/lib/post-edit-results';
import { sourceRevision, withSourceRevisions } from '@/lib/source-revision';
import {
    hasCurrentPersistedPostEditResult,
    isCurrentQualityAssureRun,
    isCurrentPreTranslationRun,
} from '@/lib/translation-stage-transitions';
import { Prisma } from '@prisma/client';
const logger = createLogger(
    {
        type: 'actions:intermediate-results',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply a pre-translation candidate from the MT review panel. Unlike a
 * regular target save, this uses the exact source/target snapshot displayed to
 * the reviewer, so a delayed click from another tab cannot overwrite a newer
 * human revision.
 */
export async function applyMtReviewCandidateAction(
    id: string,
    candidateText: string,
    expected: MtReviewCandidateSnapshot
) {
    try {
        const item = await requireWritableDocumentItem(id);
        const snapshot: MtReviewCandidateSnapshot = {
            sourceText: String(expected?.sourceText || ''),
            targetText: String(expected?.targetText || ''),
        };
        const targetText = String(candidateText || '');
        const metadata = withSourceRevisions(
            isRecord((item as any)?.metadata)
                ? ((item as any).metadata as Record<string, unknown>)
                : null,
            (item as any)?.sourceText,
            { target: true }
        );

        await applyMtReviewCandidateWithUpdate(item, snapshot, ({ where }) =>
            prisma.documentItem.updateMany({
                where: where as any,
                data: { targetText, metadata } as any,
            })
        );

        return { targetText };
    } catch (error) {
        logger.error('应用预翻译候选译文失败:', error);
        throw error;
    }
}

// 保存预翻译中间结果
export async function savePreTranslateResultsAction(
    id: string,
    results: {
        terms?: any;
        dict?: any;
        embedded?: any;
        targetText?: any;
    },
    expectedSourceText?: string,
    expectedTargetText?: string,
    expectedPreTranslateRunId?: string
) {
    try {
        const item = await requireWritableDocumentItem(id);
        const runId =
            expectedPreTranslateRunId === undefined
                ? undefined
                : String(expectedPreTranslateRunId || '').trim();
        if (runId !== undefined && !runId) {
            throw new Error('预翻译运行标识缺失，已拒绝写入结果');
        }
        if (runId && (expectedSourceText === undefined || expectedTargetText === undefined)) {
            throw new Error('预翻译运行缺少原文或译文快照，已拒绝写入结果');
        }
        if (runId && !isCurrentPreTranslationRun(item as any, runId)) {
            throw new Error('当前预翻译任务已失效，已拒绝写入过期翻译结果');
        }
        if (
            expectedSourceText !== undefined &&
            String((item as any)?.sourceText || '') !== String(expectedSourceText)
        ) {
            throw new Error('当前分段原文已变化，已拒绝写入过期翻译结果');
        }
        if (
            expectedTargetText !== undefined &&
            String((item as any)?.targetText || '') !== String(expectedTargetText)
        ) {
            throw new Error('当前分段译文已变化，已拒绝写入过期翻译结果');
        }
        const hasOwn = (key: keyof typeof results) =>
            Object.prototype.hasOwnProperty.call(results, key);
        const writesPreTranslate = hasOwn('terms') || hasOwn('dict') || hasOwn('embedded');
        const writesTarget = hasOwn('targetText');
        if (!runId && writesPreTranslate && String((item as any)?.status || '') === 'MT') {
            throw new Error('当前预翻译阶段缺少运行标识，已拒绝写入结果');
        }
        if (runId && (!writesPreTranslate || !writesTarget)) {
            throw new Error('预翻译结果不完整，无法提交当前运行');
        }
        let metadata =
            writesPreTranslate || writesTarget
                ? withSourceRevisions(
                      isRecord((item as any)?.metadata)
                          ? ((item as any).metadata as Record<string, unknown>)
                          : null,
                      (item as any)?.sourceText,
                      { preTranslate: writesPreTranslate, target: writesTarget }
                  )
                : undefined;
        if (runId) {
            metadata = {
                ...(metadata || {}),
                preTranslateRunId: runId,
                preTranslateResultRunId: runId,
            };
        }
        const update = {
            preTranslateTerms: results.terms as any,
            preTranslateDict: results.dict as any,
            preTranslateEmbedded: results.embedded as any,
            targetText: results.targetText as any,
            metadata,
        } as any;
        if (expectedTargetText !== undefined || runId !== undefined) {
            // The formal run and undo paths both guard the exact row version
            // read above, so a concurrent edit/rollback cannot be overwritten
            // by a delayed model result or clear.
            const where: Record<string, unknown> = { id, updatedAt: (item as any).updatedAt };
            if (runId) where.status = 'MT';
            const written = await prisma.documentItem.updateMany({
                where: where as any,
                data: update,
            });
            if (Number(written?.count || 0) !== 1) {
                throw new Error('当前分段已被其他操作更新，请重试');
            }
            return written;
        }
        return await updateDocumentItemByIdDB(id, update);
    } catch (error) {
        logger.error('保存预翻译结果失败:', error);
        throw error;
    }
}

// 保存质检中间结果
export async function saveQualityAssureResultsAction(
    id: string,
    results: {
        biTerm?: any;
        syntax?: any;
        syntaxEmbedded?: any;
        dislikedPairs?: Record<string, boolean>;
    },
    expected?: { sourceText?: string; targetText?: string; qaRunId?: string }
) {
    try {
        const item = await requireWritableDocumentItem(id);
        const qaRunId =
            expected?.qaRunId === undefined ? undefined : String(expected.qaRunId || '').trim();
        if (qaRunId !== undefined && !qaRunId) {
            throw new Error('质检运行标识缺失，已拒绝写入结果');
        }
        if (qaRunId && (expected?.sourceText === undefined || expected?.targetText === undefined)) {
            throw new Error('质检运行缺少原文或译文快照，已拒绝写入结果');
        }
        if (qaRunId && !isCurrentQualityAssureRun(item as any, qaRunId)) {
            throw new Error('当前质检任务已失效，已拒绝写入过期质检结果');
        }
        if (
            expected?.sourceText !== undefined &&
            String((item as any).sourceText || '') !== expected.sourceText
        ) {
            throw new Error('当前分段原文已变化，已拒绝写入过期质检结果');
        }
        if (
            expected?.targetText !== undefined &&
            String((item as any).targetText || '') !== expected.targetText
        ) {
            throw new Error('当前分段译文已变化，已拒绝写入过期质检结果');
        }
        const meta = ((item as any).metadata as Record<string, unknown> | null) || {};
        const hasOwn = (key: keyof typeof results) =>
            Object.prototype.hasOwnProperty.call(results, key);
        const writesQualityResult =
            hasOwn('biTerm') || hasOwn('syntax') || hasOwn('syntaxEmbedded');
        if (!qaRunId && writesQualityResult && String((item as any)?.status || '') === 'QA') {
            throw new Error('当前质检阶段缺少运行标识，已拒绝写入结果');
        }
        if (qaRunId && (!hasOwn('biTerm') || !hasOwn('syntax') || !hasOwn('syntaxEmbedded'))) {
            throw new Error('质检结果不完整，无法提交当前运行');
        }
        const update: Record<string, any> = {};
        if (hasOwn('biTerm')) {
            update.qualityAssureBiTerm = results.biTerm === null ? Prisma.DbNull : results.biTerm;
        }
        if (hasOwn('syntax')) {
            update.qualityAssureSyntax = results.syntax === null ? Prisma.DbNull : results.syntax;
        }
        if (hasOwn('syntaxEmbedded')) {
            update.qualityAssureSyntaxEmbedded =
                results.syntaxEmbedded === null ? Prisma.DbNull : results.syntaxEmbedded;
        }
        if (hasOwn('dislikedPairs') || qaRunId) {
            update.metadata = {
                ...(meta || {}),
                ...(hasOwn('dislikedPairs')
                    ? { qaDislikedPairs: results.dislikedPairs || {} }
                    : {}),
                ...(qaRunId
                    ? {
                          qaRunId,
                          qaResultRunId: qaRunId,
                      }
                    : {}),
            };
        }
        if (qaRunId && !writesQualityResult) {
            throw new Error('质检结果不完整，无法提交当前运行');
        }
        const where: Record<string, unknown> = { id, updatedAt: (item as any).updatedAt };
        if (qaRunId) where.status = 'QA';
        const written = await prisma.documentItem.updateMany({
            where: where as any,
            data: update,
        });
        if (Number(written?.count || 0) !== 1) {
            throw new Error('当前分段已被其他操作更新，请重试');
        }
        return written;
    } catch (error) {
        logger.error('保存质检结果失败:', error);
        throw error;
    }
}

// 保存译后编辑中间结果
export async function savePostEditResultsAction(
    id: string,
    results: {
        query?: any;
        evaluation?: any;
        rewrite?: any;
    },
    expected?: { sourceText?: string; targetText?: string }
) {
    try {
        const item = await requireWritableDocumentItem(id);
        if (
            expected?.sourceText !== undefined &&
            String((item as any)?.sourceText || '') !== String(expected.sourceText)
        ) {
            throw new Error('当前分段原文已变化，已拒绝写入过期译后编辑结果');
        }
        if (
            expected?.targetText !== undefined &&
            String((item as any)?.targetText || '') !== String(expected.targetText)
        ) {
            throw new Error('当前分段译文已变化，已拒绝写入过期译后编辑结果');
        }
        const persisted = serializePostEditResults(results);
        const metadata = {
            ...(((item as any)?.metadata as Record<string, unknown> | null) || {}),
        };
        if (persisted.hasResults) {
            metadata.postEditSourceRevision = sourceRevision((item as any)?.sourceText);
            metadata.postEditTargetRevision = sourceRevision((item as any)?.targetText);
        } else {
            delete metadata.postEditSourceRevision;
            delete metadata.postEditTargetRevision;
        }

        const written = await prisma.documentItem.updateMany({
            where: { id, updatedAt: (item as any).updatedAt },
            data: {
                postEditDiscourse: persisted.hasResults
                    ? (persisted.postEditDiscourse as any)
                    : Prisma.DbNull,
                postEditEmbedded:
                    persisted.hasResults && persisted.postEditEmbedded !== null
                        ? (persisted.postEditEmbedded as any)
                        : Prisma.DbNull,
                metadata,
            } as any,
        });
        if (Number(written?.count || 0) !== 1) {
            throw new Error('当前分段已被其他操作更新，请重试');
        }
        return written;
    } catch (error) {
        logger.error('保存译后编辑结果失败:', error);
        throw error;
    }
}

/**
 * Apply a persisted post-edit proposal only when it still belongs to the
 * source/target pair the reviewer is looking at.  A local Redux update alone
 * is not a durable translation change and may otherwise be lost on reload.
 */
export async function applyPostEditRewriteAction(
    id: string,
    rewrite: string,
    expected: { sourceText: string; targetText: string }
) {
    try {
        const item = await requireWritableDocumentItem(id);
        const currentSource = String((item as any)?.sourceText || '');
        const currentTarget = String((item as any)?.targetText || '');
        if (currentSource !== String(expected.sourceText || '')) {
            throw new Error('当前分段原文已变化，请重新执行译后编辑');
        }
        if (currentTarget !== String(expected.targetText || '')) {
            throw new Error('当前分段译文已变化，请重新执行译后编辑');
        }
        const metadata = ((item as any)?.metadata as Record<string, unknown> | null) || {};
        const storedSourceRevision = String(metadata.postEditSourceRevision || '');
        const storedTargetRevision = String(metadata.postEditTargetRevision || '');
        if (
            (storedSourceRevision && storedSourceRevision !== sourceRevision(currentSource)) ||
            (storedTargetRevision && storedTargetRevision !== sourceRevision(currentTarget))
        ) {
            throw new Error('译后编辑建议已过期，请重新执行');
        }
        const targetText = String(rewrite || '').trim();
        if (!targetText) throw new Error('译后编辑建议为空，无法应用');

        const written = await prisma.documentItem.updateMany({
            where: { id, updatedAt: (item as any).updatedAt },
            data: {
                targetText,
                metadata: withSourceRevisions(metadata, currentSource, { target: true }),
            },
        });
        if (Number(written?.count || 0) !== 1) {
            throw new Error('当前分段已被其他操作更新，请重试');
        }
        return { targetText };
    } catch (error) {
        logger.error('应用译后编辑建议失败:', error);
        throw error;
    }
}

// 获取文档项的中间结果
export async function getDocumentItemIntermediateResultsAction(id: string) {
    try {
        await requireWritableDocumentItem(id);
        const item = await fetchDocumentItemIntermediateResultsDB(id);
        if (!item) return null;
        const metadata = ((item as any)?.metadata as Record<string, unknown> | null) || {};
        const postEditSourceRevision = String(metadata.postEditSourceRevision || '');
        const postEditTargetRevision = String(metadata.postEditTargetRevision || '');
        const postEditMatchesCurrentInput =
            (!postEditSourceRevision ||
                postEditSourceRevision === sourceRevision((item as any)?.sourceText)) &&
            (!postEditTargetRevision ||
                postEditTargetRevision === sourceRevision((item as any)?.targetText));
        // Keep historical output visible for review, but surface its freshness
        // separately. Applying it is still guarded server-side by the same
        // revisions, so an old proposal cannot overwrite newer text.
        const postEditResults = deserializePostEditResults(
            item.postEditDiscourse,
            item.postEditEmbedded
        );
        const postEditProposalStillCurrent =
            !postEditMatchesCurrentInput &&
            hasCurrentPersistedPostEditResult({
                sourceText: item.sourceText,
                targetText: item.targetText,
                metadata,
                postEditDiscourse: item.postEditDiscourse,
                postEditEmbedded: item.postEditEmbedded,
            });
        const storedRevision = String(metadata.preTranslateSourceRevision || '');
        const hasPreTranslateResult = Boolean(
            (item as any)?.preTranslateEmbedded ||
            (Array.isArray((item as any)?.preTranslateTerms) &&
                (item as any).preTranslateTerms.length) ||
            (Array.isArray((item as any)?.preTranslateDict) &&
                (item as any).preTranslateDict.length)
        );

        return {
            sourceText: item.sourceText,
            targetText: item.targetText,
            preTranslateTerms: item.preTranslateTerms,
            preTranslateDict: item.preTranslateDict,
            preTranslateEmbedded: item.preTranslateEmbedded,
            preTranslateSourceMatches:
                !hasPreTranslateResult ||
                (!!storedRevision && storedRevision === sourceRevision(item.sourceText)),
            qualityAssureBiTerm: item.qualityAssureBiTerm,
            qualityAssureSyntax: item.qualityAssureSyntax,
            postEditQuery: postEditResults.query,
            postEditEvaluation: postEditResults.evaluation,
            postEditRewrite: postEditResults.rewrite,
            postEditStale: !postEditMatchesCurrentInput && !postEditProposalStillCurrent,
            qualityAssureSyntaxEmbedded: item.qualityAssureSyntaxEmbedded,
            postEditDiscourse: item.postEditDiscourse,
            postEditEmbedded: item.postEditEmbedded,
            needsReview: item.needsReview,
            locked: item.locked,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            document: item.document,
            metadata,
        };
    } catch (error) {
        logger.error('获取中间结果失败:', error);
        throw error;
    }
}

// 清空文档项的中间结果
export async function clearDocumentItemIntermediateResultsAction(id: string) {
    try {
        await requireWritableDocumentItem(id);
        return await clearDocumentItemIntermediateResultsDB(id);
    } catch (error) {
        logger.error('清空中间结果失败:', error);
        throw error;
    }
}
