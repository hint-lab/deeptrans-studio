type DocumentItemLike = { id?: unknown };
type DocumentTabLike = { items?: DocumentItemLike[] };

/**
 * Route changes and Redux updates are not atomic. Do not render a previously
 * selected segment in the post-edit panel until Explorer has confirmed that
 * the segment belongs to the project currently shown in the URL.
 */
export function isCurrentProjectPostEditItem({
    routeProjectId,
    explorerProjectId,
    activeItemId,
    documentTabs,
}: {
    routeProjectId: unknown;
    explorerProjectId: unknown;
    activeItemId: unknown;
    documentTabs: unknown;
}) {
    const projectId = String(routeProjectId || '').trim();
    const loadedProjectId = String(explorerProjectId || '').trim();
    const itemId = String(activeItemId || '').trim();

    if (!projectId || projectId !== loadedProjectId || !itemId || !Array.isArray(documentTabs)) {
        return false;
    }

    return documentTabs.some(tab =>
        Array.isArray((tab as DocumentTabLike)?.items)
            ? (tab as DocumentTabLike).items!.some(item => String(item?.id || '') === itemId)
            : false
    );
}
