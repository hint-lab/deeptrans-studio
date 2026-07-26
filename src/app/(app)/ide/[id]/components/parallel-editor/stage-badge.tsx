'use client';

import {
    completeQualityAssureAction,
    completePreTranslationAction,
    getContentByIdAction,
    rejectQualityAssureAction,
    rejectPostEditReviewAction,
    signOffPostEditReviewAction,
    startQualityAssureAction,
    startPreTranslationAction,
    updateDocItemStatusAction,
} from '@/actions/document-item';
import { recordGoToPreviousTranslationStageAction } from '@/actions/translation-process-event';
import { Button } from '@/components/ui/button';
import {
    TRANSLATION_REVIEW_STAGES,
    TRANSLATION_STAGES_SEQUENCE,
    getTranslationStageBadgeClass,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { getSourceEditorInstance, getTargetEditorInstance } from '@/hooks/useEditor';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useRunningState } from '@/hooks/useRunning';
import { useTranslationContent, useTranslationState } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import { resolvePreTranslationStartFailure } from '@/lib/ide-client-error';
import { resolvePostEditReviewDraft } from '@/lib/post-edit-review-draft-client';
import { getTranslationStageGuidance } from '@/lib/translation-stage-guidance';
import { getTranslationStageRejectionPlan } from '@/lib/translation-stage-rejection-plan';
import { getStageWorkbenchWorkflowKey } from '@/lib/stage-workbench';
import type { TranslationStage } from '@/store/features/translationSlice';
import { Check, ChevronRight, FileText, Loader2, Play, Undo2, Workflow } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import TranslationGuideButton from './hello-page';

