import React from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { TranslationStage } from '@/store/features/translationSlice';
import { Loader } from 'lucide-react';
import { useTranslations } from 'next-intl';
// 简化节点数据结构
export interface AgentNodeData {
    label: string;
    description?: string;
    stage?: TranslationStage;
    [key: string]: unknown; // 添加索引签名
}

// 使用any临时解决类型问题
export function AgentNode({ data }: any) {
    const t = useTranslations('IDE.workflowNode');
    const { currentStage } = useTranslationState();
    const actions = useAgentWorkflowSteps();
    const { setCurrentStage } = useTranslationState();
    const handleClick = () => {
        // 使用节点数据中的属性而不是标签来判断节点类型
        const { phase, qaPhase, stage, variant } = data || {};

        // 忽略开始和结束节点
        if (variant === 'start' || variant === 'end') {
            return;
        }

        // 根据节点数据中的属性来设置相应的步骤
        if (phase) {
            // 预翻译工作流节点
            actions.setPreStep(phase);
            actions.setPreRunning(true);
        } else if (qaPhase) {
            // 质检工作流节点
            actions.setQAStep(qaPhase);
            actions.setQARunning(true);
        } else if (stage) {
            // 译后编辑工作流节点
            actions.setPeStep(stage);
            actions.setPERunning(true);
        }
    };
    const preStep = useAgentWorkflowSteps(s => s.preStep);
    const qaStep = useAgentWorkflowSteps(s => s.qaStep);
    const peStep = useAgentWorkflowSteps(s => s.peStep);
    const isPreRunning = useAgentWorkflowSteps(s => s.isPreRunning);
    const isQARunning = useAgentWorkflowSteps(s => s.isQARunning);
    const isPERunning = useAgentWorkflowSteps(s => s.isPERunning);

    const isActivePre = data?.phase && preStep === data.phase;
    const isActiveQA = data?.qaPhase && qaStep === data.qaPhase;
    const isActivePE = data?.stage && peStep === data.stage;
    const isCurrentStage = currentStage === data.stage;
    const isRunning =
        (isActivePre && isPreRunning) || (isActiveQA && isQARunning) || (isActivePE && isPERunning);
    return (
        <div
            className={cn(
                'flex h-20 w-40 flex-col gap-1 rounded-lg p-1.5',
                'bg-gradient-to-br from-white to-gray-50',
                'dark:from-gray-800 dark:to-gray-900',
                'shadow-[0_4px_10px_rgb(0,0,0,0.1)]',
                'border transition-all duration-300 hover:shadow-lg',
                'rounded-lg text-gray-800 dark:text-white',
                'overflow-hidden', // 防止内容溢出
                isCurrentStage || isActivePre || isActiveQA || isActivePE
                    ? isActivePre || isActiveQA || isActivePE
                        ? 'border-2 border-purple-500 dark:border-purple-400' // Agent workflows: blue
                        : 'border-2 border-purple-500 dark:border-purple-400' // Manual review: purple
                    : 'border-2 border-indigo-100 dark:border-indigo-900/30'
            )}
            onClick={handleClick}
        >
            <Handle type="target" position={Position.Left} id="input" />
            <div className="flex items-start gap-1.5 rounded-lg">
                <div
                    className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-white shadow-sm',
                        isRunning
                            ? 'animate-pulse bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-200 dark:shadow-green-900/30'
                            : isActivePre || isActiveQA || isActivePE
                              ? 'bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-200 dark:shadow-blue-900/30' // Agent workflows: blue
                              : isCurrentStage
                                ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-200 dark:shadow-purple-900/30' // Manual review: purple
                                : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-200 dark:shadow-indigo-900/30'
                    )}
                >
                    <span className="text-xs">{isRunning ? '⚡' : '🤖'}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1 break-words text-xs font-medium leading-tight">
                    <span className="truncate">{data.label}</span>
                    {isRunning && (
                        <Loader className="h-3 w-3 flex-shrink-0 animate-spin text-purple-600 dark:text-purple-400" />
                    )}
                </div>
                {/* <div className="ml-auto text-emerald-500 dark:text-emerald-400 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div> */}
            </div>
            <div className="mt-0.5 flex-1 overflow-hidden break-words text-[10px] font-normal leading-tight text-gray-600 dark:text-gray-400">
                <div className="line-clamp-2">{data.description || t('agentNode')}</div>
            </div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
}
