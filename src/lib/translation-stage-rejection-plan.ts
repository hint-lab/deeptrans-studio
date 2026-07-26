import type { TranslationStage } from '@/store/features/translationSlice';

export type TranslationStageRejectionPlan = {
    /** Status updates must remain adjacent so the server-side workflow guard accepts them. */
    statusUpdates: TranslationStage[];
    /** The stage the client should display once every persisted update succeeds. */
    finalStage: TranslationStage;
    /**
     * POST_EDIT_REVIEW is reset by a dedicated, atomic server operation rather
     * than by generic status updates followed by a separate artifact clear.
     */
    usesAtomicPostEditReviewReset: boolean;
};

const singleStageRejectionPlan = (stage: TranslationStage): TranslationStageRejectionPlan => ({
    statusUpdates: [stage],
    finalStage: stage,
    usesAtomicPostEditReviewReset: false,
});

/**
 * Maps a user rejection to the smallest valid, server-guarded rollback path.
 * POST_EDIT_REVIEW is special: its proposal and status must be reset together
 * by a server-owned atomic operation, returning the reviewer to QA_REVIEW.
 */
export function getTranslationStageRejectionPlan(
    stage: TranslationStage
): TranslationStageRejectionPlan {
    switch (stage) {
        case 'MT':
            return singleStageRejectionPlan('NOT_STARTED');
        case 'MT_REVIEW':
            return singleStageRejectionPlan('MT');
        case 'QA':
            return singleStageRejectionPlan('MT_REVIEW');
        case 'QA_REVIEW':
            return singleStageRejectionPlan('QA');
        case 'POST_EDIT':
            return singleStageRejectionPlan('QA_REVIEW');
        case 'POST_EDIT_REVIEW':
            return {
                statusUpdates: [],
                finalStage: 'QA_REVIEW',
                usesAtomicPostEditReviewReset: true,
            };
        case 'SIGN_OFF':
            return singleStageRejectionPlan('POST_EDIT_REVIEW');
        case 'COMPLETED':
            return singleStageRejectionPlan('SIGN_OFF');
        case 'ERROR':
        case 'CANCELED':
        case 'NOT_STARTED':
        default:
            return singleStageRejectionPlan('NOT_STARTED');
    }
}
