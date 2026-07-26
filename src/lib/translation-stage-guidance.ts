import type { TranslationStage } from '@/store/features/translationSlice';

/**
 * The editor header and the lower workbench must tell the same story. Keep
 * the translator-facing next action in one small, exhaustive map instead of
 * allowing each surface to infer it from a visual colour or a step index.
 */
export type TranslationStageGuidanceAction =
    | 'startPreTranslation'
    | 'waitForPreTranslation'
    | 'reviewPreTranslation'
    | 'waitForQA'
    | 'reviewQA'
    | 'waitForPostEdit'
    | 'reviewPostEdit'
    | 'completeProject'
    | 'restartPreTranslation'
    | 'none';

export type TranslationStageGuidanceInstruction =
    | 'readyForPreTranslation'
    | 'preTranslationRunning'
    | 'preTranslationReview'
    | 'qaRunning'
    | 'qaReview'
    | 'postEditRunning'
    | 'postEditReview'
    | 'readyToComplete'
    | 'completed'
    | 'failed'
    | 'canceled';

export type TranslationStageGuidanceTone =
    | 'ready'
    | 'running'
    | 'review'
    | 'signoff'
    | 'completed'
    | 'attention';

export type TranslationStageGuidance = {
    action: TranslationStageGuidanceAction;
    instruction: TranslationStageGuidanceInstruction;
    tone: TranslationStageGuidanceTone;
    requiresUserAction: boolean;
};

const STAGE_GUIDANCE: Record<TranslationStage, TranslationStageGuidance> = {
    NOT_STARTED: {
        action: 'startPreTranslation',
        instruction: 'readyForPreTranslation',
        tone: 'ready',
        requiresUserAction: true,
    },
    MT: {
        action: 'waitForPreTranslation',
        instruction: 'preTranslationRunning',
        tone: 'running',
        requiresUserAction: false,
    },
    MT_REVIEW: {
        action: 'reviewPreTranslation',
        instruction: 'preTranslationReview',
        tone: 'review',
        requiresUserAction: true,
    },
    QA: {
        action: 'waitForQA',
        instruction: 'qaRunning',
        tone: 'running',
        requiresUserAction: false,
    },
    QA_REVIEW: {
        action: 'reviewQA',
        instruction: 'qaReview',
        tone: 'review',
        requiresUserAction: true,
    },
    POST_EDIT: {
        action: 'waitForPostEdit',
        instruction: 'postEditRunning',
        tone: 'running',
        requiresUserAction: false,
    },
    POST_EDIT_REVIEW: {
        action: 'reviewPostEdit',
        instruction: 'postEditReview',
        tone: 'review',
        requiresUserAction: true,
    },
    SIGN_OFF: {
        action: 'completeProject',
        instruction: 'readyToComplete',
        tone: 'signoff',
        requiresUserAction: true,
    },
    COMPLETED: {
        action: 'none',
        instruction: 'completed',
        tone: 'completed',
        requiresUserAction: false,
    },
    ERROR: {
        action: 'restartPreTranslation',
        instruction: 'failed',
        tone: 'attention',
        requiresUserAction: true,
    },
    CANCELED: {
        action: 'restartPreTranslation',
        instruction: 'canceled',
        tone: 'attention',
        requiresUserAction: true,
    },
};

export function getTranslationStageGuidance(stage: TranslationStage): TranslationStageGuidance {
    return STAGE_GUIDANCE[stage];
}
