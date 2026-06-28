'use server';

import { DocumentItem, findDocumentItemsByDocumentIdDB } from '@/db/documentItem';
import { requireOwnedProject } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { DocumentTab, ExplorerTabs } from '@/types/explorerTabs';
import { getTranslations } from 'next-intl/server';
// 在文件开头添加类型定义
type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

function basename(value: string) {
    return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

function getDocumentDisplayName(document: { name?: string | null; originalName?: string | null }) {
    const originalName = String(document.originalName || '').trim();
    if (originalName) return basename(originalName);

    const storedName = String(document.name || '').trim();
    return basename(storedName);
}

function trimItemName(text: string, fallback: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

// 获取项目下的所有文档，并转换为标签页格式
const logger = createLogger(
    {
        type: 'actions:explorer-tabs',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export async function fetchProjectTabsAction(projectId: string): Promise<ExplorerTabs> {
    const t = await getTranslations('IDE.explorerPanel');

    try {
        const project = await requireOwnedProject(projectId);
        const documentTabs: DocumentTab[] = [];
        for (const document of project?.documents || []) {
            const documentItems = await findDocumentItemsByDocumentIdDB(document.id, {
                take: 500,
            });
            documentTabs.push({
                id: document.id,
                name: getDocumentDisplayName(document),
                items: documentItems.map((item: DocumentItem, index: number) => ({
                    id: item.id,
                    name: trimItemName(item.sourceText, t('segment', { index: index + 1 })),
                    status: item.status,
                    type: item.type,
                    sourceText: item.sourceText,
                    order: item.order,
                    metadata: (item.metadata as Metadata | null) ?? null,
                })),
                collapsed: false,
            });
        }
        const projectTabs = {
            projectId: projectId,
            projectName: project?.name || t('project'),
            documentTabs: documentTabs,
        };
        logger.info('项目文档信息', { projectId, documentCount: documentTabs.length });
        if (!projectTabs.documentTabs.length) {
            return { projectId: '0', projectName: t('welcomePage'), documentTabs: [] };
        }
        return projectTabs;
    } catch (error) {
        logger.error('获取项目文档失败:', error);
        return { projectId: '0', projectName: t('welcomePage'), documentTabs: [] };
    }
}
