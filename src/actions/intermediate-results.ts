'use server';

import { clearDocumentItemIntermediateResultsDB, fetchDocumentItemIntermediateResultsDB, findDocumentItemMetadataByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { createLogger } from '@/lib/logger';
const logger = createLogger({
    type: 'actions:intermediate-results',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
// 保存预翻译中间结果
export async function savePreTranslateResultsAction(
    id: string,
    results: {
        terms?: any;
        dict?: any;
        embedded?: any;
        targetText?: any;
    }
) {
    try {
        return await updateDocumentItemByIdDB(id, {
            preTranslateTerms: results.terms as any,
            preTranslateDict: results.dict as any,
            preTranslateEmbedded: results.embedded as any,
            targetText: results.targetText as any,
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
    }
) {
    try {
        const meta = await findDocumentItemMetadataByIdDB(id);
        return await updateDocumentItemByIdDB(id, {
            qualityAssureBiTerm: results.biTerm as any,
            qualityAssureSyntax: results.syntax as any,
            qualityAssureSyntaxEmbedded: results.syntaxEmbedded as any,
            // 将用户踩的对对齐结果存入 metadata
            metadata: results.dislikedPairs
                ? { ...(meta || {}), qaDislikedPairs: results.dislikedPairs }
                : undefined,
        } as any);
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
        const item = await fetchDocumentItemIntermediateResultsDB(id);
        if (!item) return null;

        return {
            sourceText: item.sourceText,
            targetText: item.targetText,
            preTranslateTerms: item.preTranslateTerms,
            preTranslateDict: item.preTranslateDict,
            preTranslateEmbedded: item.preTranslateEmbedded,
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
            metadata: item.metadata,
        };
    } catch (error) {
        logger.error('获取中间结果失败:', error);
        throw error;
    }
}

// 清空文档项的中间结果
export async function clearDocumentItemIntermediateResultsAction(id: string) {
    try {
        return await clearDocumentItemIntermediateResultsDB(id);
    } catch (error) {
        logger.error('清空中间结果失败:', error);
        throw error;
    }
}
