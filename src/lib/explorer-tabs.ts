import type { DocumentItem } from '@/db/documentItem';
import type { DocumentTab, ExplorerTabs } from '@/types/explorerTabs';

type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

export type ExplorerProjectDocument = {
    id: string;
    name?: string | null;
    originalName?: string | null;
};

export type ExplorerProjectForTabs = {
    id: string;
    name?: string | null;
    documents?: ExplorerProjectDocument[] | null;
};

export type ExplorerTabsBuildOptions = {
    fallbackProjectName: string;
    getSegmentLabel: (index: number) => string;
    getDocumentItems: (documentId: string) => Promise<DocumentItem[]>;
};

function basename(value: string) {
    return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

function getDocumentDisplayName(document: ExplorerProjectDocument) {
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

/**
 * Turns an already authorized project into Explorer data. An empty
 * `documents` list is a successful empty project; callers deliberately retain
 * read failures so the UI can render a recoverable error rather than an empty
 * tree.
 */
export async function buildExplorerTabsForProject(
    project: ExplorerProjectForTabs,
    { fallbackProjectName, getSegmentLabel, getDocumentItems }: ExplorerTabsBuildOptions
): Promise<ExplorerTabs> {
    const documentTabs: DocumentTab[] = [];

    for (const document of project.documents || []) {
        const documentItems = await getDocumentItems(document.id);
        documentTabs.push({
            id: document.id,
            name: getDocumentDisplayName(document),
            items: documentItems.map((item: DocumentItem, index: number) => ({
                id: item.id,
                name: trimItemName(item.sourceText, getSegmentLabel(index + 1)),
                status: item.status,
                type: item.type,
                sourceText: item.sourceText,
                order: item.order,
                metadata: (item.metadata as Metadata | null) ?? null,
            })),
            collapsed: false,
        });
    }

    return {
        projectId: project.id,
        projectName: String(project.name || '').trim() || fallbackProjectName,
        documentTabs,
    };
}
