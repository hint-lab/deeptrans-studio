export type EditorContentSyncDecision = {
    isLocalEcho: boolean;
    shouldSetEditorContent: boolean;
    shouldSyncStore: boolean;
};

/**
 * Keep a TipTap editor stable while its local update is echoed back through
 * Redux. A different item or genuinely external content still replaces the
 * editor's document and updates the store.
 */
export function getEditorContentSyncDecision({
    previousEditorId,
    editorId,
    incomingContent,
    lastLocalContent,
    currentEditorContent,
}: {
    previousEditorId: string | null;
    editorId: string;
    incomingContent: string;
    lastLocalContent: string | null;
    currentEditorContent: string;
}): EditorContentSyncDecision {
    const itemChanged = previousEditorId !== editorId;
    const isLocalEcho = !itemChanged && lastLocalContent === incomingContent;
    const contentChanged = currentEditorContent !== incomingContent;

    return {
        isLocalEcho,
        shouldSetEditorContent: !isLocalEcho && contentChanged,
        shouldSyncStore: itemChanged || (!isLocalEcho && contentChanged),
    };
}
