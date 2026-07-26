export type OneClickWorkflowProgressInput = {
    /** Segments which must complete pre-translation before their QA unit. */
    preTranslateCount: number;
    /** Segments entering the QA stage, including successfully pre-translated ones. */
    qaCount: number;
    /** The current stage's server-reported completion percentage. */
    stagePercent: number;
    stage: 'pre-translate' | 'quality-assure';
};

function normalizeCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizePercent(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/**
 * Maps the two automatic stages of a one-click run onto one stable progress
 * scale. A NOT_STARTED segment contributes two units (pre-translate and QA),
 * while an MT_REVIEW segment contributes its remaining QA unit only.
 */
export function calculateOneClickWorkflowProgress({
    preTranslateCount,
    qaCount,
    stagePercent,
    stage,
}: OneClickWorkflowProgressInput): number {
    const preTranslateUnits = normalizeCount(preTranslateCount);
    const qaUnits = normalizeCount(qaCount);
    const totalUnits = preTranslateUnits + qaUnits;
    if (totalUnits === 0) return 0;

    const completedPreTranslateUnits =
        stage === 'quality-assure'
            ? preTranslateUnits
            : (preTranslateUnits * normalizePercent(stagePercent)) / 100;
    const completedQAUnits =
        stage === 'quality-assure' ? (qaUnits * normalizePercent(stagePercent)) / 100 : 0;

    return Math.round(((completedPreTranslateUnits + completedQAUnits) / totalUnits) * 100);
}
