'use server';

import { findDocumentByIdDB } from '@/db/document';
import { findDocumentItemByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { createLogger } from '@/lib/logger';
import type { TranslationStage } from '@prisma/client';
const logger = createLogger({
    type: 'actions:document-item',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
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
        logger.error('更新原文失败:', error);
        throw new Error('更新原文失败');
    }
}
export async function updateTranslationAction(itemId: string, targetText: string) {
    try {
        return await updateDocumentItemByIdDB(itemId, { targetText });
    } catch (error) {
        logger.error('更新译文失败:', error);
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
        logger.error('更新文档项状态失败:', error);
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
        logger.error('获取文档内容失败:', error);
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
        logger.error('获取预览信息失败:', error);
        return null;
    }
}
