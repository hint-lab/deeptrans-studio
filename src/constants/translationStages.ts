import type { TranslationStage } from '@/store/features/translationSlice';

const TRANSLATION_STAGE_LABEL_KEYS: Record<TranslationStage, string> = {
    NOT_STARTED: 'NOT_STARTED',
    MT: 'MT',
    MT_REVIEW: 'MT_REVIEW',
    QA: 'QA',
    QA_REVIEW: 'QA_REVIEW',
    POST_EDIT: 'POST_EDIT',
    POST_EDIT_REVIEW: 'POST_EDIT_REVIEW',
    SIGN_OFF: 'SIGN_OFF',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR',
};

export const TRANSLATION_STAGES_SEQUENCE: TranslationStage[] = [
    'NOT_STARTED',
    'MT',
    'MT_REVIEW',
    'QA',
    'QA_REVIEW',
    'POST_EDIT',
    'POST_EDIT_REVIEW',
    'SIGN_OFF',
    'COMPLETED',
];

// Export TRANSLATION_STAGES for backward compatibility
export const TRANSLATION_STAGES = TRANSLATION_STAGE_LABEL_KEYS;

export function getTranslationStageLabel(
    stage: TranslationStage,
    translate: (key: string) => string
): string {
    return translate(`${TRANSLATION_STAGE_LABEL_KEYS[stage]}`);
}
