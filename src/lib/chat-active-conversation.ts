export type ChatActiveConversationSnapshot = string | null | undefined;

/**
 * Parses the active thread a tab observed when it opened a local new-thread
 * draft. `undefined` means the caller supplied no usable optimistic-concurrency
 * token and must not mutate the shared default; `null` is an explicit observed
 * empty pointer.
 */
export function expectedChatActiveConversationId(
    body: Record<string, unknown>
): ChatActiveConversationSnapshot {
    if (!Object.prototype.hasOwnProperty.call(body, 'expectedActiveConversationId')) {
        return undefined;
    }
    if (body.expectedActiveConversationId === null) return null;
    if (typeof body.expectedActiveConversationId !== 'string') return undefined;
    const snapshot = body.expectedActiveConversationId.trim();
    return snapshot || undefined;
}
