'use server';

import {
    clearDocumentItemIntermediateResultsDB,
    fetchDocumentItemIntermediateResultsDB,
    updateDocumentItemByIdDB,
} from '@/db/documentItem';
import { prisma } from '@/lib/db';
import { requireWritableDocumentItem } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { sourceRevision, withSourceRevisions } from '@/lib/source-revision';
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
// 保存预翻译中间结果
export async function savePreTranslateResultsAction(
    id: string,
    results: {
        terms?: any;
        dict?: any;
        embedded?: any;
        targetText?: any;
    },
    expectedSourceText?: string
) {
    try {
        const item = await requireWritableDocumentItem(id);
        if (
            expectedSourceText !== undefined &&
            String((item as any)?.sourceText || '') !== String(expectedSourceText)
        ) {
            throw new Error('当前分段原文已变化，已拒绝写入过期翻译结果');
        }
        const hasOwn = (key: keyof typeof results) =>
            Object.prototype.hasOwnProperty.call(results, key);
        const writesPreTranslate = hasOwn('terms') || hasOwn('dict') || hasOwn('embedded');
        const writesTarget = hasOwn('targetText');
        const metadata =
            writesPreTranslate || writesTarget
                ? withSourceRevisions(
                      (item as any)?.metadata as Record<string, unknown> | null,
                      (item as any)?.sourceText,
                      { preTranslate: writesPreTranslate, target: writesTarget }
                  )
                : undefined;
        return await updateDocumentItemByIdDB(id, {
            preTranslateTerms: results.terms as any,
            preTranslateDict: results.dict as any,
            preTranslateEmbedded: results.embedded as any,
            targetText: results.targetText as any,
            metadata,
        } as any);
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
    expected?: { sourceText?: string; targetText?: string }
) {
    try {
        const item = await requireWritableDocumentItem(id);
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
        if (hasOwn('dislikedPairs')) {
            update.metadata = {
                ...(meta || {}),
                qaDislikedPairs: results.dislikedPairs || {},
            };
        }
        const written = await prisma.documentItem.updateMany({
            where: { id, updatedAt: (item as any).updatedAt },
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
    }
) {
    try {
        await requireWritableDocumentItem(id);
        return await updateDocumentItemByIdDB(id, {
            postEditQuery: results.query as any,
            postEditEvaluation: results.evaluation as any,
            postEditRewrite: results.rewrite as any,
        } as any);
    } catch (error) {
        logger.error('保存译后编辑结果失败:', error);
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
            postEditQuery: (item as any).postEditQuery,
            postEditEvaluation: (item as any).postEditEvaluation,
            postEditRewrite: (item as any).postEditRewrite,
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
