'use client';

import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
    ReactFlow,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useWorkflowData } from './data/workflows';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import {
    getWorkflowDiagramNodeState,
    getWorkflowDiagramTerminalState,
    isWorkflowDiagramComplete,
} from '@/lib/workflow-diagram-state';
import { useTranslations } from 'next-intl';
import {
    preserveWorkflowPromptNodeClicks,
    readOnlyWorkflowDiagramProps,
    workflowDiagramFitViewOptions,
} from './workflow-diagram-canvas';
import '@xyflow/react/dist/style.css';

export default function MTWorkflowPanel() {
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { preStep, isPreRunning } = useAgentWorkflowSteps();
    const { currentStage } = useTranslationState();
    const workflows = useWorkflowData();
    const flow = workflows['translate'];
    const [nodes, setNodes, onNodesChange] = useNodesState(flow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(flow?.edges || []);
    const t = useTranslations('IDE.workflowDiagram');
    const isComplete = isWorkflowDiagramComplete('translate', currentStage);
    const activeNode = flow?.nodes?.find((node: any) => node.data?.phase === preStep);
    const status = isComplete
        ? t('completed')
        : isPreRunning
          ? t('running', { step: String(activeNode?.data?.label || '') || t('preparing') })
          : t('waiting');

    // 更新节点状态以反映当前workflow步骤
    useEffect(() => {
        if (!flow?.nodes) return;
        const updatedNodes = flow.nodes.map((node: any) => {
            const workflowState =
                node.type === 'terminalNode'
                    ? getWorkflowDiagramTerminalState({
                          workflow: 'translate',
                          stage: currentStage,
                          isRunning: isPreRunning,
                          terminal: node.data?.variant === 'end' ? 'end' : 'start',
                      })
                    : getWorkflowDiagramNodeState({
                          workflow: 'translate',
                          stage: currentStage,
                          isRunning: isPreRunning,
                          currentStep: preStep,
                          nodeStep: node.data?.phase,
                      });
            return {
                ...node,
                data: {
                    ...node.data,
                    workflowState,
                    isActive: workflowState === 'active',
                    isRunning: workflowState === 'active',
                    isCompleted: workflowState === 'completed',
                },
            };
        });
        setNodes(updatedNodes);
        setEdges(flow.edges || []);
    }, [currentStage, flow?.edges, flow?.nodes, isPreRunning, preStep, setEdges, setNodes]);

    useEffect(() => {
        setMounted(true);
    }, []);
    if (!mounted) return <div className="size-full min-h-0 bg-muted/20" />;

    return (
        <ReactFlowProvider>
            <section className="relative size-full min-h-0 overflow-hidden" aria-label={t('label')}>
                <div
                    className="pointer-events-none absolute left-2 top-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center rounded-md border bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
                    role="status"
                    aria-live="polite"
                    data-workflow-state={
                        isComplete ? 'completed' : isPreRunning ? 'active' : 'pending'
                    }
                >
                    <span className="truncate">{status}</span>
                </div>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={preserveWorkflowPromptNodeClicks}
                    edgeTypes={edgeTypes}
                    nodeTypes={nodeTypes}
                    {...readOnlyWorkflowDiagramProps}
                    ariaLabelConfig={{ 'controls.fitView.ariaLabel': t('resetView') }}
                    className="node-sm h-full w-full"
                >
                    <Controls
                        aria-label={t('controlsLabel')}
                        position="bottom-right"
                        showZoom={false}
                        showInteractive={false}
                        fitViewOptions={workflowDiagramFitViewOptions}
                    />
                    <Background
                        color={theme === 'dark' ? '#334155' : '#94a3b8'}
                        gap={12}
                        size={0.8}
                        variant={'dots' as BackgroundVariant}
                    />
                </ReactFlow>
            </section>
        </ReactFlowProvider>
    );
}
