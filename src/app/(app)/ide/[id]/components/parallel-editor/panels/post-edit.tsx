'use client';

import {
    applyPostEditRewriteAction,
    getDocumentItemIntermediateResultsAction,
    savePostEditResultsAction,
} from '@/actions/intermediate-results';
import { embedDiscourseAction, evaluateDiscourseAction } from '@/actions/postedit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useTranslationContent } from '@/hooks/useTranslation';
import { memorySearchDisplaySignal } from '@/lib/memory-search';
import {
    completePostEditOutcome,
    failedPostEditOutcome,
    idlePostEditOutcome,
    postEditDisplayOutcome,
    postEditOutcomeForItem,
} from '@/lib/post-edit-query-outcome';
import { isCurrentProjectPostEditItem } from '@/lib/post-edit-project-scope';
import { wordDiff } from '@/lib/text-diff';
import { cn } from '@/lib/utils';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    Copy,
    Loader2,
    TrendingUp,
    XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { MemoryHit } from '@/agents/tools/memory';
import { createLogger } from '@/lib/logger';
const logger = createLogger(
    {
        type: 'parallel-editor:post-edit',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
interface EvaluationResult {
    styleMatchScore?: number;
    styleComments?: string;
    consistencyScore?: number;
    consistencyComments?: string;
    wordChoiceScore?: number;
    wordChoiceComments?: string;
    overallScore?: number;
    recommendations?: string[];
}

export default function PostEditPanel() {
    const t = useTranslations('IDE.postEditPanel');
    const tCommon = useTranslations('Common');
    const { sourceText, targetText, setPersistedTargetTranslationText, setTargetTranslationText } =
        useTranslationContent();
    const { activeDocumentItem } = useActiveDocumentItem();
    const { explorerTabs } = useExplorerTabs();
    const params = useParams<{ id?: string | string[] }>();
    const routeProjectId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const rawActiveItemId = String((activeDocumentItem as any)?.id || '');
    const explorerProjectMatchesRoute =
        Boolean(routeProjectId) && String(explorerTabs?.projectId || '') === String(routeProjectId);
    const activeItemBelongsToCurrentProject = isCurrentProjectPostEditItem({
        routeProjectId,
        explorerProjectId: explorerTabs?.projectId,
        activeItemId: rawActiveItemId,
        documentTabs: explorerTabs?.documentTabs,
    });
    const activeItemId = activeItemBelongsToCurrentProject ? rawActiveItemId : '';
    const projectIsSwitching = Boolean(rawActiveItemId) && !explorerProjectMatchesRoute;
    const activeItemIsOutsideCurrentProject =
        Boolean(rawActiveItemId) &&
        explorerProjectMatchesRoute &&
        !activeItemBelongsToCurrentProject;
    const activeItemIdRef = useRef(activeItemId);
    const restoreRequestRef = useRef(0);
    const mutationRequestRef = useRef(0);
    const sourceTextRef = useRef(String(sourceText || ''));
    const targetTextRef = useRef(String(targetText || ''));
    activeItemIdRef.current = activeItemId;
    sourceTextRef.current = String(sourceText || '');
    targetTextRef.current = String(targetText || '');

    // 从工作流状态获取数据
    const posteditItemId = useAgentWorkflowSteps(s => s.posteditItemId) as string | undefined;
    const storedPosteditMemos = useAgentWorkflowSteps(s => s.posteditMemos) as
        | MemoryHit[]
        | undefined;
    const storedPosteditDiscourse = useAgentWorkflowSteps(s => s.posteditDiscourse) as
        | EvaluationResult
        | undefined;
    const storedPosteditResult = useAgentWorkflowSteps(s => s.posteditResult) as string | undefined;
    const posteditOutcomes = useAgentWorkflowSteps(s => s.posteditOutcomes);
    const setPosteditOutputs = useAgentWorkflowSteps(s => s.setPosteditOutputs);
    const setPosteditOutcome = useAgentWorkflowSteps(s => s.setPosteditOutcome);
    const posteditOutcomesRef = useRef(posteditOutcomes);
    posteditOutcomesRef.current = posteditOutcomes;

    // A single Redux output slot is shared by the editor. Never let it render
    // for a new segment until the slot's owner has been explicitly updated.
    const hasCurrentPosteditOutput = Boolean(activeItemId) && posteditItemId === activeItemId;
    const posteditMemos = hasCurrentPosteditOutput ? storedPosteditMemos : undefined;
    const posteditDiscourse = hasCurrentPosteditOutput ? storedPosteditDiscourse : undefined;
    const posteditResult = hasCurrentPosteditOutput ? storedPosteditResult : undefined;

    // 本地状态
    const [selectedReferences, setSelectedReferences] = useState<MemoryHit[]>([]);
    const [selectedReferenceItemId, setSelectedReferenceItemId] = useState('');
    const [storedResultStale, setStoredResultStale] = useState(false);
    const selectedReferencesForActiveItem =
        selectedReferenceItemId === activeItemId ? selectedReferences : [];

    // 从数据库恢复结果
    useEffect(() => {
        const docId = activeItemId;
        const requestId = ++restoreRequestRef.current;
        let cancelled = false;

        // The workflow store is shared by all segments. Clear it before loading
        // the next item so a slow response for the previous item cannot make its
        // references or rewrite appear in the newly selected segment.
        setSelectedReferences([]);
        setSelectedReferenceItemId(docId);
        setIsEditing(false);
        setEditedText('');
        setStoredResultStale(false);
        setPosteditOutputs(undefined);

        if (!docId) {
            return () => {
                cancelled = true;
            };
        }

        const previousOutcome = postEditOutcomeForItem(posteditOutcomesRef.current, docId);
        // A visible failure remains actionable until the user retries from the
        // workflow controls. Do not let a routine panel restore erase it.
        if (previousOutcome.status === 'error') {
            return () => {
                cancelled = true;
            };
        }
        setPosteditOutcome({ itemId: docId, status: 'loading', phase: 'restore' });

        const restoreIsCurrent = () => {
            const outcome = postEditOutcomeForItem(posteditOutcomesRef.current, docId);
            return outcome.status === 'loading' && outcome.phase === 'restore';
        };

        const loadResults = async () => {
            try {
                const results = await getDocumentItemIntermediateResultsAction(docId);
                if (
                    cancelled ||
                    requestId !== restoreRequestRef.current ||
                    activeItemIdRef.current !== docId
                ) {
                    return;
                }
                // A new query may have started while the old persisted result
                // request was in flight. Only this restore request may publish
                // its result; otherwise it could turn a new failure/loading
                // state back into idle or success.
                if (!restoreIsCurrent()) return;

                if (results) {
                    setStoredResultStale(Boolean(results.postEditStale));
                    // 恢复译后编辑结果 - 从数据库字段映射到工作流状态
                    const hasPersistedPostEdit = Boolean(
                        results.postEditQuery ||
                        results.postEditEvaluation ||
                        results.postEditRewrite
                    );
                    if (hasPersistedPostEdit) {
                        setPosteditOutputs({
                            itemId: docId,
                            memos: Array.isArray(results.postEditQuery)
                                ? results.postEditQuery
                                : undefined,
                            discourse: results.postEditEvaluation,
                            result: results.postEditRewrite,
                        });
                        setPosteditOutcome(
                            completePostEditOutcome(
                                docId,
                                Array.isArray(results.postEditQuery)
                                    ? results.postEditQuery
                                    : undefined
                            )
                        );
                    } else {
                        setPosteditOutcome(idlePostEditOutcome(docId));
                    }
                } else {
                    setPosteditOutcome(idlePostEditOutcome(docId));
                }
            } catch (error) {
                if (
                    !cancelled &&
                    requestId === restoreRequestRef.current &&
                    activeItemIdRef.current === docId
                ) {
                    logger.error('Failed to load post-edit results:', error);
                    if (restoreIsCurrent()) {
                        setPosteditOutcome(
                            failedPostEditOutcome(docId, 'restore', error, t('loadFailed'))
                        );
                    }
                }
            }
        };

        void loadResults();
        return () => {
            cancelled = true;
        };
        // The store action wrapper is recreated on each render. Depending on it
        // would refetch and clear the active segment on every store update.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeItemId]);

    // 编辑状态
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showDiff, setShowDiff] = useState(false);
    const [appliedKind, setAppliedKind] = useState<'original' | 'enhanced' | null>(null);
    const [regenerating, setRegenerating] = useState(false);

    // 工具函数
    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            toast.success(tCommon('success'));
            setTimeout(() => setCopiedId(null), 2000);
        } catch (error) {
            toast.error(tCommon('error'));
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-green-600 dark:text-green-400';
        if (score >= 0.6) return 'text-blue-600 dark:text-blue-400';
        if (score >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    const getScoreIcon = (score: number) => {
        if (score >= 0.8) return <CheckCircle className="h-3 w-3 text-green-600" />;
        if (score >= 0.6) return <TrendingUp className="h-3 w-3 text-blue-600" />;
        if (score >= 0.4) return <AlertTriangle className="h-3 w-3 text-yellow-600" />;
        return <XCircle className="h-3 w-3 text-red-600" />;
    };

    const getScoreLabel = (score: number) => {
        if (score >= 0.8) return 'Excellent';
        if (score >= 0.6) return 'Good';
        if (score >= 0.4) return 'Fair';
        return 'Needs Improvement';
    };

    const handleSelectionChange = (hit: MemoryHit, selected: boolean) => {
        setSelectedReferenceItemId(activeItemId);
        setSelectedReferences(current => {
            if (selected) {
                return current.some(reference => reference.id === hit.id)
                    ? current
                    : [...current, hit];
            }
            return current.filter(reference => reference.id !== hit.id);
        });
    };

    const isSelected = (hit: MemoryHit) => {
        return (
            selectedReferenceItemId === activeItemId &&
            selectedReferences.some(h => h.id === hit.id)
        );
    };

    const isCurrentPostEditInput = (itemId: string, source: string, target: string) =>
        activeItemIdRef.current === itemId &&
        sourceTextRef.current === source &&
        targetTextRef.current === target;

    const handleApplyToEditor = async (text: string, kind: 'original' | 'enhanced') => {
        const itemId = activeItemId;
        const source = String(sourceText || '');
        const target = String(targetText || '');
        const next = String(text || '').trim();
        if (!itemId || !source || !next) {
            toast.error(tCommon('error'));
            return;
        }
        if (kind === 'enhanced' && storedResultStale) {
            toast.error('该译后编辑建议基于旧版本译文，请先重新嵌入生成建议。');
            return;
        }
        if (next === target) {
            setAppliedKind(kind);
            return;
        }

        const requestId = ++mutationRequestRef.current;
        try {
            const applied = await applyPostEditRewriteAction(itemId, next, {
                sourceText: source,
                targetText: target,
            });
            if (
                requestId !== mutationRequestRef.current ||
                !isCurrentPostEditInput(itemId, source, target)
            ) {
                return;
            }
            setTargetTranslationText(applied.targetText);
            setPersistedTargetTranslationText(applied.targetText);
            setAppliedKind(kind);
            toast.success(t('applied'));
        } catch (error) {
            logger.error('Failed to apply post-edit proposal:', error);
            toast.error(tCommon('error'));
        }
    };

    const handleStartEdit = () => {
        setEditedText(posteditResult || targetText || '');
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        const itemId = activeItemId;
        const source = String(sourceText || '');
        const target = String(targetText || '');
        const rewrite = editedText.trim();
        const query = posteditMemos;
        const evaluation = posteditDiscourse;
        if (!itemId || !source || !target || !rewrite) return;

        const requestId = ++mutationRequestRef.current;
        setPosteditOutcome({ itemId, status: 'loading', phase: 'persist' });
        try {
            await savePostEditResultsAction(
                itemId,
                {
                    query,
                    evaluation,
                    rewrite,
                },
                { sourceText: source, targetText: target }
            );
            if (
                requestId !== mutationRequestRef.current ||
                !isCurrentPostEditInput(itemId, source, target)
            ) {
                return;
            }
            setPosteditOutputs({
                itemId,
                memos: query,
                discourse: evaluation,
                result: rewrite,
            });
            setPosteditOutcome(completePostEditOutcome(itemId, query));
            setStoredResultStale(false);
            setIsEditing(false);
            toast.success(t('applied'));
        } catch (error) {
            logger.error('Failed to save post-edit proposal:', error);
            const failure = failedPostEditOutcome(itemId, 'persist', error, t('saveFailed'));
            if (isCurrentPostEditInput(itemId, source, target)) setPosteditOutcome(failure);
            toast.error(failure.message);
        }
    };

    const handleCancelEdit = () => {
        setEditedText('');
        setIsEditing(false);
    };

    // 重新嵌入（基于当前选择的参考翻译，或默认使用全部记忆命中）
    const handleRegenerateEmbedding = async () => {
        const itemId = activeItemId;
        const inputSource = String(sourceText || '').trim();
        const inputTarget = String(targetText || '');
        if (!itemId) return;
        try {
            if (!inputTarget) {
                toast.error('当前没有可用的目标译文');
                return;
            }
            setRegenerating(true);
            const refs =
                selectedReferencesForActiveItem.length > 0
                    ? selectedReferencesForActiveItem
                    : posteditMemos || [];
            const query = posteditMemos;
            if (!inputSource) {
                logger.warn('Cannot regenerate discourse embedding without source text');
                toast.error(tCommon('error'));
                return;
            }
            const requestId = ++mutationRequestRef.current;
            setPosteditOutcome({ itemId, status: 'loading', phase: 'evaluation' });
            // The reviewer may have selected a narrower reference set than the
            // original query. Re-evaluate against exactly that set so the
            // assessment and rewrite are derived from the same evidence.
            const refreshedEvaluation = await evaluateDiscourseAction(inputSource, inputTarget, {
                references: refs,
            });
            if (
                requestId !== mutationRequestRef.current ||
                !isCurrentPostEditInput(itemId, inputSource, inputTarget)
            ) {
                return;
            }
            setPosteditOutcome({ itemId, status: 'loading', phase: 'rewrite' });
            const rewritten = await embedDiscourseAction(inputSource, inputTarget, refs as any);
            if (
                requestId !== mutationRequestRef.current ||
                !isCurrentPostEditInput(itemId, inputSource, inputTarget)
            ) {
                return;
            }
            setPosteditOutcome({ itemId, status: 'loading', phase: 'persist' });
            await savePostEditResultsAction(
                itemId,
                {
                    query,
                    evaluation: refreshedEvaluation,
                    rewrite: rewritten,
                },
                { sourceText: inputSource, targetText: inputTarget }
            );
            if (
                requestId !== mutationRequestRef.current ||
                !isCurrentPostEditInput(itemId, inputSource, inputTarget)
            ) {
                return;
            }
            setPosteditOutputs({
                itemId,
                memos: query,
                discourse: refreshedEvaluation,
                result: rewritten,
            });
            setPosteditOutcome(completePostEditOutcome(itemId, query));
            setStoredResultStale(false);
            toast.success('已重新生成语篇嵌入改写');
        } catch (e) {
            logger.error('Failed to regenerate post-edit proposal');
            const failure = failedPostEditOutcome(itemId, 'rewrite', e, t('regenerateFailed'));
            if (isCurrentPostEditInput(itemId, inputSource, inputTarget)) {
                setPosteditOutcome(failure);
            }
            toast.error(failure.message);
        } finally {
            setRegenerating(false);
        }
    };

    // 根据当前译文识别已应用的版本
    useEffect(() => {
        const cur = String(targetText || '');
        const orig = String(targetText || '');
        const enh = String(posteditResult || '');
        if (orig && cur === orig && cur !== enh) setAppliedKind('original');
        else if (enh && cur === enh && cur !== orig) setAppliedKind('enhanced');
        else setAppliedKind(null);
    }, [targetText, posteditResult]);

    // 当前使用的数据源
    const queryResults = posteditMemos || [];
    const queryOutcome = postEditDisplayOutcome(posteditOutcomes, activeItemId, posteditItemId);
    const queryFailed = queryOutcome.status === 'error' && queryOutcome.phase === 'query';
    const queryOutcomeMessage = queryOutcome.message || t('postEditFailed');
    const evaluation = posteditDiscourse;
    const enhancedTarget = posteditResult;

    const panelCls = 'border border-slate-200 dark:border-slate-800';

    return (
        <div className="flex h-full w-full flex-col rounded border border-orange-200 bg-orange-50 p-2 dark:border-orange-800 dark:bg-orange-950/30">
            <div className="mb-2 text-xs font-medium text-foreground/70">{t('title')}</div>
            {projectIsSwitching && (
                <div
                    className="mb-2 rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    {t('projectSwitching')}
                </div>
            )}
            {activeItemIsOutsideCurrentProject && (
                <div
                    className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                    role="status"
                    aria-live="polite"
                >
                    {t('noCurrentProjectItem')}
                </div>
            )}
            {storedResultStale && hasCurrentPosteditOutput && (
                <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    当前结果基于旧版原文或译文，仅供参考；请重新嵌入后再应用建议。
                </div>
            )}

            <ResizablePanelGroup
                direction="horizontal"
                className="h-full items-stretch"
                onLayout={(sizes: number[]) => {
                    try {
                        document.cookie = `react-resizable-panels:pe-review-layout=${JSON.stringify(sizes)}`;
                    } catch {}
                }}
            >
                {/* 语篇查询面板 */}
                <ResizablePanel
                    defaultSize={33}
                    minSize={20}
                    className={cn('rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('discourseQuery')}
                        </div>
                        <div className="mb-1 text-xs text-foreground/60">
                            {t('totalResults')} {queryResults.length} 条
                            {selectedReferencesForActiveItem.length > 0 &&
                                ` · ${t('selectedResults')} ${selectedReferencesForActiveItem.length} 条`}
                        </div>
                    </div>

                    <div className="h-full space-y-2 overflow-auto text-xs">
                        {queryOutcome.status === 'error' && (
                            <div
                                className="rounded border border-destructive/40 bg-destructive/5 p-3 text-left"
                                role="alert"
                            >
                                <div className="flex gap-2">
                                    <AlertCircle
                                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0">
                                        <p className="font-medium text-destructive">
                                            {queryOutcome.phase === 'restore'
                                                ? t('loadResultsFailed')
                                                : queryFailed
                                                  ? t('queryFailed')
                                                  : t('postEditFailed')}
                                        </p>
                                        <p className="mt-1 break-words text-muted-foreground">
                                            {queryOutcomeMessage}
                                        </p>
                                        <p className="mt-2 text-muted-foreground">
                                            {t('queryFailureHint')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {queryOutcome.status === 'loading' && (
                            <div
                                className="flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-3 py-2 text-muted-foreground"
                                role="status"
                                aria-live="polite"
                            >
                                <Loader2
                                    className="h-4 w-4 animate-spin text-primary"
                                    aria-hidden="true"
                                />
                                <span>
                                    {queryOutcome.phase === 'restore'
                                        ? t('loadingSavedResults')
                                        : t('queryRunning')}
                                </span>
                            </div>
                        )}

                        {queryResults.length === 0 &&
                        queryOutcome.status !== 'error' &&
                        queryOutcome.status !== 'loading' ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <AlertCircle className="mb-3 h-12 w-12 text-muted-foreground" />
                                <div className="text-sm text-muted-foreground">
                                    <p className="mb-1 font-medium">{t('noTranslation')}</p>
                                    <p>
                                        {queryOutcome.status === 'success-empty'
                                            ? t('queryEmpty')
                                            : t('performQuery')}
                                    </p>
                                </div>
                            </div>
                        ) : queryResults.length > 0 ? (
                            queryResults.map((hit, index) => {
                                const retrievalSignal = memorySearchDisplaySignal(hit);
                                const retrievalLabel =
                                    retrievalSignal.kind === 'semantic'
                                        ? t('semanticSimilarity')
                                        : retrievalSignal.kind === 'keyword'
                                          ? t('keywordMatch')
                                          : t('retrievalMatch');

                                return (
                                    <div
                                        key={hit.id}
                                        className={cn(
                                            'cursor-pointer rounded border p-2 transition-shadow hover:shadow-sm',
                                            isSelected(hit)
                                                ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20'
                                                : 'border-slate-200 dark:border-slate-700'
                                        )}
                                    >
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    checked={isSelected(hit)}
                                                    onCheckedChange={checked =>
                                                        handleSelectionChange(
                                                            hit,
                                                            checked as boolean
                                                        )
                                                    }
                                                    className="mr-1"
                                                />
                                                <Badge
                                                    variant="outline"
                                                    className="h-4 px-1 text-[10px]"
                                                >
                                                    #{index + 1}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {retrievalSignal.kind === 'semantic' && (
                                                    <span
                                                        className={`text-xs font-medium ${getScoreColor(retrievalSignal.score)}`}
                                                    >
                                                        {Math.round(retrievalSignal.score * 100)}%
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-muted-foreground">
                                                    {retrievalLabel}
                                                </span>
                                            </div>
                                        </div>

                                        {retrievalSignal.kind === 'semantic' && (
                                            <Progress
                                                value={Math.round(retrievalSignal.score * 100)}
                                                className="mb-2 h-1"
                                            />
                                        )}

                                        <div className="space-y-2">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                        {t('sourceText')}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-4 px-1"
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                hit.source,
                                                                `source-${hit.id}`
                                                            )
                                                        }
                                                    >
                                                        {copiedId === `source-${hit.id}` ? (
                                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                </div>
                                                <div className="rounded bg-muted/30 p-1 text-xs leading-relaxed">
                                                    {hit.source}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                        {t('translation')}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-4 px-1"
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                hit.target,
                                                                `target-${hit.id}`
                                                            )
                                                        }
                                                    >
                                                        {copiedId === `target-${hit.id}` ? (
                                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                </div>
                                                <div className="rounded bg-orange-50 p-1 text-xs font-medium leading-relaxed dark:bg-orange-950/20">
                                                    {hit.target}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : null}
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle className="bg-transparent" />

                {/* 语篇评估面板 */}
                <ResizablePanel
                    defaultSize={33}
                    minSize={20}
                    className={cn(
                        'flex h-full flex-col rounded bg-white p-2 dark:bg-slate-900',
                        panelCls
                    )}
                >
                    <div className="mb-1 text-[11px] font-semibold text-foreground">
                        {t('qualityAssessment')}
                    </div>

                    <div className="h-full space-y-3 overflow-auto text-xs">
                        {!evaluation ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <AlertTriangle className="mb-3 h-12 w-12 text-muted-foreground" />
                                <div className="text-sm text-muted-foreground">
                                    <p className="mb-1 font-medium">{t('noAssessment')}</p>
                                    <p>{t('selectReference')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* 风格一致性 */}
                                {evaluation.styleMatchScore !== undefined && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">
                                                {t('styleConsistency')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {getScoreIcon(evaluation.styleMatchScore)}
                                                <span
                                                    className={`text-xs font-medium ${getScoreColor(evaluation.styleMatchScore)}`}
                                                >
                                                    {Math.round(evaluation.styleMatchScore * 100)}%
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="h-4 px-1 text-[10px]"
                                                >
                                                    {getScoreLabel(evaluation.styleMatchScore)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress
                                            value={Math.round(evaluation.styleMatchScore * 100)}
                                            className="h-1.5"
                                        />
                                        {evaluation.styleComments && (
                                            <div className="rounded bg-muted/30 p-2 text-xs text-muted-foreground">
                                                {evaluation.styleComments}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 术语一致性 */}
                                {evaluation.consistencyScore !== undefined && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">
                                                {t('terminologyConsistency')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {getScoreIcon(evaluation.consistencyScore)}
                                                <span
                                                    className={`text-xs font-medium ${getScoreColor(evaluation.consistencyScore)}`}
                                                >
                                                    {Math.round(evaluation.consistencyScore * 100)}%
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="h-4 px-1 text-[10px]"
                                                >
                                                    {getScoreLabel(evaluation.consistencyScore)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress
                                            value={Math.round(evaluation.consistencyScore * 100)}
                                            className="h-1.5"
                                        />
                                        {evaluation.consistencyComments && (
                                            <div className="rounded bg-muted/30 p-2 text-xs text-muted-foreground">
                                                {evaluation.consistencyComments}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 选词准确性 */}
                                {evaluation.wordChoiceScore !== undefined && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">
                                                {t('wordChoice')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {getScoreIcon(evaluation.wordChoiceScore)}
                                                <span
                                                    className={`text-xs font-medium ${getScoreColor(evaluation.wordChoiceScore)}`}
                                                >
                                                    {Math.round(evaluation.wordChoiceScore * 100)}%
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="h-4 px-1 text-[10px]"
                                                >
                                                    {getScoreLabel(evaluation.wordChoiceScore)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress
                                            value={Math.round(evaluation.wordChoiceScore * 100)}
                                            className="h-1.5"
                                        />
                                        {evaluation.wordChoiceComments && (
                                            <div className="rounded bg-muted/30 p-2 text-xs text-muted-foreground">
                                                {evaluation.wordChoiceComments}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 改进建议 */}
                                {evaluation.recommendations &&
                                    evaluation.recommendations.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-medium">
                                                {t('suggestions')}
                                            </div>
                                            <div className="space-y-1">
                                                {evaluation.recommendations.map((rec, index) => (
                                                    <div
                                                        key={index}
                                                        className="rounded border border-blue-200 bg-blue-50/50 p-2 dark:bg-blue-950/20"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <TrendingUp className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-600" />
                                                            <div className="text-xs">{rec}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                {/* 综合评分 */}
                                {evaluation.overallScore !== undefined && (
                                    <div className="border-t pt-3">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium">
                                                    {t('overallScore')}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {getScoreIcon(evaluation.overallScore)}
                                                    <span
                                                        className={`text-xs font-medium ${getScoreColor(evaluation.overallScore)}`}
                                                    >
                                                        {Math.round(evaluation.overallScore * 100)}%
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="h-4 px-1 text-[10px]"
                                                    >
                                                        {getScoreLabel(evaluation.overallScore)}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <Progress
                                                value={Math.round(evaluation.overallScore * 100)}
                                                className="h-1.5"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle className="bg-transparent" />

                {/* 语篇嵌入面板 */}
                <ResizablePanel
                    defaultSize={34}
                    minSize={20}
                    className={cn(
                        'flex h-full flex-1 flex-col rounded bg-white p-2 dark:bg-slate-900',
                        panelCls
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('discourseEmbedding')}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={handleRegenerateEmbedding}
                                disabled={
                                    regenerating ||
                                    (queryResults.length === 0 &&
                                        selectedReferencesForActiveItem.length === 0)
                                }
                                title={
                                    selectedReferencesForActiveItem.length > 0
                                        ? t('reEmbedBasedOnSelected')
                                        : queryResults.length > 0
                                          ? t('reEmbedBasedOnAll')
                                          : t('noReference')
                                }
                            >
                                {regenerating ? (
                                    <>
                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        {t('reEmbedding')}
                                    </>
                                ) : (
                                    t('reEmbed')
                                )}
                            </Button>
                            <label className="flex items-center gap-1 text-[11px] text-foreground/70">
                                <input
                                    type="checkbox"
                                    disabled={!targetText && !enhancedTarget}
                                    checked={!!showDiff}
                                    onChange={() => setShowDiff(v => !v)}
                                />
                                {t('showDiff')}
                            </label>
                        </div>
                    </div>

                    {(() => {
                        const a = String(targetText || '');
                        const b = String(enhancedTarget || '');
                        const hasAny = (a && a.length > 0) || (b && b.length > 0);
                        const d =
                            showDiff && targetText !== null && enhancedTarget !== null
                                ? wordDiff(a, b)
                                : null;
                        return (
                            <div className="mt-4 space-y-2 overflow-auto text-xs">
                                {!hasAny && (
                                    <div className="text-foreground/60">{t('noResults')}</div>
                                )}
                                {hasAny && (
                                    <>
                                        <div
                                            className={cn(
                                                'cursor-pointer rounded-md border bg-muted/30 p-2 transition-colors hover:border-emerald-300/60',
                                                appliedKind === 'original'
                                                    ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10'
                                                    : 'border-slate-200 dark:border-slate-800'
                                            )}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (a) {
                                                    void handleApplyToEditor(String(a), 'original');
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ' ') && a) {
                                                    e.preventDefault();
                                                    void handleApplyToEditor(String(a), 'original');
                                                }
                                            }}
                                        >
                                            <div className="mb-1 flex w-full items-center justify-between text-[11px]">
                                                <div
                                                    className={cn(
                                                        'flex w-full items-center justify-between gap-2',
                                                        appliedKind === 'original'
                                                            ? 'text-emerald-700 dark:text-emerald-300'
                                                            : 'text-foreground/60'
                                                    )}
                                                >
                                                    <span>{t('originalTranslation')}</span>
                                                    {appliedKind === 'original' && (
                                                        <Badge
                                                            variant="outline"
                                                            className="h-4 border-emerald-300 px-1 py-0 text-[10px] text-emerald-700"
                                                        >
                                                            {t('applied')}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="whitespace-pre-wrap break-words">
                                                {d ? (
                                                    d.baseline.map((t, idx) => {
                                                        const isSpace = /^\s+$/.test(t.text);
                                                        if (t.type === 'del' && !isSpace) {
                                                            return (
                                                                <mark
                                                                    key={idx}
                                                                    className="rounded-[2px] bg-red-100/70 font-normal text-red-800 ring-1 ring-red-200"
                                                                >
                                                                    {t.text}
                                                                </mark>
                                                            );
                                                        }
                                                        return (
                                                            <span
                                                                key={idx}
                                                                className="text-foreground/80"
                                                            >
                                                                {t.text}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-foreground/80">
                                                        {a.slice(0, 2000)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {enhancedTarget && (
                                            <div
                                                className={cn(
                                                    'cursor-pointer rounded-md border bg-muted/30 p-2 transition-colors hover:border-emerald-300/60',
                                                    appliedKind === 'enhanced'
                                                        ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10'
                                                        : 'border-slate-200 dark:border-slate-800'
                                                )}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    if (b) {
                                                        void handleApplyToEditor(
                                                            String(b),
                                                            'enhanced'
                                                        );
                                                    }
                                                }}
                                                onKeyDown={e => {
                                                    if ((e.key === 'Enter' || e.key === ' ') && b) {
                                                        e.preventDefault();
                                                        void handleApplyToEditor(
                                                            String(b),
                                                            'enhanced'
                                                        );
                                                    }
                                                }}
                                            >
                                                <div className="mb-1 flex w-full items-center justify-between text-[11px]">
                                                    <div
                                                        className={cn(
                                                            'flex w-full items-center justify-between gap-2',
                                                            appliedKind === 'enhanced'
                                                                ? 'text-emerald-700 dark:text-emerald-300'
                                                                : 'text-foreground/60'
                                                        )}
                                                    >
                                                        <span>{t('enhancedTranslation')}</span>
                                                        {appliedKind === 'enhanced' && (
                                                            <Badge
                                                                variant="outline"
                                                                className="h-4 border-emerald-300 px-1 py-0 text-[10px] text-emerald-700"
                                                            >
                                                                {t('applied')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="whitespace-pre-wrap break-words">
                                                    {d ? (
                                                        d.embedded.map((t, idx) => {
                                                            const isSpace = /^\s+$/.test(t.text);
                                                            if (t.type === 'ins' && !isSpace) {
                                                                return (
                                                                    <mark
                                                                        key={idx}
                                                                        className="rounded-[2px] bg-emerald-100/70 font-normal text-emerald-800 ring-1 ring-emerald-200"
                                                                    >
                                                                        {t.text}
                                                                    </mark>
                                                                );
                                                            }
                                                            return (
                                                                <span
                                                                    key={idx}
                                                                    className="text-foreground/80"
                                                                >
                                                                    {t.text}
                                                                </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-foreground/80">
                                                            {b.slice(0, 2000)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
