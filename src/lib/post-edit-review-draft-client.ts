/**
 * Browser-safe helpers for the post-edit review draft UI.
 *
 * Keep this module free of persistence and provenance imports. The server
 * compare-and-set builder lives separately because it relies on `node:crypto`
 * to calculate source revisions.
 */
export function requiresPostEditReviewDraftCAS(currentStatus: unknown, nextStatus: unknown) {
    return currentStatus === 'POST_EDIT_REVIEW' && nextStatus === 'SIGN_OFF';
}

/**
 * Prefer the value actually displayed by TipTap at click time. Redux is the
 * fallback only when the editor is not mounted. The persisted snapshot stays
 * separate because it is the optimistic precondition, never the draft to
 * sign off.
 */
export function resolvePostEditReviewDraft({
    liveEditorTargetText,
    fallbackTargetText,
    persistedTargetText,
}: {
    liveEditorTargetText?: string | null;
    fallbackTargetText?: string | null;
    persistedTargetText?: string | null;
}) {
    return {
        targetText:
            liveEditorTargetText === undefined || liveEditorTargetText === null
                ? String(fallbackTargetText || '')
                : String(liveEditorTargetText),
        expectedTargetText: String(persistedTargetText || ''),
    };
}