const logger = createLogger(
    {
        type: 'ide:stage-badge',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

export type StageBadgeBarProps = {
    contentReady: boolean;
    runTranslate: (options?: {
        expectedSourceText?: string;
        expectedTargetText?: string;
        preTranslateRunId?: string;
    }) => Promise<void>;
    undoTranslate: () => Promise<void>;
    runQA: (options: {
        expectedSourceText: string;
        expectedTargetText: string;
        qaRunId: string;
    }) => Promise<void>;
    runPostEdit: () => Promise<void>;
    clearQAOutputs: (itemId: string) => void;
    clearPostEditOutputs: (itemId: string) => void;
    onOpenWorkflow: () => void;
    saveRecord: (
        stage: TranslationStage,
        actorType: 'AGENT' | 'USER',
        status: 'STARTED' | 'SUCCESS' | 'FAILED'
    ) => Promise<void>;
    className?: string;
};

/**
 * A NOT_STARTED click has no server status to restore when its strict claim
 * fails. Writing a compensating NOT_STARTED update could otherwise undo an MT
 * successfully claimed in another browser tab.
 */
export function getAcceptFailureRollbackStage(
    stage: TranslationStage
): TranslationStage | undefined {
    if (stage === 'NOT_STARTED' || stage === 'MT_REVIEW') return undefined;
    if (stage === 'QA_REVIEW') return stage;
    return undefined;
}

const StageBadgeBar: React.FC<StageBadgeBarProps> = ({
    className,
    contentReady,
    runTranslate,
    undoTranslate,
    runQA,
    runPostEdit,
    clearQAOutputs,
    clearPostEditOutputs,
    onOpenWorkflow,
    saveRecord,
}) => {
    const t = useTranslations('IDE.parallelEditor');
    const tGuidance = useTranslations('IDE.stageGuidance');
    const tStage = useTranslations('IDE.translationStages');
    const { isRunning, setIsRunning } = useRunningState();
    const { currentStage, setCurrentStage } = useTranslationState();
    const {
        contentItemId,
        sourceText,
        persistedSourceText,
        targetText,
        persistedTargetText,
        setPersistedSourceTranslationText,
        setPersistedTargetTranslationText,
        setSourceTranslationText,
        setTargetTranslationText,
    } = useTranslationContent();
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const { updateDocumentItemStatus } = useExplorerTabs();
    const activeDocumentItemRef = useRef(activeDocumentItem);
    activeDocumentItemRef.current = activeDocumentItem;
    const contentItemIdRef = useRef(contentItemId);
    const sourceTextRef = useRef(sourceText);
    const persistedSourceTextRef = useRef(persistedSourceText);
    const targetTextRef = useRef(targetText);
    const persistedTargetTextRef = useRef(persistedTargetText);
    contentItemIdRef.current = contentItemId;
    sourceTextRef.current = sourceText;
    persistedSourceTextRef.current = persistedSourceText;
    targetTextRef.current = targetText;
    persistedTargetTextRef.current = persistedTargetText;

    const steps: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
    const rejectText = t('actions.reject');
    const currentStageGuidance = getTranslationStageGuidance(currentStage);
    const currentStageLabel = getTranslationStageLabel(currentStage, tStage);
    const currentSegmentLabel =
        typeof activeDocumentItem.order === 'number' && activeDocumentItem.order > 0
            ? tGuidance('segmentNumber', { index: activeDocumentItem.order })
            : tGuidance('currentSegment');
    const currentSegmentName =
        String(activeDocumentItem.name || '').trim() || tGuidance('unnamedSegment');
    const stageStatusId = React.useId();
    const stageToneClass =
        currentStageGuidance.tone === 'running'
            ? 'border-indigo-500/25 bg-indigo-500/8 text-indigo-700 dark:text-indigo-300'
            : currentStageGuidance.tone === 'review'
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200'
              : currentStageGuidance.tone === 'signoff' || currentStageGuidance.tone === 'completed'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : currentStageGuidance.tone === 'attention'
                  ? 'border-destructive/30 bg-destructive/8 text-destructive'
                  : 'border-border bg-muted/50 text-foreground';

    // 按钮文案逻辑
    const getAcceptButtonText = (stage: TranslationStage) => {
        switch (stage) {
            case 'NOT_STARTED':
                return t('actions.startPreTranslation');
            case 'MT_REVIEW':
                return t('actions.submitToQA');
            case 'QA_REVIEW':
                return t('actions.submitToPostEdit'); // "提交至译后编辑"
            // 注意：这里 PE 和 PE Review 现在是分开的，所以文案要准确
            case 'POST_EDIT_REVIEW':
                return t('actions.approveSignOff');
            case 'SIGN_OFF':
                return t('actions.completeProject');
            case 'POST_EDIT':
                return t('actions.submitToPostEditReview');
            case 'ERROR':
            case 'CANCELED':
                return t('actions.restartPreTranslation');
            default:
                return t('actions.approve');
        }
    };

    // MT QA阶段各包含两个子过程：分别为：MT、MT_REVIEW和QA、QA_REVIEW。隐藏“下一步”按钮（自动化运行中）
    const shouldHideAcceptButton = (stage: TranslationStage) => {
        return ['MT', 'QA'].includes(stage);
    };

    const shouldDisableButtons = (): boolean => {
        return isRunning || !activeDocumentItem.id || !contentReady;
    };

    // Redux normally mirrors TipTap immediately. During composition or a
    // same-tick click, however, its latest dispatch can still lag the visible
    // editor. Read that draft only when it belongs to this source editor and
    // was explicitly marked dirty; otherwise preserve the durable snapshot.
    const getVisibleSourceDraft = (itemId: string) => {
        const fallback = String(sourceTextRef.current || '');
        try {
            const editor = getSourceEditorInstance();
            const editorItemId = editor?.view.dom.getAttribute('data-deeptrans-editor-item-id');
            const editorJob = editor?.view.dom.getAttribute('data-deeptrans-editor-job');
            const dirty = editor?.view.dom.getAttribute('data-deeptrans-editor-dirty') === 'true';
            if (editor && editorItemId === itemId && editorJob === 'rawtext' && dirty) {
                return editor.getHTML();
            }
        } catch {}
        return fallback;
    };

    const lockVisibleSourceEditor = (itemId: string) => {
        try {
            const editor = getSourceEditorInstance();
            if (
                editor?.view.dom.getAttribute('data-deeptrans-editor-item-id') === itemId &&
                editor.view.dom.getAttribute('data-deeptrans-editor-job') === 'rawtext'
            ) {
                editor.setEditable(false);
            }
        } catch {}
    };

    const syncLocalStatus = (itemId: string, status: string) => {
        updateDocumentItemStatus(itemId, status);
        const currentItem = activeDocumentItemRef.current;
        if (String(currentItem?.id || '') === String(itemId)) {
            setActiveDocumentItem({ ...currentItem, status });
        }
    };

    const syncStatusUpdate = async (itemId: string, status: string) => {
        try {
            await updateDocItemStatusAction(itemId, status as TranslationStage);
            syncLocalStatus(itemId, status);
        } catch (error) {
            logger.error('Status sync failed:', error);
            throw error;
        }
    };

    /**
     * Status is the source of truth.  Once its guarded server update succeeds,
     * write a best-effort audit event without allowing a timeline failure to
     * undo that successful rollback or make the UI pretend it failed.
     */
    const recordRollbackAfterStatus = async (
        itemId: string,
        fromStage: TranslationStage,
        toStage: TranslationStage
    ) => {
        try {
            const recorded = await recordGoToPreviousTranslationStageAction(itemId, toStage, {
                fromStage,
            });
            if (recorded.success) return;
            logger.warn(`状态已回退 ${fromStage} -> ${toStage}，但回退事件未记录`);
            toast.warning('分段已回退，但过程记录未保存', {
                description: '请稍后在签发时间线中核对该操作。',
            });
        } catch {
            logger.warn(`状态已回退 ${fromStage} -> ${toStage}，但回退事件写入异常`);
            toast.warning('分段已回退，但过程记录未保存', {
                description: '请稍后在签发时间线中核对该操作。',
            });
        }
    };

    async function onReject(stage: TranslationStage) {
        const operationItemId = String(activeDocumentItem.id || '');
        if (!operationItemId) return;
        const setOperationStage = (nextStage: TranslationStage) => {
            if (String(activeDocumentItemRef.current?.id || '') === operationItemId) {
                setCurrentStage(nextStage);
            }
        };
        setIsRunning(true);
        const rejectionPlan = getTranslationStageRejectionPlan(stage);

        try {
            if (rejectionPlan.usesAtomicPostEditReviewReset) {
                await rejectPostEditReviewAction(operationItemId);
                await recordRollbackAfterStatus(operationItemId, stage, rejectionPlan.finalStage);
                updateDocumentItemStatus(operationItemId, rejectionPlan.finalStage);
                const currentItem = activeDocumentItemRef.current;
                if (String(currentItem?.id || '') === operationItemId) {
                    setActiveDocumentItem({ ...currentItem, status: rejectionPlan.finalStage });
                    clearPostEditOutputs(operationItemId);
                    setOperationStage(rejectionPlan.finalStage);
                }
                setIsRunning(false);
                return;
            }
            if (stage === 'QA_REVIEW') {
                await rejectQualityAssureAction(operationItemId);
                syncLocalStatus(operationItemId, 'QA');
                clearQAOutputs(operationItemId);
                await recordRollbackAfterStatus(operationItemId, stage, 'QA');
                setOperationStage('QA');
                setIsRunning(false);
                return;
            }
            switch (stage) {
                case 'MT_REVIEW':
                    await undoTranslate();
                    break;
            }
            let rollbackFromStage: TranslationStage = stage;
            for (const nextStage of rejectionPlan.statusUpdates) {
                await syncStatusUpdate(operationItemId, nextStage);
                await recordRollbackAfterStatus(operationItemId, rollbackFromStage, nextStage);
                rollbackFromStage = nextStage;
            }
            setTimeout(() => {
                setOperationStage(rejectionPlan.finalStage);
                setIsRunning(false);
            }, 360);
        } catch (error) {
            logger.error('Rollback operation failed:', error);
            toast.error(t('toasts.operationFailed'), {
                description: t('toasts.operationFailedDescription'),
            });
            setIsRunning(false);
        }
    }

    const onAccept = async (stage: TranslationStage) => {
        if (!contentReady) {
            toast.info(t('toasts.contentLoading'));
            return;
        }
        const operationItemId = String(activeDocumentItem.id || '');
        if (!operationItemId) return;
        const setOperationStage = (nextStage: TranslationStage) => {
            if (String(activeDocumentItemRef.current?.id || '') === String(operationItemId)) {
                setCurrentStage(nextStage);
            }
        };
        let signoffPersisted = false;
        setIsRunning(true);
        try {
            if (stage === 'POST_EDIT') {
                if (contentItemIdRef.current !== operationItemId) {
                    throw new Error('当前译文仍在加载，请完成加载后再提交译后复核');
                }
                const persisted = await getContentByIdAction(operationItemId);
                if (String(persisted?.targetText || '') !== String(targetTextRef.current || '')) {
                    throw new Error('译文存在未保存修改，请先点击编辑器保存后再提交译后复核');
                }
            }
            switch (stage) {
                case 'NOT_STARTED': {
                    // Claim the executable MT stage before calling the model.
                    // Do not use the generic status action here: it permits a
                    // repeated MT write, which lets stale tabs run in parallel.
                    const currentSourceText = getVisibleSourceDraft(operationItemId);
                    const savedSourceText = String(persistedSourceTextRef.current || '');
                    // React needs a render to apply `readOnly`; lock the live
                    // editor before awaiting the claim so no keystroke can
                    // diverge from the source snapshot being started.
                    lockVisibleSourceEditor(operationItemId);
                    const claimed = await startPreTranslationAction(
                        operationItemId,
                        savedSourceText,
                        currentSourceText
                    );
                    const claimedSourceText = String(
                        (claimed as any)?.sourceText ?? currentSourceText
                    );
                    const preTranslateRunId = String(
                        (claimed as any)?.preTranslateRunId || ''
                    ).trim();
                    if (!preTranslateRunId) {
                        throw new Error('预翻译运行标识缺失，请刷新后重试');
                    }
                    if (
                        contentItemIdRef.current === operationItemId &&
                        String(activeDocumentItemRef.current?.id || '') === operationItemId
                    ) {
                        sourceTextRef.current = claimedSourceText;
                        persistedSourceTextRef.current = claimedSourceText;
                        setSourceTranslationText(claimedSourceText);
                        setPersistedSourceTranslationText(claimedSourceText);
                        try {
                            const editor = getSourceEditorInstance();
                            if (
                                editor?.view.dom.getAttribute('data-deeptrans-editor-item-id') ===
                                    operationItemId &&
                                editor.view.dom.getAttribute('data-deeptrans-editor-job') ===
                                    'rawtext' &&
                                editor.getHTML() === claimedSourceText
                            ) {
                                editor.view.dom.setAttribute('data-deeptrans-editor-dirty', 'false');
                            }
                        } catch {}
                    }
                    syncLocalStatus(operationItemId, 'MT');
                    setOperationStage('MT');
                    toast.info(t('toasts.preTranslationStarted'), {
                        description: t('toasts.autoProcessInfo'),
                        duration: 4000,
                    });
                    await runTranslate({
                        expectedSourceText: claimedSourceText,
                        expectedTargetText: String((claimed as any)?.targetText || ''),
                        preTranslateRunId,
                    });

                    // runTranslate owns model execution, its durable result,
                    // and MT audit events. Only this server guard may promote
                    // that result to MT_REVIEW after checking its freshness.
                    await completePreTranslationAction(operationItemId, preTranslateRunId);
                    syncLocalStatus(operationItemId, 'MT_REVIEW');
                    setOperationStage('MT_REVIEW');
                    await saveRecord('MT_REVIEW', 'USER', 'STARTED');
                    break;
                }

                case 'MT_REVIEW': {
                    // Strictly claim QA before invoking its model. The generic
                    // stage action permits QA -> QA, which would otherwise let
                    // a stale second tab spend another model call.
                    const claimed = await startQualityAssureAction(
                        operationItemId,
                        String(sourceText || ''),
                        String(targetText || '')
                    );
                    const qaRunId = String((claimed as any)?.qaRunId || '').trim();
                    if (!qaRunId) {
                        throw new Error('质检运行标识缺失，请刷新后重试');
                    }
                    syncLocalStatus(operationItemId, 'QA');
                    // The durable MT_REVIEW -> QA claim proves the human
                    // review has been accepted. Record that completion only
                    // after the server transition, never on entering review.
                    await saveRecord('MT_REVIEW', 'USER', 'SUCCESS');
                    setOperationStage('QA');
                    toast.info(t('toasts.qaStarted'), {
                        description: t('toasts.autoProcessInfo'),
                        duration: 4000,
                    });
                    await runQA({
                        expectedSourceText: String((claimed as any)?.sourceText || ''),
                        expectedTargetText: String((claimed as any)?.targetText || ''),
                        qaRunId,
                    });
                    await completeQualityAssureAction(operationItemId, qaRunId);
                    syncLocalStatus(operationItemId, 'QA_REVIEW');
                    setOperationStage('QA_REVIEW');
                    await saveRecord('QA_REVIEW', 'USER', 'STARTED');
                    break;
                }
                case 'QA_REVIEW': {
                    await syncStatusUpdate(operationItemId, 'POST_EDIT');
                    // A later automatic stage is only allowed after the human
                    // QA review has accepted its findings.
                    await saveRecord('QA_REVIEW', 'USER', 'SUCCESS');
                    setOperationStage('POST_EDIT');
                    toast.info(t('toasts.postEditStarted'));
                    await runPostEdit();
                    break;
                }
                case 'POST_EDIT': {
                    // Persist the guarded review state before its audit event;
                    // on an audit write failure, restore the prior state so the
                    // timeline and document status cannot disagree.
                    await syncStatusUpdate(operationItemId, 'POST_EDIT_REVIEW');
                    // The target was read-only before this transition. Record
                    // the server-confirmed version as the CAS base that a
                    // later editable draft must still match before sign-off.
                    const reviewContent = await getContentByIdAction(operationItemId);
                    if (
                        contentItemIdRef.current === operationItemId &&
                        String(activeDocumentItemRef.current?.id || '') === operationItemId
                    ) {
                        const confirmedTarget = String(reviewContent?.targetText || '');
                        setTargetTranslationText(confirmedTarget);
                        setPersistedTargetTranslationText(confirmedTarget);
                    }
                    try {
                        await saveRecord('POST_EDIT_REVIEW', 'USER', 'STARTED');
                    } catch (error) {
                        await syncStatusUpdate(operationItemId, 'POST_EDIT');
                        throw error;
                    }
                    setOperationStage('POST_EDIT_REVIEW');
                    break;
                }
                case 'POST_EDIT_REVIEW': {
                    if (contentItemIdRef.current !== operationItemId) {
                        throw new Error('当前分段已切换，未保存也未签发。请返回该分段后重新检查。');
                    }
                    let liveEditorTargetText: string | undefined;
                    try {
                        const targetEditor = getTargetEditorInstance();
                        if (
                            targetEditor?.view.dom.getAttribute('data-deeptrans-editor-item-id') ===
                                operationItemId &&
                            targetEditor.view.dom.getAttribute('data-deeptrans-editor-job') ===
                                'translation' &&
                            targetEditor.view.dom.getAttribute('data-deeptrans-editor-dirty') ===
                                'true'
                        ) {
                            liveEditorTargetText = targetEditor.getHTML();
                        }
                    } catch {}
                    const draft = resolvePostEditReviewDraft({
                        liveEditorTargetText,
                        fallbackTargetText: targetTextRef.current,
                        persistedTargetText: persistedTargetTextRef.current,
                    });
                    const signedOff = await signOffPostEditReviewAction(operationItemId, {
                        expectedSourceText: String(sourceTextRef.current || ''),
                        expectedTargetText: draft.expectedTargetText,
                        targetText: draft.targetText,
                    });
                    signoffPersisted = true;
                    // The atomic action has already changed the server state.
                    // Only mirror its draft into Redux while this remains the
                    // visible segment; a late response must not modify a newly
                    // selected item.
                    if (
                        contentItemIdRef.current === operationItemId &&
                        String(activeDocumentItemRef.current?.id || '') === operationItemId
                    ) {
                        const confirmedTarget = String(signedOff.targetText || '');
                        setTargetTranslationText(confirmedTarget);
                        setPersistedTargetTranslationText(confirmedTarget);
                    }
                    syncLocalStatus(operationItemId, 'SIGN_OFF');
                    try {
                        await saveRecord('POST_EDIT_REVIEW', 'USER', 'SUCCESS');
                        await saveRecord('SIGN_OFF', 'USER', 'SUCCESS');
                    } catch (error) {
                        try {
                            await syncStatusUpdate(operationItemId, 'POST_EDIT_REVIEW');
                            signoffPersisted = false;
                        } catch {
                            throw new Error(
                                '译文已安全保存并签发，但审计记录未保存。请刷新后确认当前签发状态。'
                            );
                        }
                        throw error;
                    }
                    setOperationStage('SIGN_OFF');
                    break;
                }

                case 'SIGN_OFF':
                    await syncStatusUpdate(operationItemId, 'COMPLETED');
                    try {
                        await saveRecord('COMPLETED', 'USER', 'SUCCESS');
                    } catch (error) {
                        await syncStatusUpdate(operationItemId, 'SIGN_OFF');
                        throw error;
                    }
                    setOperationStage('COMPLETED');
                    toast.success(t('toasts.projectCompleted'), {
                        description: t('toasts.readyForDelivery'),
                    });
                    break;

                case 'ERROR':
                case 'CANCELED':
                    await syncStatusUpdate(operationItemId, 'NOT_STARTED');
                    setOperationStage('NOT_STARTED');
                    toast.info('分段已恢复为待开始，可以重新运行预翻译');
                    break;

                default:
                    const nextIdx = Math.min(steps.length - 1, steps.indexOf(stage) + 1);
                    setOperationStage(steps[nextIdx] as TranslationStage);
                    await saveRecord(steps[nextIdx] as TranslationStage, 'USER', 'SUCCESS');
                    break;
            }
            setIsRunning(false);
        } catch (error) {
            logger.error('Operation failed:', error);
            const rollbackStage = getAcceptFailureRollbackStage(stage);
            if (stage === 'POST_EDIT_REVIEW' && signoffPersisted) {
                // The CAS sign-off reached the server but its audit rollback
                // could not be proven. Keep the visible stage honest rather
                // than showing a retryable review state that could overwrite
                // the now-signed-off translation.
                setOperationStage('SIGN_OFF');
            } else if (stage === 'NOT_STARTED' || stage === 'MT_REVIEW') {
                // A strict claim either failed before local state changed, or
                // succeeded and the server now owns the executable stage. In
                // both cases, a compensating status write could undo another
                // tab's claim or a valid in-flight result.
            } else if (rollbackStage) {
                try {
                    await syncStatusUpdate(operationItemId, rollbackStage);
                } catch {}
                setOperationStage(rollbackStage);
            } else {
                // Some human-review actions record the audit event before the
                // status transition. If that event cannot be persisted, restore
                // the visual stage instead of leaving a false local success.
                setOperationStage(stage);
            }
            const preTranslationFailure =
                stage === 'NOT_STARTED' ? resolvePreTranslationStartFailure(error) : null;
            toast.error(preTranslationFailure || t('toasts.operationFailed'), {
                description: preTranslationFailure
                    ? undefined
                    : t('toasts.operationFailedDescription'),
            });
            setIsRunning(false);
        }
    };

    useEffect(() => {
        if (activeDocumentItem.id && !isRunning) {
            setCurrentStage(activeDocumentItem.status as TranslationStage);
        }
    }, [activeDocumentItem.id, activeDocumentItem.status, isRunning]);

    const renderVisualStepper = () => {
        const currentRealStepIdx = steps.indexOf(currentStage as TranslationStage);

        return steps.map((stage, index) => {
            const stageIdx = steps.indexOf(stage);
            const isActive = stage === currentStage;
            const isDone = currentRealStepIdx > stageIdx;
            const isReview = TRANSLATION_REVIEW_STAGES.includes(stage as any);
            const label = getTranslationStageLabel(stage, tStage);
            const badgeClass =
                isActive || isDone
                    ? getTranslationStageBadgeClass(stage)
                    : 'px-2 py-[2px] rounded-full whitespace-nowrap border text-[10px] transition-all duration-200 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70';
            const activeRing = isActive
                ? isReview
                    ? ' ring-2 ring-inset ring-orange-200 dark:ring-orange-100'
                    : ' ring-2 ring-inset ring-indigo-200 dark:ring-indigo-100'
                : '';

            return (
                <li key={stage} className="flex items-center">
                    <div className={`${badgeClass} relative flex items-center gap-1${activeRing}`}>
                        {isRunning && isActive && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin opacity-90" />
                        )}
                        <span aria-current={isActive ? 'step' : undefined}>{label}</span>
                    </div>
                    {index < steps.length - 1 && (
                        <ChevronRight className="mx-1 h-3 w-3 text-foreground/40" />
                    )}
                </li>
            );
        });
    };

    return (
        <div
            className={`min-h-12 w-full border-b bg-background px-2 text-xs ${className ?? ''}`}
            data-current-stage={currentStage}
        >
            <div className="flex min-h-12 w-full items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
                        <FileText className="size-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                {currentSegmentLabel}
                            </span>
                            <span
                                className="truncate font-medium text-foreground"
                                title={currentSegmentName}
                            >
                                {currentSegmentName}
                            </span>
                        </div>
                        <div
                            id={stageStatusId}
                            className="mt-0.5 flex min-w-0 items-center gap-1.5"
                            role="status"
                            aria-live="polite"
                            aria-busy={!contentReady}
                        >
                            <span
                                className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${stageToneClass}`}
                            >
                                {tGuidance('currentStage', { stage: currentStageLabel })}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                                {contentReady
                                    ? tGuidance(`instructions.${currentStageGuidance.instruction}`)
                                    : tGuidance('loadingSegment')}
                            </span>
                        </div>
                    </div>
                </div>

                <ol
                    className="no-scrollbar hidden min-w-0 items-center overflow-x-auto 2xl:flex"
                    aria-label={tGuidance('workflowProgress')}
                >
                    {renderVisualStepper()}
                </ol>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <TranslationGuideButton />
                    {getStageWorkbenchWorkflowKey(currentStage) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 rounded-sm px-2 text-muted-foreground hover:text-foreground"
                            onClick={onOpenWorkflow}
                            aria-label={tGuidance('workflowPrompt')}
                        >
                            <Workflow className="h-3.5 w-3.5" />
                            <span>{tGuidance('workflowPrompt')}</span>
                        </Button>
                    )}
                    {currentStage !== 'NOT_STARTED' &&
                        currentStage !== 'COMPLETED' &&
                        currentStage !== 'ERROR' &&
                        currentStage !== 'CANCELED' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 rounded-sm text-muted-foreground hover:text-foreground"
                                onClick={() => onReject(currentStage)}
                                disabled={shouldDisableButtons()}
                                aria-describedby={stageStatusId}
                            >
                                <Undo2 className="h-3 w-3" />
                                <span className="hidden sm:inline">{rejectText}</span>
                            </Button>
                        )}

                    {!shouldHideAcceptButton(currentStage) && currentStage !== 'COMPLETED' && (
                        <Button
                            variant="default"
                            size="sm"
                            className="h-7 gap-1 rounded-sm px-4 shadow-sm"
                            onClick={() => onAccept(currentStage)}
                            disabled={shouldDisableButtons()}
                            aria-describedby={stageStatusId}
                        >
                            {currentStage === 'NOT_STARTED' ? (
                                <Play className="h-3 w-3 fill-current" />
                            ) : (
                                <Check className="h-3 w-3" />
                            )}
                            <span className="font-medium">{getAcceptButtonText(currentStage)}</span>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StageBadgeBar;
