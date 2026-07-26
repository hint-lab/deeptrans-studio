function normalizedId(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

/** Pure scope key shared by the client rendering gate and server scope model. */
export function chatConversationScopeKeyFromIds(projectId: unknown, documentItemId: unknown) {
    return `project=${encodeURIComponent(normalizedId(projectId))};item=${encodeURIComponent(
        normalizedId(documentItemId)
    )}`;
}

/**
 * The selected explorer item changes before its editor payload is loaded.
 * During that hand-off, `loadedDocumentItemId` and its draft text still belong
 * to the previous item. Scope chat by the newly selected item immediately;
 * when there is no selected item, use project chat rather than reviving a
 * stale editor segment. A local draft is attached only after it belongs to the
 * exact selected scope.
 */
export function resolveVisibleChatConversationScope(input: {
    projectId?: unknown;
    activeDocumentItemId?: unknown;
    loadedDocumentItemId?: unknown;
}) {
    const projectId = normalizedId(input.projectId);
    const activeDocumentItemId = normalizedId(input.activeDocumentItemId);
    const loadedDocumentItemId = normalizedId(input.loadedDocumentItemId);
    const documentItemId = activeDocumentItemId;

    return {
        projectId,
        documentItemId,
        usesLoadedDocumentItem: Boolean(documentItemId && documentItemId === loadedDocumentItemId),
    };
}

/**
 * Empty chat and unavailable saved chat are different user-facing states.
 * Keep an error scoped to the request that produced it so an older scope's
 * failure cannot make a newly selected segment look broken.
 */
export function resolveChatConversationLoadState(input: {
    currentScopeKey: string;
    loadedScopeKey: string | null;
    isLoading: boolean;
    errorScopeKey?: string | null;
}) {
    if (input.isLoading) return 'loading' as const;
    if (input.loadedScopeKey === input.currentScopeKey) return 'ready' as const;
    if (input.errorScopeKey === input.currentScopeKey) return 'error' as const;
    return 'loading' as const;
}

export function canOperateChatConversation(input: {
    currentScopeKey: string;
    loadedScopeKey: string | null;
    isLoading: boolean;
    isTransitioning?: boolean;
    isSubmitting?: boolean;
}) {
    return (
        input.currentScopeKey === input.loadedScopeKey &&
        !input.isLoading &&
        !input.isTransitioning &&
        !input.isSubmitting
    );
}
