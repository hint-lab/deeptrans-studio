'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    getTranslationStageDotClass,
    getTranslationStageLabel,
    isReviewStage,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import { memorySearchDisplaySignal } from '@/lib/memory-search';
import { postEditDisplayOutcome } from '@/lib/post-edit-query-outcome';
import { getTranslationStageGuidance } from '@/lib/translation-stage-guidance';
import {
    getAutomaticStagePresentation,
    getStageWorkbenchKind,
    getStageWorkbenchWorkflowKey,
    shouldShowPostEditQueryEvidence,
    type StageWorkbenchKind,
} from '@/lib/stage-workbench';
import { cn } from '@/lib/utils';
import type { TranslationStage } from '@/store/features/translationSlice';
import {
    AlertTriangle,
    ChevronRight,
    CircleDashed,
    CircleOff,
    Loader2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import type { MemoryHit } from '@/agents/tools/memory';
import MtReviewPanel from './mt-review';
import PostEditPanel from './post-edit';
import QaReviewPanel from './qa-review';
import SignoffPanel from './signoff';

export type StageWorkbenchWorkflowContext = {
    stage: TranslationStage;
    stageLabel: string;
    workflowLabel: string;
    kind: StageWorkbenchKind;
};

export type StageWorkbenchProps = {
    /**
     * Defaults to the active segment's stage. Supplying this makes the workbench
     * useful in a controlled split-pane or a workflow preview.
     */
    stage?: TranslationStage;
    className?: string;
    /**
     * Opt-in inline workflow rendering. The component only mounts this content
     * after the translator asks to open the related workflow.
     */
    renderWorkflow?: (context: StageWorkbenchWorkflowContext) => ReactNode;
    /**
     * Lets a parent keep workflow visibility in a different panel or drawer.
     * When present, it takes precedence over the component's local visibility.
     */
    workflowOpen?: boolean;
    onWorkflowOpenChange?: (open: boolean, stage: TranslationStage) => void;
};

function StageIcon({
    presentation,
}: {
    presentation: ReturnType<typeof getAutomaticStagePresentation>;
}) {
    if (presentation.statusKey === 'ERROR') {
        return <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />;
    }

    if (presentation.statusKey === 'CANCELED') {
        return (
            <CircleOff className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        );
    }

    if (!presentation.isBusy) {
        return <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />;
    }

    return <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />;
}

function AutomaticStageBody({
    stage,
    stageLabel,
    workflowLabel,
    workflowAvailable,
    workflowOpen,
    onToggleWorkflow,
    documentLabel,
    segmentLabel,
    guidance,
    workflowPanelId,
    children,
}: {
    stage: TranslationStage;
    stageLabel: string;
    workflowLabel: string | null;
    workflowAvailable: boolean;
    workflowOpen: boolean;
    onToggleWorkflow: () => void;
    documentLabel: string;
    segmentLabel: string;
    guidance: ReturnType<typeof getTranslationStageGuidance>;
    workflowPanelId: string;
    children?: ReactNode;
}) {
    const tGuidance = useTranslations('IDE.stageGuidance');
    const presentation = getAutomaticStagePresentation(stage);
    const isError = presentation.statusKey === 'ERROR';
    const action = tGuidance(`actions.${guidance.action}`);
    const instruction =
        stage === 'NOT_STARTED'
            ? tGuidance('topActionHint', { action })
            : tGuidance(`instructions.${guidance.instruction}`);

    return (
        <section
            className={cn(
                'mx-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-md border bg-card/70 px-3 py-2.5',
                isError && 'border-destructive/35 bg-destructive/5',
                presentation.isRecoverable && 'border-amber-500/35 bg-amber-500/5'
            )}
            aria-live="polite"
            data-recoverable={presentation.isRecoverable || undefined}
        >
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div
                    className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background',
                        isError && 'border-destructive/35 bg-destructive/5',
                        presentation.isRecoverable && 'border-amber-500/35 bg-amber-500/10'
                    )}
                >
                    <StageIcon presentation={presentation} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            {segmentLabel}
                        </span>
                        <span className="truncate text-xs font-medium" title={documentLabel}>
                            {documentLabel}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{stageLabel}</span>
                    </div>
                    <p
                        className="mt-0.5 text-xs leading-5 text-muted-foreground"
                        role="status"
                        aria-live="polite"
                    >
                        {instruction}
                    </p>
                </div>
            </div>

            {workflowAvailable && workflowLabel && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-controls={workflowPanelId}
                    aria-expanded={workflowOpen}
                    onClick={onToggleWorkflow}
                >
                    <span>{workflowLabel}</span>
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                </Button>
            )}
            {children && <div className="w-full border-t pt-2">{children}</div>}
        </section>
    );
}

/**
 * The automatic post-edit stage can finish memory retrieval before the
 * evaluation and rewrite steps complete.  Keep that evidence visible without
 * mounting the interactive review panel: mounting the latter would restore
 * persisted state and expose actions that are only valid after review starts.
 */
