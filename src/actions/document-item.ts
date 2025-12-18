'use server';

import { findDocumentItemByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { findDocumentByIdDB, updateDocumentStatusDB } from '@/db/document';
import type { TranslationStage } from '@prisma/client';

export type ContentIDType = {
    id: string;
    name: string;
    isSelected?: boolean;
    children?: ContentIDType[];
};

export type TabType = {
    id: string;
    name: string;
    isActive?: boolean;
};

// 在文件开头添加类型定义
type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

// 更新文档项原文
export async function updateOriginalTextAction(itemId: string, sourceText: string) {
    try {
        return await updateDocumentItemByIdDB(itemId, { sourceText });
    } catch (error) {
        console.error('更新原文失败:', error);
        throw new Error('更新原文失败');
    }
}
export async function updateTranslationAction(itemId: string, targetText: string) {
    try {
        return await updateDocumentItemByIdDB(itemId, { targetText });
    } catch (error) {
        console.error('更新译文失败:', error);
        throw new Error('更新译文失败');
    }
}

// 更新文档项状态（Server Action）
export async function updateDocItemStatusAction(itemId: string, status: TranslationStage | string) {
    try {
        const s = status as TranslationStage;
        const updated = await updateDocumentItemByIdDB(itemId, { status: s });

        return updated;
    } catch (error) {
        console.error('更新文档项状态失败:', error);
        throw new Error((error as any)?.message || '更新文档项状态失败');
    }
}

// 根据内容ID获取详细内容
export const getContentByIdAction = async (id: string) => {
    try {
        const documentItem = await findDocumentItemByIdDB(id);

        // 确保返回的数据包含预期的字段
        if (!documentItem) return null;
        const target = (() => {
            const t = documentItem.targetText ? String(documentItem.targetText).trim() : '';
            if (t) return t;
            const embedded = (documentItem as any)?.preTranslateEmbedded;
            return embedded ? String(embedded) : '';
        })();
        return {
            sourceText: documentItem.sourceText,
            targetText: target,
            status: (documentItem as any)?.status || 'NOT_STARTED',
        };
    } catch (error) {
        console.error('获取文档内容失败:', error);
        throw error;
    }
};

// Server Action: 通过分段ID获取所属文档的云端预览信息
export async function getDocumentPreviewByItemIdAction(itemId: string) {
    try {
        const item = await findDocumentItemByIdDB(itemId);
        if (!item || !item.documentId) return null;
        const doc = await findDocumentByIdDB(item.documentId);
        if (!doc) return null;
        return { documentId: doc.id, url: doc.url, mimeType: doc.mimeType, name: doc.originalName };
    } catch (error) {
        console.error('获取预览信息失败:', error);
        return null;
    }
}
