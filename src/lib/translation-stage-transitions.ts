import { deserializePostEditResults } from '@/lib/post-edit-results';
import { sourceRevision } from '@/lib/source-revision';
import { normalizeSyntaxQualityResult } from '@/lib/syntax-quality';
import type { TranslationStage } from '@prisma/client';

/**
 * The only normal document-item workflow path.  Keep this separate from
 * ERROR/CANCELED: those states are written by workers and must be recovered
 * deliberately rather than used as shortcuts through the review flow.
 */
export const DOCUMENT_ITEM_WORKFLOW_STAGES = [
    'NOT_STARTED',
    'MT',
    'MT_REVIEW',
    'QA',
    'QA_REVIEW',
    'POST_EDIT',
    'POST_EDIT_REVIEW',
    'SIGN_OFF',
    'COMPLETED',
] as const satisfies readonly TranslationStage[];

const DOCUMENT_ITEM_TRANSLATION_STAGES = [
    ...DOCUMENT_ITEM_WORKFLOW_STAGES,
    'ERROR',
    'CANCELED',
] as const satisfies readonly TranslationStage[];

type PostEditResultCarrier = {
    sourceText?: unknown;
    targetText?: unknown;
    metadata?: unknown;
    postEditDiscourse?: unknown;
    postEditEmbedded?: unknown;
};

type PreTranslationResultCarrier = {
    status?: unknown;
    sourceText?: unknown;
    targetText?: unknown;
    metadata?: unknown;
    preTranslateEmbedded?: unknown;
};

type QualityAssureResultCarrier = {
    status?: unknown;
    sourceText?: unknown;
    targetText?: unknown;
    metadata?: unknown;
    qualityAssureSyntax?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isDocumentItemTranslationStage(value: unknown): value is TranslationStage {
    return DOCUMENT_ITEM_TRANSLATION_STAGES.includes(value as TranslationStage);
}

/**
 * A regular user-facing status update may repeat a stage, move one step
 * forward, or move one step back.  Error/cancel recovery starts again from
 * NOT_STARTED so a client cannot turn an error state into a later review
 * stage without running the preceding work.
 */
export function isAllowedDocumentItemStatusTransition(
    current: unknown,
    next: unknown
): next is TranslationStage {
    if (!isDocumentItemTranslationStage(next)) return false;

    const currentStage = isDocumentItemTranslationStage(current) ? current : 'NOT_STARTED';
    if (currentStage === next) return true;

    if (currentStage === 'ERROR' || currentStage === 'CANCELED') {
        return next === 'NOT_STARTED';
    }
    if (next === 'ERROR' || next === 'CANCELED') return false;

    const currentIndex = DOCUMENT_ITEM_WORKFLOW_STAGES.indexOf(currentStage);
    const nextIndex = DOCUMENT_ITEM_WORKFLOW_STAGES.indexOf(next);
    return currentIndex >= 0 && nextIndex >= 0 && Math.abs(currentIndex - nextIndex) === 1;
}

/**
 * Post-edit review is only meaningful when the post-edit pipeline persisted a
 * result for the source/target pair being reviewed.  Applying the generated
 * rewrite changes targetText, so that exact rewrite is also accepted as the
 * current target while the original target revision remains in metadata.
 */
export function hasCurrentPersistedPostEditResult(item: PostEditResultCarrier): boolean {
    const result = deserializePostEditResults(item.postEditDiscourse, item.postEditEmbedded);
    const hasResult =
        result.query !== undefined ||
        result.evaluation !== undefined ||
        (typeof result.rewrite === 'string' && result.rewrite.trim().length > 0);
    if (!hasResult) return false;

    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const storedSourceRevision = String(metadata.postEditSourceRevision || '');
    if (!storedSourceRevision || storedSourceRevision !== sourceRevision(item.sourceText)) {
        return false;
    }

    const currentTargetRevision = sourceRevision(item.targetText);
    const storedTargetRevision = String(metadata.postEditTargetRevision || '');
    if (storedTargetRevision === currentTargetRevision) return true;

    const rewrite = typeof result.rewrite === 'string' ? result.rewrite.trim() : '';
    return Boolean(rewrite) && rewrite === String(item.targetText || '').trim();
}

/**
 * MT review is only valid when the generated candidate and the applied target
 * were both persisted for the current source revision. Keeping this pure
 * helper outside a `use server` action module also makes the boundary usable
 * by the client-independent transition tests.
 */
export function hasCurrentPersistedPreTranslationResult(
    item: PreTranslationResultCarrier,
    expectedRunId: string
): boolean {
    const embedded =
        typeof item.preTranslateEmbedded === 'string' ? item.preTranslateEmbedded.trim() : '';
    const target = String(item.targetText || '').trim();
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const revision = sourceRevision(item.sourceText);
    const runId = String(expectedRunId || '').trim();

    return (
        Boolean(runId) &&
        Boolean(embedded) &&
        target === embedded &&
        String(metadata.preTranslateSourceRevision || '') === revision &&
        String(metadata.targetSourceRevision || '') === revision &&
        String(metadata.preTranslateRunId || '') === runId &&
        String(metadata.preTranslateResultRunId || '') === runId
    );
}

/**
 * A pre-translation result belongs to exactly one claimed MT run.  A rollback
 * followed by a retry may retain the same source and target text, so text
 * snapshots alone cannot identify a late result from the older run.
 */
export function isCurrentPreTranslationRun(
    item: PreTranslationResultCarrier,
    expectedRunId: string
): boolean {
    const runId = String(expectedRunId || '').trim();
    if (!runId || String(item.status || '') !== 'MT') return false;

    const metadata = isRecord(item.metadata) ? item.metadata : {};
    return String(metadata.preTranslateRunId || '') === runId;
}

/**
 * A single-segment QA result belongs to the exact QA claim that ran the
 * model. Source/target snapshots alone are insufficient: a reviewer can
 * roll back and retry the same text while an older browser request is still
 * in flight.
 */
export function isCurrentQualityAssureRun(
    item: QualityAssureResultCarrier,
    expectedRunId: string
): boolean {
    const runId = String(expectedRunId || '').trim();
    if (!runId || String(item.status || '') !== 'QA') return false;

    const metadata = isRecord(item.metadata) ? item.metadata : {};
    return String(metadata.qaRunId || '') === runId;
}

/**
 * QA review is valid only when a complete, non-legacy evaluation was stored
 * by the QA run that currently owns the item and its input pair still matches.
 */
export function hasCurrentPersistedQualityAssureResult(
    item: QualityAssureResultCarrier,
    expectedRunId: string
): boolean {
    const runId = String(expectedRunId || '').trim();
    if (!runId) return false;

    const syntax = normalizeSyntaxQualityResult(item.qualityAssureSyntax);
    const evaluation = syntax.evaluation;
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const source = String(item.sourceText || '');
    const target = String(item.targetText || '');

    return (
        syntax.status === 'complete' &&
        !syntax.legacy &&
        Boolean(evaluation?.id) &&
        evaluation?.sourceRevision === sourceRevision(source) &&
        evaluation?.targetRevision === sourceRevision(target) &&
        evaluation?.baseSource === source &&
        evaluation?.baseTarget === target &&
        String(metadata.qaRunId || '') === runId &&
        String(metadata.qaResultRunId || '') === runId
    );
}
