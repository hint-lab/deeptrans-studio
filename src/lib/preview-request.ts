/**
 * A preview has two independent asynchronous phases: resolving the document
 * URL and rendering it in the browser.  Both must fail closed when the user
 * moves to another document or project.
 */
export function isCurrentPreviewRequest(
    requestId: number,
    currentRequestId: number,
    requestedScope: string,
    currentScope: string | null
) {
    return (
        Boolean(requestedScope) &&
        requestId === currentRequestId &&
        requestedScope === currentScope
    );
}

/**
 * Document IDs are not enough to protect a project switch: Explorer state can
 * still contain the old project's tabs while the new project is loading.
 */
export function getPreviewRequestScope(projectId: string, documentId: string) {
    if (!projectId || !documentId) return null;
    return JSON.stringify([projectId, documentId]);
}

/** A missing project/document scope must never retain a preview from another project. */
export function shouldClearPreview(scope: string | null) {
    return !scope;
}
