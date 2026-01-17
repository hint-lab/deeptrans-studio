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
import { Check, ChevronRight, Loader2, Play, RotateCcw, SkipForward, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

const logger = createLogger({
    type: 'ide:stage-badge',
}, {
    json: false,
    pretty: false,
    colors: true,
    includeCaller: false,
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

// --- 核心配置：定义视觉上的节点结构 ---
// stages: 包含的真实状态
// isGroup: 是否为合并显示模式（显示子状态微标）
// labelKey: 对应的 i18n key（如果是 Group）
const VISUAL_FLOW_CONFIG = [
    {
        id: 'PRE_TRANS_GROUP',
        stages: ['MT', 'MT_REVIEW'],
        isGroup: true,
        labelKey: 'groups.preTranslation', // 对应 "预翻译阶段"
    },
    {
        id: 'QA_GROUP',
        stages: ['QA', 'QA_REVIEW'],
        isGroup: true,
        labelKey: 'groups.qaProcess', // 对应 "质量检查"
    },
    {
        id: 'PE_STEP',
        stages: ['POST_EDIT'],
        isGroup: false,
    },
    {
        id: 'PE_REVIEW_STEP',
        stages: ['POST_EDIT_REVIEW'],
        isGroup: false,
    },
    {
        id: 'SIGN_OFF_STEP',
        stages: ['SIGN_OFF'],
        isGroup: false,
    },
    {
        id: 'COMPLETED_STEP',
        stages: ['COMPLETED'],
        isGroup: false,
    }
];

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
    const redoText = t('redo');
    const rejectText = t('actions.reject');
    const signOffText = t('signOff');

    // 按钮文案逻辑
    const getAcceptButtonText = (stage: TranslationStage) => {
        switch (stage) {
            case 'NOT_STARTED': return t('actions.startPreTranslation');
            case 'MT_REVIEW': return t('actions.submitToQA');
            case 'QA_REVIEW': return t('actions.submitToPostEdit'); // "提交至译后编辑"
            // 注意：这里 PE 和 PE Review 现在是分开的，所以文案要准确
            case 'POST_EDIT_REVIEW': return t('actions.approveSignOff');
            case 'SIGN_OFF': return t('actions.completeProject');
            default: return t('actions.approve');
        }
    };

    // MT QA阶段各包含两个子过程：分别为：MT、MT_REVIEW和QA、QA_REVIEW。隐藏“下一步”按钮（自动化运行中）
    const shouldHideAcceptButton = (stage: TranslationStage) => {
        return ['MT', 'QA'].includes(stage);
    };

    const shouldDisableButtons = (): boolean => {
        return isRunning || !activeDocumentItem.id;
    };

    const syncStatusUpdate = async (itemId: string, status: string) => {
        try {
            await updateDocItemStatusAction(itemId, status as TranslationStage);
            updateDocumentItemStatus(itemId, status);
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
                    toast.info(t('toasts.preTranslationStarted'), { description: t('toasts.autoProcessInfo'), duration: 4000 });
                    await runTranslate();
                    // 3. 【新增】任务完成后，自动推进到 MT_REVIEW
                    // 只有当 runTranslate 没有抛出错误时才会执行到这里
                    setCurrentStage('MT_REVIEW');
                    await syncStatusUpdate(activeDocumentItem.id, 'MT_REVIEW');
                    await saveRecord('MT_REVIEW', 'HUMAN', 'SUCCESS'); // 记录 MT 阶段完成（或进入 Review）
                    break;

                case 'MT_REVIEW':
                    setCurrentStage('QA');
                    await syncStatusUpdate(activeDocumentItem.id, 'QA');
                    toast.info(t('toasts.qaStarted'), { description: t('toasts.autoProcessInfo'), duration: 4000 });
                    await runQA();
                    // 3. 【新增】任务完成后，自动推进到 QA_REVIEW
                    setCurrentStage('QA_REVIEW');
                    await syncStatusUpdate(activeDocumentItem.id, 'QA_REVIEW');
                    await saveRecord('QA_REVIEW', 'HUMAN', 'SUCCESS');
                    break;
                case 'QA_REVIEW':
                    setCurrentStage('POST_EDIT');
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT');
                    toast.info(t('toasts.postEditStarted'));
                    await runPostEdit();
                    break;
                case 'POST_EDIT':
                    // 人工点击下一步 -> 进入复核
                    setCurrentStage('POST_EDIT_REVIEW');
                    await saveRecord('POST_EDIT_REVIEW', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT_REVIEW');
                    break;
                case 'POST_EDIT_REVIEW':
                    setCurrentStage('SIGN_OFF');
                    await saveRecord('SIGN_OFF', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');
                    break;

                case 'SIGN_OFF':
                    setCurrentStage('COMPLETED');
                    await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
                    await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
                    toast.success(t('toasts.projectCompleted'), { description: t('toasts.readyForDelivery') });
                    break;

                default:
                    const nextIdx = Math.min(steps.length - 1, steps.indexOf(stage) + 1);
                    setCurrentStage(steps[nextIdx] as TranslationStage);
                    await saveRecord(steps[nextIdx] as TranslationStage, 'HUMAN', 'SUCCESS');
                    break;
            }
            setIsRunning(false);
        } catch (error) {
            logger.error('Operation failed:', error);
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
    }, [activeDocumentItem.id]);

    // --- 混合渲染逻辑 ---
    const renderVisualStepper = () => {
        // 当前真实阶段在总流程中的索引
        const currentRealStepIdx = steps.indexOf(currentStage as TranslationStage);

        return VISUAL_FLOW_CONFIG.map((node, index) => {
            // 判断此节点是否包含当前阶段
            const isNodeActive = node.stages.includes(currentStage as string);

            // 判断此节点是否已完成：
            // 逻辑：该节点包含的最后一个阶段，是否在“当前真实阶段”之前？
            const lastStageInNode = node.stages[node.stages.length - 1];
            const lastStageIdx = steps.indexOf(lastStageInNode as TranslationStage);
            const isNodeDone = currentRealStepIdx > lastStageIdx;

            // 获取显示标签
            let label = '';
            if (node.isGroup && node.labelKey) {
                // 如果是合并组，使用组名 (如 "预翻译阶段")
                label = tStage(node.labelKey, { defaultValue: 'Stage' });
            } else {
                // 如果是独立节点，使用标准阶段名 (如 "译后编辑")
                label = getTranslationStageLabel(node.stages[0] as TranslationStage, tStage);
            }

            // 样式基类
            let containerCls = "flex items-center px-2 py-[2px] rounded-full border transition-all duration-200 relative";

            if (isNodeDone) {
                // 已完成状态：统一紫色/Indigo
                containerCls += " bg-indigo-500 border-indigo-600 text-white shadow";
            } else if (isNodeActive) {
                // 进行中状态：深紫色高亮 + 光晕
                containerCls += " bg-indigo-600 border-indigo-700 text-white shadow ring-2 ring-indigo-400/40";
            } else {
                // 未开始状态：灰色
                containerCls += " bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70";
            }

            // 子状态逻辑 (仅针对 isGroup = true 的节点)
            const activeSubStage = node.stages.find(s => s === currentStage);
            const isReviewing = activeSubStage?.includes('REVIEW'); // 简单判断

            return (
                <div key={node.id} className="flex items-center">
                    <div className={containerCls}>
                        {isRunning && isNodeActive && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin opacity-90" />
                        )}

                        <div className="flex flex-col items-center leading-none">
                            <span>{label}</span>
                            {/* 只有是 Group 且处于激活状态时，才显示子状态微标 */}
                            {node.isGroup && isNodeActive && (
                                <span className="text-[8px] opacity-80 mt-[1px] font-normal text-yellow-500">
                                    {isReviewing ? tStage('status.reviewing') : tStage('status.processing')}
                                </span>
                            )}
                        </div>
                    </div>
                    {/* 连接线 */}
                    {index < VISUAL_FLOW_CONFIG.length - 1 && (
                        <ChevronRight className="mx-1 h-3 w-3 text-foreground/40" />
                    )}
                </div>
            );
        });
    };

    return (
        <div className={`h-10 w-full bg-background pl-2 pr-1 text-xs ${className ?? ''}`}>
            <div className="flex w-full items-center justify-between gap-2 h-full">
                {/* 左侧：混合进度条 */}
                <div className="flex items-center overflow-x-auto no-scrollbar">
                    {renderVisualStepper()}

                    {currentStage === 'ERROR' && (
                        <span className="ml-2 whitespace-nowrap rounded-full border border-red-700 bg-red-600 px-2 py-[2px] text-white shadow">
                            {tIDE('statusProgress.error')}
                        </span>
                    )}
                </div>

                {/* 右侧：操作按钮 */}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    {(currentStage.includes('REVIEW') || currentStage === 'POST_EDIT') && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 rounded-sm border-dashed" onClick={() => onRedo(currentStage)} disabled={shouldDisableButtons()}>
                            <RotateCcw className="h-3 w-3" />
                            <span className="hidden sm:inline">{redoText}</span>
                        </Button>
                    )}

                    {currentStage !== 'NOT_STARTED' && currentStage !== 'COMPLETED' && (
                        <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-sm text-muted-foreground hover:text-foreground" onClick={() => onReject(currentStage)} disabled={shouldDisableButtons()}>
                            <Undo2 className="h-3 w-3" />
                            <span className="hidden sm:inline">{rejectText}</span>
                        </Button>
                    )}

                    {!shouldHideAcceptButton(currentStage) && currentStage !== 'COMPLETED' && (
                        <Button variant="default" size="sm" className="h-7 gap-1 rounded-sm px-4 shadow-sm" onClick={() => onAccept(currentStage)} disabled={shouldDisableButtons()}>
                            {currentStage === 'NOT_STARTED' ? <Play className="h-3 w-3 fill-current" /> : <Check className="h-3 w-3" />}
                            <span className="font-medium">{getAcceptButtonText(currentStage)}</span>
                        </Button>
                    )}
                    {currentStage !== 'COMPLETED' && currentStage !== 'NOT_STARTED' && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-secondary" onClick={() => onDone(currentStage)} disabled={shouldDisableButtons()} title={signOffText}>
                            <SkipForward className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StageBadgeBar;