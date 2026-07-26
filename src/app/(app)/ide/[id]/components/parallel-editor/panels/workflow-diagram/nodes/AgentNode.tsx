import { Handle, Position } from '@xyflow/react';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { getWorkflowNodeSemantics, type WorkflowNodeData } from '@/lib/workflow-node-semantics';
import { TranslationStage } from '@/store/features/translationSlice';
import { BookOpenCheck, CheckCircle2, Loader, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePromptConfig } from '../prompt-config-provider';
// 简化节点数据结构
export interface AgentNodeData extends WorkflowNodeData {
    stage?: TranslationStage;
}

// 使用any临时解决类型问题
export function AgentNode({ data }: any) {
    const t = useTranslations('IDE.workflowNode');
    const { currentStage } = useTranslationState();
    const { openPrompt, isCustomized } = usePromptConfig();
    const semantics = getWorkflowNodeSemantics(data);
    const { isPromptConfigurable, isReference, promptKey } = semantics;
    const customized = isPromptConfigurable && isCustomized(promptKey);
    const handleClick = () => {
        if (isPromptConfigurable) openPrompt(promptKey);
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
    const explicitWorkflowState = ['pending', 'active', 'completed'].includes(
        String(data?.workflowState || '')
    )
        ? String(data.workflowState)
        : undefined;
    const derivedRunning =
        (isActivePre && isPreRunning) || (isActiveQA && isQARunning) || (isActivePE && isPERunning);
    const isRunning = explicitWorkflowState ? explicitWorkflowState === 'active' : derivedRunning;
    const isCompleted = explicitWorkflowState === 'completed';
    const isActive = explicitWorkflowState
        ? explicitWorkflowState === 'active'
        : isCurrentStage || isActivePre || isActiveQA || isActivePE;
    const workflowState = isCompleted ? 'completed' : isActive ? 'active' : 'pending';
    const nodeAriaLabel = isPromptConfigurable
        ? `${t('promptNodeAria', { label: data.label })} ${t(`workflowState.${workflowState}`)}`
        : isReference
          ? `${t('referenceNodeAria', { label: data.label })} ${t(
                `workflowState.${workflowState}`
            )}`
          : undefined;
    const borderClass = isActive
        ? 'border-2 border-purple-500 dark:border-purple-400'
        : isCompleted
          ? 'border-2 border-emerald-400/80 dark:border-emerald-500/70'
          : isReference
            ? 'border-2 border-cyan-200 dark:border-cyan-900/70'
            : 'border-2 border-indigo-100 dark:border-indigo-900/30';

    return (
        <div
            className={cn(
                'group flex h-20 w-40 flex-col gap-1 rounded-lg p-1.5',
                'bg-gradient-to-br from-white to-gray-50',
                'dark:from-gray-800 dark:to-gray-900',
                'shadow-[0_4px_10px_rgb(0,0,0,0.1)]',
                'border transition-[border-color,box-shadow,transform] duration-200',
                'rounded-lg text-gray-800 dark:text-white',
                'overflow-hidden', // 防止内容溢出
                isPromptConfigurable
                    ? 'cursor-pointer hover:-translate-y-px hover:border-indigo-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950'
                    : isReference
                      ? 'cursor-default bg-cyan-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-cyan-950/20 dark:focus-visible:ring-offset-slate-950'
                      : 'cursor-default',
                borderClass
            )}
            onClick={isPromptConfigurable ? handleClick : undefined}
            onKeyDown={event => {
                if (isPromptConfigurable && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleClick();
                }
            }}
            role={isPromptConfigurable ? 'button' : isReference ? 'note' : undefined}
            tabIndex={isPromptConfigurable || isReference ? 0 : -1}
            aria-haspopup={isPromptConfigurable ? 'dialog' : undefined}
            aria-label={nodeAriaLabel}
            data-workflow-state={workflowState}
        >
            <Handle type="target" position={Position.Left} id="input" />
            <div className="flex items-start gap-1.5 rounded-lg">
                <div
                    className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-white shadow-sm',
                        isRunning
                            ? 'animate-pulse bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-200 dark:shadow-green-900/30'
                            : isCompleted
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200 dark:shadow-emerald-900/30'
                              : isActivePre || isActiveQA || isActivePE
                                ? 'bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-200 dark:shadow-blue-900/30' // Agent workflows: blue
                                : isCurrentStage
                                  ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-200 dark:shadow-purple-900/30' // Manual review: purple
                                  : isReference
                                    ? 'bg-gradient-to-br from-cyan-600 to-teal-600 shadow-cyan-200 dark:shadow-cyan-900/30'
                                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-200 dark:shadow-indigo-900/30'
                    )}
                >
                    {isRunning ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                    ) : isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                    ) : isReference ? (
                        <BookOpenCheck className="h-3.5 w-3.5" strokeWidth={2.1} />
                    ) : (
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                    )}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1 break-words text-xs font-medium leading-tight">
                    <span className="truncate">{data.label}</span>
                    {isPromptConfigurable && (
                        <span
                            className={cn(
                                'ml-auto flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                                customized
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                                    : 'text-slate-400 group-hover:text-indigo-500'
                            )}
                            title={
                                customized
                                    ? t('personalPromptConfigured')
                                    : t('configurePersonalPrompt')
                            }
                        >
                            <SlidersHorizontal className="h-2.5 w-2.5" />
                        </span>
                    )}
                    {isReference && (
                        <span
                            className="ml-auto inline-flex flex-shrink-0 items-center gap-0.5 rounded-sm border border-cyan-200 bg-cyan-50 px-1 py-0.5 text-[8px] font-semibold leading-none text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-200"
                            title={t('referenceNodeHint')}
                        >
                            <BookOpenCheck className="h-2.5 w-2.5" aria-hidden="true" />
                            {t('referenceNode')}
                        </span>
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
                <div className="line-clamp-2">
                    {isReference
                        ? data.description || t('referenceNodeHint')
                        : isPromptConfigurable
                          ? t('promptNodeHint')
                          : data.description || t('agentNode')}
                </div>
            </div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
}
