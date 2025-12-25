'use client';

import { updateDocItemStatusAction } from '@/actions/document-item';
import { Button } from '@/components/ui/button';
import {
    TRANSLATION_STAGES_SEQUENCE,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useRunningState } from '@/hooks/useRunning';
import { useTranslationState } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import type { TranslationStage } from '@/store/features/translationSlice';
import { Check, ChevronRight, Loader2, RotateCcw, SkipForward, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect } from 'react';
const logger = createLogger({
    type: 'ide:stage-badge',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export type StageBadgeBarProps = {
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
    const steps: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
    const acceptText = t('actions.approve');
    const rejectText = t('actions.reject');
    const currentStageLabel = label || t('currentStage');
    const redoText = t('redo');
    const signOffText = t('signOff');

    // 在组件中添加一个辅助函数来判断是否应该禁用按钮
    const shouldDisableButtons = (): boolean => {
        return isRunning || !activeDocumentItem.id;
    };

    // 辅助函数：同步状态更新
    const syncStatusUpdate = async (itemId: string, status: string) => {
        try {
            // 1. 更新数据库
            await updateDocItemStatusAction(itemId, status as TranslationStage);
            // 2. 同步 Explorer 状态
            updateDocumentItemStatus(itemId, status);
            // 3. 同步当前激活文档项状态
            if (activeDocumentItem.id === itemId) {
                setActiveDocumentItem({ ...activeDocumentItem, status });
            }
        } catch (error) {
            logger.error('Status sync failed:', error);
            throw error;
        }
    };

    function onRedo(stage: TranslationStage) {
        setIsRunning(true);
        setTimeout(() => {
            setIsRunning(false);
        }, 5000);
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
                    void undoTranslate();
                    await syncStatusUpdate(activeDocumentItem.id, 'MT');
                    break;
                case 'QA_REVIEW':
                    void undoQA();
                    await syncStatusUpdate(activeDocumentItem.id, 'QA');
                    break;
                case 'POST_EDIT_REVIEW':
                    void undoPostEdit();
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT');
                    break;
                case 'SIGN_OFF':
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT_REVIEW');
                    break;
                case 'COMPLETED':
                    await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');
                    break;
                default:
                    // 对于其他阶段（MT, QA, POST_EDIT），使用backMap
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
        setIsRunning(true);

        try {
            switch (stage) {
                case 'NOT_STARTED':
                    setCurrentStage('MT');
                    await syncStatusUpdate(activeDocumentItem.id, 'MT');
                    await runTranslate();
                    // MT 步骤的记录已在 runTranslate 内部处理
                    break;

                case 'MT':
                    // 根据 backMap，MT 应该前进到 MT_REVIEW
                    setCurrentStage('MT_REVIEW');
                    await syncStatusUpdate(activeDocumentItem.id, 'MT_REVIEW');
                    await saveRecord('MT_REVIEW', 'HUMAN', 'SUCCESS');
                    break;

                case 'MT_REVIEW':
                    setCurrentStage('QA');
                    await syncStatusUpdate(activeDocumentItem.id, 'QA');
                    await runQA(); // 触发QA处理流程
                    // QA 步骤的记录已在 runQA 内部处理
                    break;

                case 'QA':
                    // 根据 backMap，QA 应该前进到 QA_REVIEW
                    setCurrentStage('QA_REVIEW');
                    await syncStatusUpdate(activeDocumentItem.id, 'QA_REVIEW');
                    await saveRecord('QA_REVIEW', 'HUMAN', 'SUCCESS');
                    break;

                case 'QA_REVIEW':
                    setCurrentStage('POST_EDIT');
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT');
                    await runPostEdit(); // 自动运行译后编辑
                    // POST_EDIT 步骤的记录已在 runPostEdit 内部处理
                    break;

                case 'POST_EDIT':
                    // 根据 backMap，POST_EDIT 应该前进到 POST_EDIT_REVIEW
                    setCurrentStage('POST_EDIT_REVIEW');
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT_REVIEW');
                    await saveRecord('POST_EDIT_REVIEW', 'HUMAN', 'SUCCESS');
                    break;

                case 'POST_EDIT_REVIEW':
                    // 推进到SIGN_OFF
                    setCurrentStage('SIGN_OFF');
                    await saveRecord('SIGN_OFF', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');

                    // 最后推进到COMPLETED
                    setCurrentStage('COMPLETED');
                    await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
                    break;

                case 'SIGN_OFF':
                    setCurrentStage('COMPLETED');
                    await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
                    break;

                default:
                    // 其他情况默认处理
                    const nextIdx = Math.min(steps.length - 1, steps.indexOf(stage) + 1);
                    setCurrentStage(steps[nextIdx] as TranslationStage);
                    await saveRecord(steps[nextIdx] as TranslationStage, 'HUMAN', 'SUCCESS');
                    break;
            }

            setIsRunning(false);
        } catch (error) {
            logger.error('当前阶段无法执行接受操作:', error);
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
        logger.info(`当前处理步骤:${currentStage}`);
        // 只在activeDocumentItem.id变化时才设置状态，避免覆盖正在进行的状态变化
        if (activeDocumentItem.id && !isRunning) {
            setCurrentStage(activeDocumentItem.status as TranslationStage);
        }
    }, [activeDocumentItem.id]);

    return (
        <div className={`h-8 w-full bg-background pl-2 pr-1 text-xs ${className ?? ''}`}>
            <div className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                    {label}
                </span>
                <div className="flex items-center gap-1 px-2 py-1">
                    {(() => {
                        const idx = Math.max(0, steps.indexOf(currentStage as TranslationStage));
                        const base =
                            'px-2 py-[2px] rounded-full whitespace-nowrap border transition-all duration-200';
                        return (
                            <>
                                {steps.map((step, i) => {
                                    const isCur = i === idx;
                                    const isDone = i < idx;
                                    //const isHuman = step === 'MT_REVIEW' || step === 'QA_REVIEW' || step === 'POST_EDIT_REVIEW' || step === 'SIGN_OFF';
                                    //禁用人工作业阶段黄色高亮，全部使用机器翻译风格，避免不必要的视觉冲突与歧义
                                    const isHuman = false;
                                    const isCompleted = step === 'COMPLETED';
                                    let cls = `${base} bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70`;
                                    if (isDone)
                                        cls = `${base} ${isHuman ? 'bg-amber-500 border-amber-600' : 'bg-indigo-500 border-indigo-600'} text-white shadow`;
                                    if (isCur) {
                                        if (isCompleted)
                                            cls = `${base} bg-green-600 border-green-700 text-white shadow ring-2 ring-green-400/40`;
                                        else
                                            cls = `${base} ${isHuman ? 'bg-amber-500 border-amber-600' : 'bg-indigo-600 border-indigo-700'} text-white shadow ring-2 ${isHuman ? 'ring-amber-400/40' : 'ring-indigo-400/40'}`;
                                    }
                                    const label = getTranslationStageLabel(step, tStage);
                                    return (
                                        <div key={step} className="flex items-center">
                                            <span className={cls}>
                                                {isRunning && isCur && (
                                                    <Loader2 className="ml-1 inline-block h-3 w-3 animate-spin align-[-2px] opacity-90" />
                                                )}
                                                {label}
                                            </span>
                                            {i < steps.length - 1 && (
                                                <ChevronRight className="mx-1 h-3 w-3 text-foreground/40" />
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        );
                    })()}
                    {currentStage === 'ERROR' && (
                        <span className="whitespace-nowrap rounded-full border border-red-700 bg-red-600 px-2 py-[2px] text-white shadow">
                            {tIDE('statusProgress.error')}
                        </span>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {(currentStage === 'MT_REVIEW' ||
                        currentStage === 'QA_REVIEW' ||
                        currentStage === 'POST_EDIT') && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 rounded-none"
                                onClick={() => onRedo(currentStage)}
                                disabled={shouldDisableButtons()}
                            >
                                <RotateCcw className="h-3 w-3" />
                                <span className="hidden sm:inline">{redoText}</span>
                            </Button>
                        )}
                    {currentStage !== 'NOT_STARTED' && currentStage !== 'COMPLETED' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 rounded-none"
                            onClick={() => onReject(currentStage)}
                            disabled={shouldDisableButtons()}
                        >
                            <Undo2 className="h-3 w-3" />
                            <span className="hidden sm:inline">{rejectText}</span>
                        </Button>
                    )}
                    {currentStage !== 'COMPLETED' && (
                        <Button
                            variant="default"
                            size="sm"
                            className="h-6 gap-1 rounded-none"
                            onClick={() => onAccept(currentStage)}
                            disabled={shouldDisableButtons()}
                        >
                            <Check className="h-3 w-3" />
                            <span className="hidden sm:inline">{acceptText}</span>
                        </Button>
                    )}
                    {currentStage !== 'COMPLETED' && currentStage !== 'NOT_STARTED' && (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 gap-1 rounded-none"
                            onClick={() => onDone(currentStage)}
                            disabled={shouldDisableButtons()}
                        >
                            <SkipForward className="h-3 w-3" />
                            <span className="hidden sm:inline">{signOffText}</span>
                        </Button>
                    )}
                </div>
            </div>
            {/* 仅保留 7 阶段工作流徽标作为主显示 */}
        </div>
    );
};

export default StageBadgeBar;
