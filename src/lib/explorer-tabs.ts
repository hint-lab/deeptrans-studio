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

const HTML_LINE_BREAK_TAG_RE = /<\s*br\s*\/?\s*>/gi;
const HTML_BLOCK_END_TAG_RE =
    /<\/\s*(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\s*>/gi;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

/**
 * Document items may contain TipTap HTML after a translator saves a source
 * edit. Navigation labels must remain plain text, while the stored source is
 * left untouched for the editor and workflow revision checks.
 */
function richTextToPlainLabel(text: string) {
    return String(text || '')
        .replace(HTML_LINE_BREAK_TAG_RE, '\n')
        .replace(HTML_BLOCK_END_TAG_RE, '\n')
        .replace(HTML_TAG_RE, '')
        .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function trimItemName(text: string, fallback: string) {
    const normalized = richTextToPlainLabel(text).replace(/\s+/g, ' ').trim();
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
