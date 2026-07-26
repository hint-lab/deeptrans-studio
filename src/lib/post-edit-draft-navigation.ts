export const POST_EDIT_DRAFT_DISCARD_MESSAGE =
    '当前译后复核译文有未保存修改。离开后本次草稿将丢失；仍要切换吗？';

export function hasUnsavedPostEditDraft({
    activeItemId,
    currentStage,
    editorItemId,
    editorJob,
    editorDirty,
}: {
    activeItemId: unknown;
    currentStage: unknown;
    editorItemId: unknown;
    editorJob: unknown;
    editorDirty: unknown;
}) {
    return (
        currentStage === 'POST_EDIT_REVIEW' &&
        Boolean(activeItemId) &&
        String(editorItemId || '') === String(activeItemId) &&
        editorJob === 'translation' &&
        editorDirty === 'true'
    );
}

/**
 * Keep navigation policy pure so every way of changing a segment can share
 * the same guard. A user who cancels the confirmation remains on the current
 * item and retains the in-memory draft.
 */
export function canLeaveCurrentPostEditDraft(
    input: Parameters<typeof hasUnsavedPostEditDraft>[0],
    confirmDiscard: () => boolean
) {
    return !hasUnsavedPostEditDraft(input) || confirmDiscard();
}