function PostEditQueryProgress() {
    const t = useTranslations('IDE.postEditPanel');
    const { activeDocumentItem } = useActiveDocumentItem();
    const activeItemId = String(activeDocumentItem?.id || '');
    const posteditItemId = useAgentWorkflowSteps(s => s.posteditItemId) as string | undefined;
    const storedMemos = useAgentWorkflowSteps(s => s.posteditMemos) as MemoryHit[] | undefined;
    const outcomes = useAgentWorkflowSteps(s => s.posteditOutcomes);
    const ownsVisibleOutput = Boolean(activeItemId) && posteditItemId === activeItemId;
    const hits = ownsVisibleOutput && Array.isArray(storedMemos) ? storedMemos : [];
    const outcome = postEditDisplayOutcome(outcomes, activeItemId, posteditItemId);
    const errorTitle =
        outcome.phase === 'restore'
            ? t('loadResultsFailed')
            : outcome.phase === 'query'
              ? t('queryFailed')
              : t('postEditFailed');

    return (
        <section
            className="space-y-2 border-t pt-3"
            aria-label={t('discourseQuery')}
            data-post-edit-query-progress
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{t('discourseQuery')}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {t('totalResults')} {hits.length}
                </Badge>
            </div>

            {outcome.status === 'loading' && (
                <div
                    className="flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
                    <span>{t('queryRunning')}</span>
                </div>
            )}

            {outcome.status === 'error' && (
                <div
                    className="rounded border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs"
                    role="alert"
                >
                    <p className="font-medium text-destructive">{errorTitle}</p>
                    <p className="mt-1 text-muted-foreground">
                        {outcome.message || t('postEditFailed')}
                    </p>
                    <p className="mt-1 text-muted-foreground">{t('queryFailureHint')}</p>
                </div>
            )}

            {outcome.status === 'success-empty' && (
                <p className="rounded border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                    {t('queryEmpty')}
                </p>
            )}

            {outcome.status === 'idle' && !hits.length && (
                <p className="text-xs text-muted-foreground">{t('performQuery')}</p>
            )}

            {hits.length > 0 && (
                <ol className="max-h-56 space-y-2 overflow-auto pr-1" aria-live="polite">
                    {hits.map((hit, index) => {
                        const signal = memorySearchDisplaySignal(hit);
                        const signalLabel =
                            signal.kind === 'semantic'
                                ? `${t('semanticSimilarity')} ${Math.round(signal.score * 100)}%`
                                : signal.kind === 'keyword'
                                  ? t('keywordMatch')
                                  : t('retrievalMatch');

                        return (
                            <li
                                key={hit.id}
                                className="rounded border bg-background/70 p-2 text-xs shadow-sm"
                            >
                                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                    <span>#{index + 1}</span>
                                    <span>{signalLabel}</span>
                                </div>
                                <p className="line-clamp-2 text-foreground/80">
                                    <span className="mr-1 font-medium text-muted-foreground">
                                        {t('sourceText')}
                                    </span>
                                    {hit.source}
                                </p>
                                <p className="mt-1 line-clamp-2 text-foreground">
                                    <span className="mr-1 font-medium text-muted-foreground">
                                        {t('translation')}
                                    </span>
                                    {hit.target}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

function StageReviewHeader({
    stage,
    stageLabel,
    workflowLabel,
    workflowAvailable,
    workflowOpen,
    onToggleWorkflow,
    documentLabel,
    segmentLabel,
    guidance,
    workflowPanelId,
}: {
    stage: TranslationStage;
    stageLabel: string;
    workflowLabel: string | null;
    workflowAvailable: boolean;
    workflowOpen: boolean;
    onToggleWorkflow: () => void;
    documentLabel: string;
    segmentLabel: string;
    guidance: ReturnType<typeof getTranslationStageGuidance>;
    workflowPanelId: string;
}) {
    const tStage = useTranslations('IDE.translationStages');
    const tGuidance = useTranslations('IDE.stageGuidance');
    const action = tGuidance(`actions.${guidance.action}`);
    const instruction = tGuidance(`instructions.${guidance.instruction}`);

    return (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-background/90 px-3 py-2">
            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={cn(
                            'size-2 shrink-0 rounded-full',
                            getTranslationStageDotClass(stage)
                        )}
                        aria-hidden="true"
                    />
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                {segmentLabel}
                            </span>
                            <span className="truncate text-xs font-medium" title={documentLabel}>
                                {documentLabel}
                            </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-xs font-medium">
                                {tGuidance('currentStage', { stage: stageLabel })}
                            </span>
                            {isReviewStage(stage) && (
                                <span className="hidden text-xs text-muted-foreground sm:inline">
                                    {tStage('status.reviewing')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <p
                    className="mt-1 truncate pl-4 text-[11px] text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    {instruction}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="hidden max-w-48 truncate text-[11px] font-medium text-foreground/80 lg:inline">
                    {tGuidance('nextAction', { action })}
                </span>
                {workflowAvailable && workflowLabel && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
                        aria-controls={workflowPanelId}
                        aria-expanded={workflowOpen}
                        onClick={onToggleWorkflow}
                    >
                        <span className="hidden sm:inline">{workflowLabel}</span>
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                )}
            </div>
        </header>
    );
}

function StagePanel({ stage }: { stage: TranslationStage }) {
    switch (stage) {
        case 'MT_REVIEW':
            return <MtReviewPanel />;
        case 'QA_REVIEW':
            return <QaReviewPanel />;
        case 'POST_EDIT_REVIEW':
            return <PostEditPanel />;
        case 'SIGN_OFF':
        case 'COMPLETED':
            return <SignoffPanel />;
        default:
            return null;
    }
}

/**
 * Keeps the translator in the work that matters at this moment:
 * review panels when human judgment is needed, and a compact status surface
 * while an automatic stage is running. Workflow diagrams remain opt-in.
 */
export default function StageWorkbench({
    stage,
    className,
    renderWorkflow,
    workflowOpen,
    onWorkflowOpenChange,
}: StageWorkbenchProps) {
    const { currentStage } = useTranslationState();
    const { activeDocumentItem } = useActiveDocumentItem();
    const activeStage = stage ?? currentStage;
    const tStage = useTranslations('IDE.translationStages');
    const tPanel = useTranslations('IDE.translationPanel');
    const tGuidance = useTranslations('IDE.stageGuidance');
    const [localWorkflowOpen, setLocalWorkflowOpen] = useState(false);
    const workflowPanelId = useId();

    const kind = getStageWorkbenchKind(activeStage);
    const stageLabel = getTranslationStageLabel(activeStage, tStage);
    const guidance = getTranslationStageGuidance(activeStage);
    const segmentLabel =
        typeof activeDocumentItem.order === 'number' && activeDocumentItem.order > 0
            ? tGuidance('segmentNumber', { index: activeDocumentItem.order })
            : tGuidance('currentSegment');
    const documentLabel =
        String(activeDocumentItem.name || '').trim() || tGuidance('unnamedSegment');
    const workflowKey = getStageWorkbenchWorkflowKey(activeStage);
    const workflowLabel = workflowKey ? tPanel(workflowKey) : null;
    const isWorkflowOpen = workflowOpen ?? localWorkflowOpen;
    const workflowAvailable = Boolean(
        workflowKey && (renderWorkflow || onWorkflowOpenChange || workflowOpen !== undefined)
    );

    const toggleWorkflow = () => {
        const nextOpen = !isWorkflowOpen;
        if (onWorkflowOpenChange) {
            onWorkflowOpenChange(nextOpen, activeStage);
            return;
        }
        setLocalWorkflowOpen(nextOpen);
    };

    const workflowContext: StageWorkbenchWorkflowContext = {
        stage: activeStage,
        stageLabel,
        workflowLabel: workflowLabel ?? stageLabel,
        kind,
    };

    return (
        <section
            className={cn('flex h-full min-h-0 flex-col bg-background', className)}
            aria-label={tGuidance('workbenchLabel', { stage: stageLabel })}
            data-current-stage={activeStage}
        >
            {kind === 'automatic' ? (
                <div className="flex min-h-0 flex-1 items-center overflow-auto p-3 sm:p-5">
                    <AutomaticStageBody
                        stage={activeStage}
                        stageLabel={stageLabel}
                        workflowLabel={workflowLabel}
                        workflowAvailable={workflowAvailable}
                        workflowOpen={isWorkflowOpen}
                        onToggleWorkflow={toggleWorkflow}
                        documentLabel={documentLabel}
                        segmentLabel={segmentLabel}
                        guidance={guidance}
                        workflowPanelId={workflowPanelId}
                    >
                        {shouldShowPostEditQueryEvidence(activeStage) && <PostEditQueryProgress />}
                    </AutomaticStageBody>
                </div>
            ) : (
                <>
                    <StageReviewHeader
                        stage={activeStage}
                        stageLabel={stageLabel}
                        workflowLabel={workflowLabel}
                        workflowAvailable={workflowAvailable}
                        workflowOpen={isWorkflowOpen}
                        onToggleWorkflow={toggleWorkflow}
                        documentLabel={documentLabel}
                        segmentLabel={segmentLabel}
                        guidance={guidance}
                        workflowPanelId={workflowPanelId}
                    />
                    <div className="min-h-0 flex-1 overflow-auto">
                        <StagePanel stage={activeStage} />
                    </div>
                </>
            )}

            {renderWorkflow && isWorkflowOpen && workflowKey && (
                <div
                    id={workflowPanelId}
                    className="min-h-0 shrink basis-[45%] border-t bg-muted/15 p-2"
                >
                    {renderWorkflow(workflowContext)}
                </div>
            )}
        </section>
    );
}
