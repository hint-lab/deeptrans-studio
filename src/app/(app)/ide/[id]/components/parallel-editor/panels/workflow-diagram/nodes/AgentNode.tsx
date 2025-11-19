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
    const isRunning = (isActivePre && isPreRunning) || (isActiveQA && isQARunning) || (isActivePE && isPERunning);
    return (
        <div className={cn(
            "w-40 h-20 p-1.5 rounded-lg flex flex-col gap-1",
            "bg-gradient-to-br from-white to-gray-50",
            "dark:from-gray-800 dark:to-gray-900",
            "shadow-[0_4px_10px_rgb(0,0,0,0.1)]",
            "border hover:shadow-lg transition-all duration-300",
            "text-gray-800 dark:text-white rounded-lg",
            "overflow-hidden", // 防止内容溢出
            isCurrentStage || isActivePre || isActiveQA || isActivePE
                ? (isActivePre || isActiveQA || isActivePE)
                    ? "border-purple-500 dark:border-purple-400 border-2"  // Agent workflows: blue
                    : "border-purple-500 dark:border-purple-400 border-2"  // Manual review: purple
                : "border-indigo-100 dark:border-indigo-900/30 border-2"
        )} onClick={handleClick}>
            <Handle type="target" position={Position.Left} id="input" />
            <div className="flex items-start gap-1.5 rounded-lg">
                <div className={cn(
                    "w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-white shadow-sm",
                    isRunning
                        ? "bg-gradient-to-br from-green-500 to-emerald-600 animate-pulse shadow-green-200 dark:shadow-green-900/30"
                        : (isActivePre || isActiveQA || isActivePE)
                            ? "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-200 dark:shadow-blue-900/30"  // Agent workflows: blue
                            : isCurrentStage
                                ? "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-200 dark:shadow-purple-900/30"  // Manual review: purple
                                : "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-200 dark:shadow-indigo-900/30"
                )}>
                    <span className="text-xs">
                        {isRunning ? "⚡" : "🤖"}
                    </span>
                </div>
                <div className="font-medium text-xs leading-tight break-words flex items-center gap-1 flex-1 min-w-0">
                    <span className="truncate">{data.label}</span>
                    {isRunning && (
                        <Loader className="h-3 w-3 animate-spin text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    )}
                </div>
                {/* <div className="ml-auto text-emerald-500 dark:text-emerald-400 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div> */}
            </div>
            <div className="mt-0.5 text-[10px] text-gray-600 dark:text-gray-400 font-normal leading-tight break-words flex-1 overflow-hidden">
                <div className="line-clamp-2">{data.description || t('agentNode')}</div>
            </div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
} 