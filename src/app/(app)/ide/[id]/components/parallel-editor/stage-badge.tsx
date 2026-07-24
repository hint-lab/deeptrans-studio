'use client';

import { updateDocItemStatusAction } from '@/actions/document-item';
import { Button } from '@/components/ui/button';
import {
    TRANSLATION_REVIEW_STAGES,
    TRANSLATION_STAGES_SEQUENCE,
    getTranslationStageBadgeClass,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useRunningState } from '@/hooks/useRunning';
import { useTranslationState } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import type { TranslationStage } from '@/store/features/translationSlice';
import { Check, ChevronRight, Loader2, Play, RotateCcw, SkipForward, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';

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
    runTranslate: () => Promise<void>;
    undoTranslate: () => Promise<void>;
    runQA: () => Promise<void>;
    undoQA: () => Promise<void>;
    runPostEdit: () => Promise<void>;
    undoPostEdit: () => Promise<void>;
    saveRecord: (stage: TranslationStage, actorType: string, status: string) => Promise<void>;
    deleteRecord: (stage: TranslationStage) => Promise<void>;
    className?: string;
    label?: string;
};

const StageBadgeBar: React.FC<StageBadgeBarProps> = ({
    className,
    contentReady,
    runTranslate,
    undoTranslate,
    runQA,
    undoQA,
    runPostEdit,
    undoPostEdit,
    saveRecord,
    label,
}) => {
    const t = useTranslations('IDE.parallelEditor');
    const tIDE = useTranslations('IDE');
    const tStage = useTranslations('IDE.translationStages');
    const { isRunning, setIsRunning } = useRunningState();
    const { currentStage, setCurrentStage } = useTranslationState();
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const { updateDocumentItemStatus } = useExplorerTabs();
    const activeDocumentItemRef = useRef(activeDocumentItem);
    activeDocumentItemRef.current = activeDocumentItem;

    const steps: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
    const redoText = t('redo');
    const rejectText = t('actions.reject');
    const signOffText = t('signOff');

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

    const syncStatusUpdate = async (itemId: string, status: string) => {
        try {
            await updateDocItemStatusAction(itemId, status as TranslationStage);
            updateDocumentItemStatus(itemId, status);
            const currentItem = activeDocumentItemRef.current;
            if (String(currentItem?.id || '') === String(itemId)) {
                setActiveDocumentItem({ ...currentItem, status });
            }
        } catch (error) {
            logger.error('Status sync failed:', error);
            throw error;
        }
    };

    function onRedo(stage: TranslationStage) {
        setIsRunning(true);
        setTimeout(() => setIsRunning(false), 3000);
    }

    async function onReject(stage: TranslationStage) {
        setIsRunning(true);
        const backMap: Record<string, TranslationStage> = {
            MT: 'NOT_STARTED',
            MT_REVIEW: 'MT',
            QA: 'MT_REVIEW',
            QA_REVIEW: 'QA',
            POST_EDIT: 'QA_REVIEW',
            POST_EDIT_REVIEW: 'POST_EDIT',
            SIGN_OFF: 'POST_EDIT_REVIEW',
            COMPLETED: 'SIGN_OFF',
        };
        const prevStage = backMap[stage];

        try {
            switch (stage) {
                case 'MT_REVIEW':
                    await undoTranslate();
                    await syncStatusUpdate(activeDocumentItem.id, 'MT');
                    break;
                case 'QA_REVIEW':
                    await undoQA();
                    await syncStatusUpdate(activeDocumentItem.id, 'QA');
                    break;
                case 'POST_EDIT_REVIEW':
                    await undoPostEdit();
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT');
                    break;
                case 'SIGN_OFF':
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT_REVIEW');
                    break;
                case 'COMPLETED':
                    await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');
                    break;
                default:
                    await syncStatusUpdate(activeDocumentItem.id, prevStage || 'NOT_STARTED');
                    break;
            }
            setTimeout(() => {
                if (prevStage) setCurrentStage(prevStage);
                setIsRunning(false);
            }, 360);
        } catch (error) {
            logger.error('Rollback operation failed:', error);
            setIsRunning(false);
        }
    }

    const onAccept = async (stage: TranslationStage) => {
        if (!contentReady) {
            toast.info(t('toasts.contentLoading'));
            return;
        }
        const operationItemId = activeDocumentItem.id;
        const setOperationStage = (nextStage: TranslationStage) => {
            if (String(activeDocumentItemRef.current?.id || '') === String(operationItemId)) {
                setCurrentStage(nextStage);
            }
        };
        setIsRunning(true);
        try {
            switch (stage) {
                case 'NOT_STARTED':
                    setOperationStage('MT');
                    await syncStatusUpdate(operationItemId, 'MT');
                    toast.info(t('toasts.preTranslationStarted'), {
                        description: t('toasts.autoProcessInfo'),
                        duration: 4000,
                    });
                    await runTranslate();
                    // 3. 【新增】任务完成后，自动推进到 MT_REVIEW
                    // 只有当 runTranslate 没有抛出错误时才会执行到这里
                    setOperationStage('MT_REVIEW');
                    await syncStatusUpdate(operationItemId, 'MT_REVIEW');
                    await saveRecord('MT_REVIEW', 'HUMAN', 'SUCCESS'); // 记录 MT 阶段完成（或进入 Review）
                    break;

                case 'MT_REVIEW':
                    setOperationStage('QA');
                    await syncStatusUpdate(operationItemId, 'QA');
                    toast.info(t('toasts.qaStarted'), {
                        description: t('toasts.autoProcessInfo'),
                        duration: 4000,
                    });
                    await runQA();
                    // 3. 【新增】任务完成后，自动推进到 QA_REVIEW
                    setOperationStage('QA_REVIEW');
                    await syncStatusUpdate(operationItemId, 'QA_REVIEW');
                    await saveRecord('QA_REVIEW', 'HUMAN', 'STARTED');
                    break;
                case 'QA_REVIEW':
                    setOperationStage('POST_EDIT');
                    await syncStatusUpdate(operationItemId, 'POST_EDIT');
                    toast.info(t('toasts.postEditStarted'));
                    await runPostEdit();
                    break;
                case 'POST_EDIT':
                    // 人工点击下一步 -> 进入复核
                    setOperationStage('POST_EDIT_REVIEW');
                    await saveRecord('POST_EDIT_REVIEW', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(operationItemId, 'POST_EDIT_REVIEW');
                    break;
                case 'POST_EDIT_REVIEW':
                    setOperationStage('SIGN_OFF');
                    await saveRecord('SIGN_OFF', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(operationItemId, 'SIGN_OFF');
                    break;

                case 'SIGN_OFF':
                    setOperationStage('COMPLETED');
                    await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(operationItemId, 'COMPLETED');
                    toast.success(t('toasts.projectCompleted'), {
                        description: t('toasts.readyForDelivery'),
                    });
                    break;

                default:
                    const nextIdx = Math.min(steps.length - 1, steps.indexOf(stage) + 1);
                    setOperationStage(steps[nextIdx] as TranslationStage);
                    await saveRecord(steps[nextIdx] as TranslationStage, 'HUMAN', 'SUCCESS');
                    break;
            }
            setIsRunning(false);
        } catch (error) {
            logger.error('Operation failed:', error);
            const rollbackStage =
                stage === 'NOT_STARTED'
                    ? 'NOT_STARTED'
                    : stage === 'MT_REVIEW'
                      ? 'MT_REVIEW'
                      : stage === 'QA_REVIEW'
                        ? 'QA_REVIEW'
                        : undefined;
            if (rollbackStage) {
                try {
                    await syncStatusUpdate(operationItemId, rollbackStage);
                } catch {}
                setOperationStage(rollbackStage);
            }
            toast.error(t('toasts.operationFailed'), { description: String(error) });
            setIsRunning(false);
        }
    };

    const onDone = async (stage: TranslationStage) => {
        setCurrentStage('COMPLETED');
        await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
        await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
        setIsRunning(false);
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
                    ? ' ring-2 ring-orange-400/35'
                    : ' ring-2 ring-indigo-400/35'
                : '';

            return (
                <div key={stage} className="flex items-center">
                    <div className={`${badgeClass} relative flex items-center gap-1${activeRing}`}>
                        {isRunning && isActive && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin opacity-90" />
                        )}
                        <span>{label}</span>
                    </div>
                    {index < steps.length - 1 && (
                        <ChevronRight className="mx-1 h-3 w-3 text-foreground/40" />
                    )}
                </div>
            );
        });
    };

    return (
        <div className={`h-10 w-full bg-background pl-2 pr-1 text-xs ${className ?? ''}`}>
            <div className="flex h-full w-full items-center justify-between gap-2">
                <div className="no-scrollbar flex min-w-0 items-center overflow-x-auto">
                    {renderVisualStepper()}

                    {currentStage === 'ERROR' && (
                        <span className="ml-2 whitespace-nowrap rounded-full border border-red-700 bg-red-600 px-2 py-[2px] text-white shadow">
                            {tIDE('statusProgress.error')}
                        </span>
                    )}
                </div>

                {/* 右侧：操作按钮 */}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {(currentStage.includes('REVIEW') || currentStage === 'POST_EDIT') && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 rounded-sm border-dashed"
                            onClick={() => onRedo(currentStage)}
                            disabled={shouldDisableButtons()}
                        >
                            <RotateCcw className="h-3 w-3" />
                            <span className="hidden sm:inline">{redoText}</span>
                        </Button>
                    )}

                    {currentStage !== 'NOT_STARTED' && currentStage !== 'COMPLETED' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 rounded-sm text-muted-foreground hover:text-foreground"
                            onClick={() => onReject(currentStage)}
                            disabled={shouldDisableButtons()}
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
                        >
                            {currentStage === 'NOT_STARTED' ? (
                                <Play className="h-3 w-3 fill-current" />
                            ) : (
                                <Check className="h-3 w-3" />
                            )}
                            <span className="font-medium">{getAcceptButtonText(currentStage)}</span>
                        </Button>
                    )}
                    {currentStage !== 'COMPLETED' && currentStage !== 'NOT_STARTED' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-full p-0 hover:bg-secondary"
                            onClick={() => onDone(currentStage)}
                            disabled={shouldDisableButtons()}
                            title={signOffText}
                        >
                            <SkipForward className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StageBadgeBar;
