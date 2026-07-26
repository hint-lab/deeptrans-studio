import { isReviewStage } from '@/constants/translationStages';
import type { TranslationStage } from '@/store/features/translationSlice';

export type StageWorkbenchKind = 'automatic' | 'review' | 'signoff';

export type StageWorkbenchWorkflowKey = 'preWorkflow' | 'qaWorkflow' | 'postEditWorkflow' | null;

/**
 * The automatic workbench is intentionally a small status surface. Keep its
 * visual state derived here so a terminal cancellation cannot accidentally
 * inherit the default running spinner or processing copy.
 */
export type AutomaticStagePresentation = {
    statusKey: 'NOT_STARTED' | 'RUNNING' | 'ERROR' | 'CANCELED';
    isBusy: boolean;
    showProcessingHint: boolean;
    isRecoverable: boolean;
};

export function getStageWorkbenchKind(stage: TranslationStage): StageWorkbenchKind {
    if (stage === 'SIGN_OFF' || stage === 'COMPLETED') return 'signoff';
    if (isReviewStage(stage)) return 'review';
    return 'automatic';
}

/**
 * A completed memory lookup is evidence, not a review action. Surface it
 * during the automatic post-edit phase as read-only progress, while keeping
 * all editing and application controls gated behind POST_EDIT_REVIEW.
 */
export function shouldShowPostEditQueryEvidence(stage: TranslationStage) {
    return stage === 'POST_EDIT';
}

export function getAutomaticStagePresentation(stage: TranslationStage): AutomaticStagePresentation {
    if (stage === 'ERROR') {
        return {
            statusKey: 'ERROR',
            isBusy: false,
            showProcessingHint: false,
            isRecoverable: false,
        };
    }

    if (stage === 'CANCELED') {
        return {
            statusKey: 'CANCELED',
            isBusy: false,
            showProcessingHint: false,
            isRecoverable: true,
        };
    }

    if (stage === 'NOT_STARTED') {
        return {
            statusKey: 'NOT_STARTED',
            isBusy: false,
            showProcessingHint: false,
            isRecoverable: false,
        };
    }

    return {
        statusKey: 'RUNNING',
        isBusy: true,
        showProcessingHint: true,
        isRecoverable: false,
    };
}

export function getStageWorkbenchWorkflowKey(stage: TranslationStage): StageWorkbenchWorkflowKey {
    switch (stage) {
        case 'NOT_STARTED':
        case 'MT':
        case 'MT_REVIEW':
            return 'preWorkflow';
        case 'QA':
        case 'QA_REVIEW':
            return 'qaWorkflow';
        case 'POST_EDIT':
        case 'POST_EDIT_REVIEW':
            return 'postEditWorkflow';
        case 'CANCELED':
        default:
            return null;
    }
}
