'use client';

import { getDocumentItemIntermediateResultsAction } from '@/actions/intermediate-results';
import {
    applySyntaxRevisionAction,
    embedSelectedSyntaxIssuesAction,
    updateSyntaxIssueSelectionAction,
} from '@/actions/quality-assure';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationContent } from '@/hooks/useTranslation';
import { resolveQaReviewErrorKey } from '@/lib/ide-review-error';
import { getItemScopedValue, type ItemScopedValue } from '@/lib/item-scoped-state';
import {
    failedQaReviewResults,
    idleQaReviewLoadState,
    loadingQaReviewResults,
    readyQaReviewResults,
    resolveQaReviewLoadState,
    type QaReviewLoadState,
} from '@/lib/qa-review-load-state';
import {
    isSyntaxEvaluationTargetCompatible,
    normalizeSyntaxQualityResult,
    type SyntaxIssue,
    type SyntaxIssueSeverity,
    type SyntaxRelationStatus,
} from '@/lib/syntax-quality';
import { wordDiff } from '@/lib/text-diff';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const severityOrder: Record<SyntaxIssueSeverity, number> = {
    critical: 3,
    major: 2,
    minor: 1,
};

const qaPanelTabs = ['relations', 'issues', 'rewrite'] as const;
type QaPanelTab = (typeof qaPanelTabs)[number];

function sameIds(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
}

