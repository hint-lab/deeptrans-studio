'use server';

import { findDocumentItemsByDocumentIdDB } from '@/db/documentItem';
import { buildExplorerTabsForProject } from '@/lib/explorer-tabs';
import { requireOwnedProject } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { ExplorerTabs } from '@/types/explorerTabs';
import { getTranslations } from 'next-intl/server';

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
        const projectTabs = await buildExplorerTabsForProject(project, {
            fallbackProjectName: t('project'),
            getSegmentLabel: index => t('segment', { index }),
            getDocumentItems: documentId =>
                findDocumentItemsByDocumentIdDB(documentId, {
                    take: 500,
                }),
        });
        logger.info('项目文档信息', {
            projectId,
            documentCount: projectTabs.documentTabs.length,
        });
        return projectTabs;
    } catch (error) {
        logger.error('获取项目文档失败:', error);
        throw error;
    }
}
