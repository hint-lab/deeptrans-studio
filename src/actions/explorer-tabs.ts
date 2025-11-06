'use server';

import { findProjectByIdDB } from "@/db/project";
import { findDocumentByIdDB } from "@/db/document";
import { auth } from "@/auth";
import { DocumentTab, DocumentItemTab, ExplorerTabs } from "@/types/explorerTabs";
import { findDocumentItemsByDocumentIdDB, DocumentItem } from "@/db/documentItem";
import { getTranslations } from "next-intl/server";

// 在文件开头添加类型定义
type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

// 获取项目下的所有文档，并转换为标签页格式

export async function fetchProjectTabsAction(projectId: string): Promise<ExplorerTabs> {
    const session = await auth();
    const t = await getTranslations('IDE.explorerPanel');

    if (!session?.user?.id) return { projectId: "0", projectName: t('welcomePage'), documentTabs: [] };

    try {
        const project = await findProjectByIdDB(projectId);
        const documentTabs: DocumentTab[] = [];
        for (const document of project?.documents || []) {
            const documentItems = await findDocumentItemsByDocumentIdDB(document.id);
            documentTabs.push({
                id: document.id,
                name: document.name,
                items: documentItems.map((item: DocumentItem, index: number) => ({
                    id: item.id,
                    name: t('segment', { index: index + 1 }),
                    status: item.status
                })),
                collapsed: false
            });
        }
        const projectTabs = {
            projectId: projectId,
            projectName: project?.name || t('project'),
            documentTabs: documentTabs
        };
        console.log(projectTabs)
        if (!projectTabs.documentTabs.length) {
            return { projectId: "0", projectName: t('welcomePage'), documentTabs: [] };
        }
        return projectTabs;
    } catch (error) {
        console.error("获取项目文档失败:", error);
        return { projectId: "0", projectName: t('welcomePage'), documentTabs: [] };
    }
}
