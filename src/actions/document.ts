'use server';

import { findDocumentsByProjectIdDB, updateDocumentStatusDB, findDocumentByIdDB , findDocumentWithItemsByIdDB } from "@/db/document";
import { createDocumentItemsBulkDB, deleteDocumentItemsByDocumentIdDB, type DocumentItem } from "@/db/documentItem"; 
import { buildSentencePlaceholders } from "@/lib/placeholder";
import { updateDocumentByIdDB } from "@/db/document";   
import { DocumentStatus } from "@/types/enums";
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

// 预览/应用分段：迁移自 actions/segment-preview
export type PreviewSegmentItem = { type: string; sourceText: string; order?: number; metadata?: any };

// 预览改由队列实现，移除 previewSegmentAction

export async function applySegmentAction(documentId: string, items: PreviewSegmentItem[]) {
    const doc = await findDocumentWithItemsByIdDB(documentId);
    if (!doc) throw new Error('未找到文档');
    // 清空旧分段
    await deleteDocumentItemsByDocumentIdDB(documentId);
    const normalized = (items || []).map((it, idx) => {
        // 清理空字节和其他无效字符，确保数据库兼容性
        const text = String(it.sourceText || '')
            .replace(/\0/g, '') // 移除空字节
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除其他控制字符
            .trim();
        const rawType = String((it as any)?.type || '').trim();
        const upper = rawType.toUpperCase();
        const lvl = (it as any)?.metadata?.level;
        const isHeading = upper.startsWith('HEADING') || (typeof lvl === 'number' && lvl >= 1 && lvl <= 6) || upper === 'TITLE';
        const normalizedType = isHeading ? 'HEADING' : 'TEXT';
        const meta: any = { ...(it as any)?.metadata, normalizedType };
        // 类型字段保存 JSON 的原始样式名（若有），以保留格式信息；无样式名时回退为 HEADING-n / 原始type / 归一化
        const styleName = (it as any)?.metadata?.styleName;
        const typeToPersist = styleName ? String(styleName) : (typeof lvl === 'number' ? `HEADING-${lvl}` : (rawType || normalizedType));
        return {
        documentId,
        order: idx + 1,
        sourceText: text,
        targetText: '',
        status: 'NOT_STARTED',
        // 按用户期望保留 JSON 的格式信息
        type: typeToPersist,
        metadata: meta,
    };
    }).filter(x => x.sourceText);
    if (!normalized.length) throw new Error('没有可应用的分段');
    await createDocumentItemsBulkDB(normalized as any);
    // 适配新数据结构：不再写入 segment* 字段，状态流转统一使用 Document.status
    try { await updateDocumentStatusDB(documentId, DocumentStatus.PREPROCESSED as any) } catch {}
    return { count: normalized.length, projectId: doc.projectId } as { count: number; projectId: string };
}

// 在文件开头添加类型定义
type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

// 获取项目下的所有文档，并转换为标签页格式
export async function fetchProjectTabsAction(projectId: string): Promise<TabType[]> {
    try {
        const documents = await findDocumentsByProjectIdDB(projectId);
        if (!documents) return [{ id: "0", name: "欢迎页" }];
        if (!documents?.length) {
            return [{ id: "0", name: "欢迎页" }];
        }

        return documents?.map(doc => ({
            id: doc.id,
            name: doc.originalName,
            active: false
        }));
    } catch (error) {
        console.error("获取项目文档失败:", error);
        return [{ id: "0", name: "欢迎页" }];
    }
}

// 获取文档内容并转换为树状结构
export async function fetchDocumentStructureAction(documentId: string): Promise<ContentIDType[]> {
    if (documentId === "0") {
        return []; // 欢迎页没有内容结构
    }

    try {
        const document = await findDocumentWithItemsByIdDB(documentId);
        if (!document) {
            console.error("获取文档结构失败:", "未找到文档");
            return [];
        }

        // 分析文档项，构建层次结构
        const headings: { [key: string]: ContentIDType } = {};
        const rootElements: ContentIDType[] = [];

        // 首先创建根节点
        const rootNode: ContentIDType = {
            id: document.id,
            name: document.originalName,
            children: []
        };
        rootElements.push(rootNode);

        // 按类型和层级组织文档项
        document?.documentItems?.forEach((item: DocumentItem) => {
            if (item.type === "HEADING") {
                // 创建章节节点
                const section: ContentIDType = {
                    id: item.id,
                    name: item.sourceText,
                    isSelected: false
                };

                // 解析元数据并确保是正确的类型
                const metadata = item.metadata as Metadata | null;
                const level = metadata?.level || 1;

                if (level === 1) {
                    // 顶级标题直接添加到根节点
                    if (!rootNode.children) rootNode.children = [];
                    rootNode.children.push(section);
                    headings[item.id] = section;
                } else if (level === 2) {
                    // 二级标题添加到其父标题下
                    const parentId = metadata?.parentId;
                    if (parentId && headings[parentId]) {
                        const parent = headings[parentId];
                        if (!parent.children) parent.children = [];
                        parent.children.push(section);
                        headings[item.id] = section;
                    }
                }
            } else if (item.type === "TEXT") {
                // 文本内容添加到对应标题下
                const metadata = item.metadata as Metadata | null;
                const headingId = metadata?.headingId;

                if (headingId && headings[headingId]) {
                    const heading = headings[headingId];
                    if (!heading.children) heading.children = [];
                    heading.children.push({
                        id: item.id,
                        name: item.sourceText.substring(0, 30) + "..."
                    });
                }
            }
        });

        return rootElements;
    } catch (error) {
        console.error("获取文档结构失败:", error);
        return [];
    }
}

// 获取完整文档内容
export async function fetchDocumentAction(documentId: string) {
    if (documentId === "0") {
        return null;
    }

    try {
        return await findDocumentWithItemsByIdDB(documentId);
    } catch (error) {
        console.error("获取文档内容失败:", error);
        return null;
    }
}




// 查询项目最近文档解析状态（用于进度轮询）
export async function getLatestDocumentStatusForProjectAction(projectId: string) {
    const docs = await findDocumentsByProjectIdDB(projectId);
    if (!docs) return null;
    const latest: any = docs?.[0] ?? null;
    if (!latest) return null;
    return { documentId: latest.id, status: latest.status };
}



// Server Action: 通过doc ID获取所属文档的云端预览信息
export async function fetchDocumentPreviewByDocIdAction(docId: string) {
    try {
            const doc = await findDocumentByIdDB(docId);
        if (!doc) return null;
        return { documentId: doc?.id, url: doc?.url, mimeType: doc?.mimeType, name: doc?.originalName };
    } catch (error) {
        console.error("获取预览信息失败:", error);
        return null;
    }
}

//
export async function updateDocumentStatusByIdAction(documentId: string, status: keyof typeof DocumentStatus) {
    if (!documentId) return false;
    await updateDocumentStatusDB(documentId, DocumentStatus[status] as any);
    return true;
}