function severityClass(severity?: SyntaxIssueSeverity) {
    if (severity === 'critical') {
        return 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300';
    }
    if (severity === 'major') {
        return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    }
    if (severity === 'minor') {
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
}

function relationClass(status: SyntaxRelationStatus) {
    if (status === 'preserved') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    }
    if (status === 'shifted' || status === 'omitted' || status === 'added') {
        return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
}

export default function QAPanel(_props: { projectId?: string }) {
    const t = useTranslations('IDE.qaPanel');
    const locale = useLocale();
    const { sourceText, targetText, setTargetTranslationText } = useTranslationContent();
    const { activeDocumentItem } = useActiveDocumentItem();
    const activeItemId = String((activeDocumentItem as any)?.id || '');
    const activeItemIdRef = useRef(activeItemId);
    activeItemIdRef.current = activeItemId;

    const qaItemId = useAgentWorkflowSteps(state => state.qualityAssureItemId) as
        | string
        | undefined;
    const qaBiTerm = useAgentWorkflowSteps(state => state.qualityAssureBiTerm);
    const qaSyntax = useAgentWorkflowSteps(state => state.qualityAssureSyntax);
    const storedEmbedded = useAgentWorkflowSteps(state => state.qualityAssureSyntaxEmbedded) as
        | string
        | undefined;
    const setQAOutputs = useAgentWorkflowSteps(state => state.setQAOutputs);
    const setQaSyntaxEmbedded = useAgentWorkflowSteps(state => state.setQASyntaxEmbedded) as (
        value: string | undefined
    ) => void;

    const [baselineState, setBaselineState] = useState<ItemScopedValue<string> | null>(null);
    const baseline = getItemScopedValue(baselineState, activeItemId) ?? '';
    const [showDiff, setShowDiff] = useState(false);
    const [loadingEmbedded, setLoadingEmbedded] = useState(false);
    const [savingSelection, setSavingSelection] = useState(false);
    const [qaReviewLoadState, setQaReviewLoadState] =
        useState<QaReviewLoadState>(idleQaReviewLoadState);
    const [qaReviewLoadRetryVersion, setQaReviewLoadRetryVersion] = useState(0);
    const [isNarrow, setIsNarrow] = useState(false);
    const [activePanel, setActivePanel] = useState<QaPanelTab>('relations');
    const containerRef = useRef<HTMLDivElement>(null);
    const loadRequestRef = useRef(0);
    const selectionRequestRef = useRef(0);
    const revisionRequestRef = useRef(0);

    const qaSyntaxForActiveItem = qaItemId === activeItemId ? qaSyntax : undefined;
    const qaBiTermForActiveItem = qaItemId === activeItemId ? qaBiTerm : undefined;
    const qaEmbeddedText = qaItemId === activeItemId ? storedEmbedded : undefined;
    const hasRun = Boolean(qaSyntaxForActiveItem || qaBiTermForActiveItem);
    const currentQaReviewLoadState = resolveQaReviewLoadState(qaReviewLoadState, activeItemId);
    const qaResultLoadMessage =
        currentQaReviewLoadState.status === 'loading'
            ? t('loadingResults')
            : currentQaReviewLoadState.status === 'error'
              ? t('loadFailed')
              : null;

    const result = useMemo(() => {
        const syntaxResult = normalizeSyntaxQualityResult(qaSyntaxForActiveItem);
        const alignmentResult = normalizeSyntaxQualityResult(qaBiTermForActiveItem);
        const relations = syntaxResult.relations.length
            ? syntaxResult.relations
            : alignmentResult.relations;
        return {
            ...syntaxResult,
            relations,
            summary: {
                ...syntaxResult.summary,
                relationCount: relations.length,
            },
        };
    }, [qaBiTermForActiveItem, qaSyntaxForActiveItem]);

    const issues = useMemo(
        () =>
            [...result.issues].sort(
                (left, right) =>
                    (severityOrder[right.severity || 'minor'] || 0) -
                    (severityOrder[left.severity || 'minor'] || 0)
            ),
        [result.issues]
    );
    const selectedIds = useMemo(
        () => issues.filter(issue => result.selectedMap[issue.id] === true).map(issue => issue.id),
        [issues, result.selectedMap]
    );
    const embeddedIssueIds = result.evaluation?.embeddedIssueIds || [];
    const evaluationSourceStale = Boolean(
        result.evaluation?.baseSource && result.evaluation.baseSource !== sourceText
    );
    const targetEdited = Boolean(
        result.evaluation?.id &&
        !isSyntaxEvaluationTargetCompatible(
            result.evaluation,
            targetText,
            String(qaEmbeddedText || '')
        )
    );
    const revisionContextStale = evaluationSourceStale || targetEdited;
    const proposalStale =
        Boolean(
            qaEmbeddedText && (!result.evaluation?.id || !sameIds(selectedIds, embeddedIssueIds))
        ) || revisionContextStale;

    useEffect(() => {
        const element = containerRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width || 0;
            setIsNarrow(width > 0 && width < 900);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const requestId = ++loadRequestRef.current;
        selectionRequestRef.current += 1;
        revisionRequestRef.current += 1;
        setBaselineState(null);
        setShowDiff(false);
        setLoadingEmbedded(false);
        setSavingSelection(false);
        setQaSyntaxEmbedded(undefined);
        if (!activeItemId) {
            setQAOutputs(undefined);
            setQaReviewLoadState(idleQaReviewLoadState);
            return;
        }
        setQaReviewLoadState(loadingQaReviewResults(activeItemId));
        setQAOutputs({ itemId: activeItemId, biTerm: undefined, syntax: undefined });

        void (async () => {
            try {
                const stored = await getDocumentItemIntermediateResultsAction(activeItemId);
                if (
                    requestId !== loadRequestRef.current ||
                    activeItemIdRef.current !== activeItemId
                ) {
                    return;
                }
                if (!stored) {
                    setQaReviewLoadState(readyQaReviewResults(activeItemId));
                    return;
                }
                setQAOutputs({
                    itemId: activeItemId,
                    biTerm: stored.qualityAssureBiTerm,
                    syntax: stored.qualityAssureSyntax,
                });
                const normalized = normalizeSyntaxQualityResult(stored.qualityAssureSyntax);
                setBaselineState({
                    itemId: activeItemId,
                    value:
                        normalized.evaluation?.baseTarget ||
                        String(stored.targetText || stored.preTranslateEmbedded || ''),
                });
                const embedded = stored.qualityAssureSyntaxEmbedded;
                setQaSyntaxEmbedded(typeof embedded === 'string' ? embedded : undefined);
                setQaReviewLoadState(readyQaReviewResults(activeItemId));
            } catch {
                if (
                    requestId === loadRequestRef.current &&
                    activeItemIdRef.current === activeItemId
                ) {
                    setQAOutputs({ itemId: activeItemId, biTerm: undefined, syntax: undefined });
                    setQaSyntaxEmbedded(undefined);
                    setQaReviewLoadState(failedQaReviewResults(activeItemId));
                    toast.error(t('loadFailed'));
                }
            }
        })();

        return () => {
            loadRequestRef.current += 1;
            selectionRequestRef.current += 1;
        };
        // Store action wrappers are intentionally excluded; they are recreated on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeItemId, qaReviewLoadRetryVersion]);

    useEffect(() => {
        if (!baseline && hasRun) {
            setBaselineState({
                itemId: activeItemId,
                value: result.evaluation?.baseTarget || String(targetText || ''),
            });
        }
    }, [activeItemId, baseline, hasRun, result.evaluation?.baseTarget, targetText]);

    const retryQaResultLoad = () => {
        if (!activeItemId) return;
        setQaReviewLoadState(loadingQaReviewResults(activeItemId));
        setQaReviewLoadRetryVersion(version => version + 1);
    };

    const saveSelection = async (nextSelectedIds: string[]) => {
        const evaluationId = result.evaluation?.id;
        if (!activeItemId || !evaluationId || result.status !== 'complete' || savingSelection) {
            if (!evaluationId) toast.error(t('rerunRequired'));
            else if (result.status !== 'complete') toast.error(t('incompleteWarning'));
            return;
        }
        const itemId = activeItemId;
        const requestId = ++selectionRequestRef.current;
        setSavingSelection(true);
        try {
            const nextSyntax = await updateSyntaxIssueSelectionAction(
                itemId,
                evaluationId,
                nextSelectedIds
            );
            if (activeItemIdRef.current !== itemId || requestId !== selectionRequestRef.current) {
                return;
            }
            setQAOutputs({ itemId, syntax: nextSyntax });
        } catch (error) {
            if (requestId === selectionRequestRef.current) {
                toast.error(t(resolveQaReviewErrorKey(error, 'selectionSaveFailed')));
            }
        } finally {
            if (requestId === selectionRequestRef.current) setSavingSelection(false);
        }
    };

    const toggleIssue = (issue: SyntaxIssue) => {
        const nextSelectedIds = result.selectedMap[issue.id]
            ? selectedIds.filter(id => id !== issue.id)
            : [...selectedIds, issue.id];
        void saveSelection(nextSelectedIds);
    };

    const selectBySeverity = () => {
        void saveSelection(
            issues
                .filter(issue => issue.severity === 'critical' || issue.severity === 'major')
                .map(issue => issue.id)
        );
    };

    const clearSelection = () => {
        void saveSelection([]);
    };

    const generateRevision = async () => {
        const evaluationId = result.evaluation?.id;
        if (!activeItemId || !evaluationId) {
            toast.error(t('rerunRequired'));
            return;
        }
        if (result.status !== 'complete') {
            toast.error(t('incompleteWarning'));
            return;
        }
        if (!selectedIds.length) {
            toast.error(t('selectAtLeastOne'));
            return;
        }
        const itemId = activeItemId;
        const requestId = ++revisionRequestRef.current;
        setLoadingEmbedded(true);
        try {
            const generated = await embedSelectedSyntaxIssuesAction(
                itemId,
                evaluationId,
                selectedIds,
                locale
            );
            if (activeItemIdRef.current !== itemId || requestId !== revisionRequestRef.current) {
                return;
            }
            setQAOutputs({ itemId, syntax: generated.syntax });
            setQaSyntaxEmbedded(generated.text || '');
            setShowDiff(true);
            toast.success(t('revisionGenerated'));
        } catch (error) {
            if (requestId === revisionRequestRef.current) {
                toast.error(t(resolveQaReviewErrorKey(error, 'generateFailed')));
            }
        } finally {
            if (requestId === revisionRequestRef.current) setLoadingEmbedded(false);
        }
    };

    const applyToTarget = async (version: 'base' | 'proposal') => {
        const evaluationId = result.evaluation?.id;
        if (!activeItemId || !evaluationId || revisionContextStale) {
            toast.error(t('rerunRequired'));
            return;
        }
        const itemId = activeItemId;
        try {
            const applied = await applySyntaxRevisionAction(itemId, evaluationId, version);
            if (activeItemIdRef.current !== itemId) return;
            setTargetTranslationText(applied.text);
            toast.success(t('applied'));
        } catch (error) {
            toast.error(t(resolveQaReviewErrorKey(error, 'applyFailed')));
        }
    };

    const baseText = baseline || result.evaluation?.baseTarget || '';
    const proposalText = String(qaEmbeddedText || '');
    const noRevisionNeeded = Boolean(
        baseText && hasRun && result.status === 'complete' && !result.legacy && issues.length === 0
    );
    // A clean QA result still has a meaningful comparison: the reviewed text is
    // intentionally identical to the baseline. Showing both sides makes the QA
    // panel consistent with the other workflow panels without inventing a rewrite.
    const comparisonText = proposalText || (noRevisionNeeded ? baseText : '');
    const diff =
        showDiff && baseText && comparisonText ? wordDiff(baseText, comparisonText) : undefined;
    const baseApplied = Boolean(baseText && targetText === baseText);
    const proposalApplied = Boolean(proposalText && !proposalStale && targetText === proposalText);
    const panelClass =
        'flex min-h-0 flex-col rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950';

    return (
        <div
            ref={containerRef}
            className="flex size-full min-h-0 flex-col rounded-md border border-purple-200 bg-purple-50/70 p-2.5 dark:border-purple-900 dark:bg-purple-950/20"
        >
            <div className="flex flex-wrap items-start justify-between gap-2 px-0.5">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ShieldCheck className="h-4 w-4 text-purple-600" />
                        {t('title')}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('humanReviewNote')}
                    </p>
                </div>
                {hasRun && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {result.legacy && <Badge variant="outline">{t('legacyResult')}</Badge>}
                        {result.status === 'partial' && (
                            <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                            >
                                {t('incompleteResult')}
                            </Badge>
                        )}
                        <Badge variant="outline">
                            {t('relationCount', { count: result.summary.relationCount })}
                        </Badge>
                        <Badge variant="outline">
                            {t('issueCount', { count: result.issues.length })}
                        </Badge>
                        <Badge variant="outline">
                            {t('selectedCount', {
                                selected: selectedIds.length,
                                total: result.issues.length,
                            })}
                        </Badge>
                    </div>
                )}
            </div>

            {currentQaReviewLoadState.status === 'loading' && (
                <div
                    role="status"
                    className="mt-2 flex items-center gap-1.5 rounded-md border border-purple-200 bg-white/80 px-2.5 py-2 text-[11px] text-muted-foreground dark:border-purple-900 dark:bg-slate-950/80"
                >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t('loadingResults')}
                </div>
            )}

            {currentQaReviewLoadState.status === 'error' && (
                <div
                    role="alert"
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t('loadFailed')}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-red-300 bg-background px-2 text-[10px] text-foreground hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950"
                        onClick={retryQaResultLoad}
                    >
                        {t('retryLoad')}
                    </Button>
                </div>
            )}

            {hasRun && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label={t('dimensionsLabel')}>
                    {result.dimensions.map(dimension => (
                        <span
                            key={dimension.category}
                            className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px]',
                                dimension.status === 'issue'
                                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                                    : dimension.status === 'pass'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                      : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                            )}
                        >
                            {t(`categories.${dimension.category}`)} ·{' '}
                            {t(`dimensionStatus.${dimension.status}`)}
                        </span>
                    ))}
                </div>
            )}

            {hasRun && result.status === 'partial' && (
                <div
                    role="status"
                    className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('incompleteWarning')}
                </div>
            )}

            {isNarrow && (
                <div
                    role="tablist"
                    aria-label={t('reviewSections')}
                    className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-purple-200 bg-white/80 p-1 dark:border-purple-900 dark:bg-slate-950/80"
                >
                    {qaPanelTabs.map(tab => {
                        const label =
                            tab === 'relations'
                                ? t('relationsTitle')
                                : tab === 'issues'
                                  ? t('issuesTitle')
                                  : t('rewriteTitle');
                        const tabIndex = qaPanelTabs.indexOf(tab);
                        return (
                            <button
                                key={tab}
                                id={`qa-review-tab-${tab}`}
                                type="button"
                                role="tab"
                                aria-selected={activePanel === tab}
                                aria-controls={`qa-review-panel-${tab}`}
                                tabIndex={activePanel === tab ? 0 : -1}
                                title={label}
                                className={cn(
                                    'min-h-9 min-w-0 rounded-md px-2 py-1.5 text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1',
                                    activePanel === tab
                                        ? 'bg-purple-600 text-white shadow-sm'
                                        : 'text-muted-foreground hover:bg-purple-50 hover:text-foreground dark:hover:bg-purple-950/40'
                                )}
                                onClick={() => setActivePanel(tab)}
                                onKeyDown={event => {
                                    let nextIndex = tabIndex;
                                    if (event.key === 'ArrowRight') nextIndex = tabIndex + 1;
                                    else if (event.key === 'ArrowLeft') nextIndex = tabIndex - 1;
                                    else if (event.key === 'Home') nextIndex = 0;
                                    else if (event.key === 'End') {
                                        nextIndex = qaPanelTabs.length - 1;
                                    } else {
                                        return;
                                    }
                                    event.preventDefault();
                                    const nextTab =
                                        qaPanelTabs[
                                            (nextIndex + qaPanelTabs.length) % qaPanelTabs.length
                                        ] ?? qaPanelTabs[0];
                                    setActivePanel(nextTab);
                                    document.getElementById(`qa-review-tab-${nextTab}`)?.focus();
                                }}
                            >
                                <span className="block truncate">{label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            <ResizablePanelGroup
                direction="horizontal"
                autoSaveId="qa-review-v2-wide"
                className={cn('min-h-0 flex-1 items-stretch', isNarrow ? 'mt-1.5' : 'mt-2')}
            >
                <ResizablePanel
                    id="qa-review-panel-relations"
                    defaultSize={32}
                    minSize={20}
                    className={cn(panelClass, isNarrow && activePanel !== 'relations' && 'hidden')}
                    role={isNarrow ? 'tabpanel' : undefined}
                    aria-labelledby={isNarrow ? 'qa-review-tab-relations' : undefined}
                >
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-semibold">{t('relationsTitle')}</h3>
                        {hasRun && (
                            <span className="text-[10px] text-muted-foreground">
                                {result.relations.length}
                            </span>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 text-xs">
                        {!hasRun ? (
                            <div className="text-muted-foreground">
                                {qaResultLoadMessage || t('notRun')}
                            </div>
                        ) : result.status === 'failed' ? (
                            <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
                                {t('invalidResult')}
                            </div>
                        ) : result.relations.length ? (
                            result.relations.map(relation => (
                                <div
                                    key={relation.id}
                                    className="rounded-md border border-slate-200 p-2 dark:border-slate-800"
                                >
                                    <div className="mb-1.5 flex flex-wrap items-center gap-1">
                                        <Badge variant="outline" className="text-[10px]">
                                            {t(`categories.${relation.category}`)}
                                        </Badge>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'text-[10px]',
                                                relationClass(relation.status)
                                            )}
                                        >
                                            {t(`relationStatus.${relation.status}`)}
                                        </Badge>
                                        {relation.severity && (
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-[10px]',
                                                    severityClass(relation.severity)
                                                )}
                                            >
                                                {t(`severity.${relation.severity}`)}
                                            </Badge>
                                        )}
                                        {typeof relation.confidence === 'number' && (
                                            <span className="ml-auto text-[10px] text-muted-foreground">
                                                {Math.round(relation.confidence * 100)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                                        <div className="break-words rounded bg-slate-50 p-1.5 text-foreground/80 dark:bg-slate-900">
                                            {relation.sourceSpan || '—'}
                                        </div>
                                        <ArrowRight className="mt-1.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <div className="break-words rounded bg-slate-50 p-1.5 text-foreground/80 dark:bg-slate-900">
                                            {relation.targetSpan || '—'}
                                        </div>
                                    </div>
                                    {relation.explanation && (
                                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                                            {relation.explanation}
                                        </p>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-muted-foreground">{t('noRelations')}</div>
                        )}
                    </div>
                </ResizablePanel>

                <ResizableHandle
                    withHandle
                    aria-label={t('resizePanels')}
                    className={cn(isNarrow && 'hidden')}
                />

                <ResizablePanel
                    id="qa-review-panel-issues"
                    defaultSize={36}
                    minSize={24}
                    className={cn(panelClass, isNarrow && activePanel !== 'issues' && 'hidden')}
                    role={isNarrow ? 'tabpanel' : undefined}
                    aria-labelledby={isNarrow ? 'qa-review-tab-issues' : undefined}
                    aria-busy={savingSelection}
                >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold">{t('issuesTitle')}</h3>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 px-2 text-[10px]"
                                disabled={
                                    savingSelection ||
                                    !issues.length ||
                                    !result.evaluation?.id ||
                                    result.status !== 'complete'
                                }
                                onClick={selectBySeverity}
                            >
                                {t('selectHighRisk')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 text-[10px]"
                                disabled={
                                    savingSelection ||
                                    !selectedIds.length ||
                                    !result.evaluation?.id ||
                                    result.status !== 'complete'
                                }
                                onClick={clearSelection}
                            >
                                {t('clearSelection')}
                            </Button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 text-xs">
                        {!hasRun ? (
                            <div className="text-muted-foreground">
                                {qaResultLoadMessage || t('notDetected')}
                            </div>
                        ) : issues.length ? (
                            issues.map(issue => {
                                const selected = result.selectedMap[issue.id] === true;
                                return (
                                    <label
                                        key={issue.id}
                                        className={cn(
                                            'block cursor-pointer rounded-md border p-2 transition-colors',
                                            selected
                                                ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                                                : 'border-slate-200 hover:border-purple-300 dark:border-slate-800 dark:hover:border-purple-800'
                                        )}
                                    >
                                        <div className="flex items-start gap-2">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                                                checked={selected}
                                                disabled={
                                                    savingSelection ||
                                                    !result.evaluation?.id ||
                                                    result.status !== 'complete'
                                                }
                                                onChange={() => toggleIssue(issue)}
                                                aria-label={t('selectIssue', {
                                                    category: t(`categories.${issue.category}`),
                                                })}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-[10px]',
                                                            severityClass(issue.severity)
                                                        )}
                                                    >
                                                        {issue.severity
                                                            ? t(`severity.${issue.severity}`)
                                                            : t('unrated')}
                                                    </Badge>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px]"
                                                    >
                                                        {t(`categories.${issue.category}`)}
                                                    </Badge>
                                                </div>
                                                {(issue.sourceSpan || issue.targetSpan) && (
                                                    <div className="mt-1.5 grid gap-1 text-[11px]">
                                                        {issue.sourceSpan && (
                                                            <div>
                                                                <span className="text-muted-foreground">
                                                                    {t('sourceEvidence')}
                                                                </span>{' '}
                                                                {issue.sourceSpan}
                                                            </div>
                                                        )}
                                                        {issue.targetSpan && (
                                                            <div>
                                                                <span className="text-muted-foreground">
                                                                    {t('targetEvidence')}
                                                                </span>{' '}
                                                                {issue.targetSpan}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {issue.message && (
                                                    <p className="mt-1.5 leading-relaxed text-foreground/80">
                                                        {issue.message}
                                                    </p>
                                                )}
                                                {issue.advice && (
                                                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                                        {t('advicePrefix')} {issue.advice}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })
                        ) : result.status === 'complete' && !result.legacy ? (
                            <div className="flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                {t('noIssuesComplete')}
                            </div>
                        ) : (
                            <div className="text-muted-foreground">{t('noIssuesUnknown')}</div>
                        )}
                    </div>
                </ResizablePanel>

                <ResizableHandle
                    withHandle
                    aria-label={t('resizePanels')}
                    className={cn(isNarrow && 'hidden')}
                />

                <ResizablePanel
                    id="qa-review-panel-rewrite"
                    defaultSize={32}
                    minSize={22}
                    className={cn(panelClass, isNarrow && activePanel !== 'rewrite' && 'hidden')}
                    role={isNarrow ? 'tabpanel' : undefined}
                    aria-labelledby={isNarrow ? 'qa-review-tab-rewrite' : undefined}
                >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold">{t('rewriteTitle')}</h3>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={showDiff}
                                disabled={!baseText || !comparisonText}
                                onChange={() => setShowDiff(value => !value)}
                            />
                            {t('showDiff')}
                        </label>
                    </div>

                    {showDiff && baseText && comparisonText && (
                        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-muted-foreground dark:border-slate-800 dark:bg-slate-900">
                            <span className="flex items-center gap-1">
                                <span className="h-2.5 w-2.5 rounded-sm bg-red-100 ring-1 ring-red-200 dark:bg-red-950 dark:ring-red-900" />
                                {t('diffRemoved')}
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:ring-emerald-900" />
                                {t('diffAdded')}
                            </span>
                            {noRevisionNeeded && (
                                <span className="ml-auto font-medium text-emerald-700 dark:text-emerald-300">
                                    {t('noRevisionNeeded')}
                                </span>
                            )}
                        </div>
                    )}

                    <Button
                        type="button"
                        size="sm"
                        className="mb-2 min-h-9 w-full text-xs"
                        disabled={
                            loadingEmbedded ||
                            !selectedIds.length ||
                            !result.evaluation?.id ||
                            result.status !== 'complete' ||
                            revisionContextStale
                        }
                        onClick={generateRevision}
                    >
                        {loadingEmbedded ? (
                            <>
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                {t('generating')}
                            </>
                        ) : (
                            t('regenerateSelected', { count: selectedIds.length })
                        )}
                    </Button>

                    {hasRun && (!result.evaluation?.id || revisionContextStale) && (
                        <div className="mb-2 flex gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {t('rerunRequired')}
                        </div>
                    )}

                    <div
                        className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 text-xs"
                        aria-live="polite"
                    >
                        {!baseText && !proposalText && (
                            <div className="text-muted-foreground">
                                {qaResultLoadMessage || t('noResults')}
                            </div>
                        )}
                        {baseText && (
                            <div
                                className={cn(
                                    'rounded-md border p-2',
                                    baseApplied
                                        ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20'
                                        : 'border-slate-200 dark:border-slate-800'
                                )}
                            >
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-medium">
                                        {t('baseTranslation')}
                                    </span>
                                    {baseApplied && (
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-300 text-[10px] text-emerald-700"
                                        >
                                            {t('applied')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground/80">
                                    {diff
                                        ? diff.baseline.map((part, index) =>
                                              part.type === 'del' && !/^\s+$/.test(part.text) ? (
                                                  <mark
                                                      key={index}
                                                      className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                                                  >
                                                      {part.text}
                                                  </mark>
                                              ) : (
                                                  <span key={index}>{part.text}</span>
                                              )
                                          )
                                        : baseText}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 h-9 text-[11px]"
                                    disabled={!result.evaluation?.id || revisionContextStale}
                                    onClick={() => void applyToTarget('base')}
                                >
                                    {t('restoreBase')}
                                </Button>
                            </div>
                        )}
                        {comparisonText && (
                            <div
                                className={cn(
                                    'rounded-md border p-2',
                                    noRevisionNeeded || proposalApplied
                                        ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20'
                                        : proposalStale
                                          ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
                                          : 'border-slate-200 dark:border-slate-800'
                                )}
                            >
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-medium">
                                        {t('revisedTranslation')}
                                    </span>
                                    {proposalApplied && (
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-300 text-[10px] text-emerald-700"
                                        >
                                            {t('applied')}
                                        </Badge>
                                    )}
                                    {noRevisionNeeded && (
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-300"
                                        >
                                            {t('noRevisionNeeded')}
                                        </Badge>
                                    )}
                                    {proposalStale && (
                                        <Badge
                                            variant="outline"
                                            className="border-amber-300 text-[10px] text-amber-700"
                                        >
                                            {t('staleProposal')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground/80">
                                    {diff
                                        ? diff.embedded.map((part, index) =>
                                              part.type === 'ins' && !/^\s+$/.test(part.text) ? (
                                                  <mark
                                                      key={index}
                                                      className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                                  >
                                                      {part.text}
                                                  </mark>
                                              ) : (
                                                  <span key={index}>{part.text}</span>
                                              )
                                          )
                                        : comparisonText}
                                </div>
                                {proposalText ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="mt-2 h-9 text-[11px]"
                                        disabled={proposalStale}
                                        onClick={() => void applyToTarget('proposal')}
                                    >
                                        {t('applyToTarget')}
                                    </Button>
                                ) : (
                                    <p className="mt-2 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                                        {t('noRevisionDetail')}
                                    </p>
                                )}
                            </div>
                        )}
                        {baseText && !comparisonText && (
                            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 p-3 text-[11px] leading-relaxed text-muted-foreground dark:border-slate-700 dark:bg-slate-900/60">
                                {t('diffPendingHint')}
                            </div>
                        )}
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
