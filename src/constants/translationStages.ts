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

export const TRANSLATION_REVIEW_STAGES = [
    'MT_REVIEW',
    'QA_REVIEW',
    'POST_EDIT_REVIEW',
] as const;

export const TRANSLATION_MAIN_FLOW_NODES: Array<{
    id: string;
    labelStage: TranslationStage;
    stages: TranslationStage[];
}> = [
    {
        id: 'pre-translation',
        labelStage: 'MT',
        stages: ['MT', 'MT_REVIEW'],
    },
    {
        id: 'quality-assurance',
        labelStage: 'QA',
        stages: ['QA', 'QA_REVIEW'],
    },
    {
        id: 'post-editing',
        labelStage: 'POST_EDIT',
        stages: ['POST_EDIT', 'POST_EDIT_REVIEW'],
    },
];

export type TranslationStageGroup =
    | 'waiting'
    | 'pretrans'
    | 'qa'
    | 'postedit'
    | 'signoff'
    | 'error';

export const TRANSLATION_STAGE_PROGRESS_GROUPS: Array<{
    key: TranslationStageGroup;
    labelKey: string;
    dotClass: string;
    textClass: string;
}> = [
    {
        key: 'waiting',
        labelKey: 'waiting',
        dotClass: 'bg-gray-400',
        textClass: 'text-foreground/70',
    },
    {
        key: 'pretrans',
        labelKey: 'pretrans',
        dotClass: 'bg-indigo-500',
        textClass: 'text-indigo-600',
    },
    {
        key: 'qa',
        labelKey: 'qa',
        dotClass: 'bg-indigo-500',
        textClass: 'text-indigo-600',
    },
    {
        key: 'postedit',
        labelKey: 'postedit',
        dotClass: 'bg-indigo-500',
        textClass: 'text-indigo-600',
    },
    {
        key: 'signoff',
        labelKey: 'signoff',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-600',
    },
    {
        key: 'error',
        labelKey: 'error',
        dotClass: 'bg-red-500',
        textClass: 'text-red-600',
    },
];

// Export TRANSLATION_STAGES for backward compatibility
export const TRANSLATION_STAGES = TRANSLATION_STAGE_LABEL_KEYS;

export function isReviewStage(stage: string | null | undefined): boolean {
    return TRANSLATION_REVIEW_STAGES.includes(stage as (typeof TRANSLATION_REVIEW_STAGES)[number]);
}

export function getTranslationStageGroup(stage: string | null | undefined): TranslationStageGroup {
    switch (stage) {
        case 'MT':
        case 'MT_REVIEW':
            return 'pretrans';
        case 'QA':
        case 'QA_REVIEW':
            return 'qa';
        case 'POST_EDIT':
        case 'POST_EDIT_REVIEW':
            return 'postedit';
        case 'SIGN_OFF':
        case 'COMPLETED':
            return 'signoff';
        case 'ERROR':
            return 'error';
        case 'NOT_STARTED':
        default:
            return 'waiting';
    }
}

export function getTranslationStageDotClass(stage: string | null | undefined): string {
    if (stage === 'COMPLETED' || stage === 'SIGN_OFF') return 'bg-emerald-500';
    if (stage === 'ERROR') return 'bg-red-500';
    if (isReviewStage(stage)) return 'bg-orange-500';
    if (stage && stage !== 'NOT_STARTED') return 'bg-indigo-500';
    return 'bg-gray-400';
}

export function getTranslationStageBadgeClass(stage: string | null | undefined): string {
    const base =
        'px-2 py-[2px] rounded-full whitespace-nowrap border text-[10px] transition-all duration-200';
    if (stage === 'COMPLETED' || stage === 'SIGN_OFF') {
        return `${base} bg-emerald-600 border-emerald-700 text-white shadow`;
    }
    if (stage === 'ERROR') {
        return `${base} bg-red-600 border-red-700 text-white shadow`;
    }
    if (isReviewStage(stage)) {
        return `${base} bg-orange-600 border-orange-700 text-white shadow`;
    }
    if (stage && stage !== 'NOT_STARTED') {
        return `${base} bg-indigo-500 border-indigo-600 text-white shadow`;
    }
    return `${base} bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70`;
}

export function getTranslationStageLabel(
    stage: TranslationStage,
    translate: (key: string) => string
): string {
    return translate(`${TRANSLATION_STAGE_LABEL_KEYS[stage]}`);
}
