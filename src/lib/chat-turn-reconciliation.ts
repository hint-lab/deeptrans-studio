export type UncommittedChatTurnReconciliation =
    | { kind: 'ignore' }
    | { kind: 'reset-new-draft' }
    | { kind: 'reload-existing'; conversationId: string }
    | { kind: 'fail-closed' };

/**
 * A late request must never repaint a conversation after its project/segment
 * scope changed. For a new thread there is no authoritative id to reload, so
 * retain its blank draft; an existing thread is reloaded by its explicit id
 * rather than whichever thread another tab made active meanwhile.
 */
export function resolveUncommittedChatTurnReconciliation(input: {
    requestScopeKey: string;
    currentScopeKey: string;
    isRequestFresh: boolean;
    isNewConversation: boolean;
    conversationId?: string | null;
}): UncommittedChatTurnReconciliation {
    if (!input.isRequestFresh || input.requestScopeKey !== input.currentScopeKey) {
        return { kind: 'ignore' };
    }

    if (input.isNewConversation) return { kind: 'reset-new-draft' };

    const conversationId = String(input.conversationId || '').trim();
    if (conversationId) return { kind: 'reload-existing', conversationId };

    // Do not silently load a scope's possibly changed active conversation.
    return { kind: 'fail-closed' };
}
