'use client';
import { useCallback } from 'react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { ReactFlowProvider } from '@xyflow/react';
import { useParams, useRouter } from 'next/navigation';
import {
    ReactFlow,
    addEdge,
    Background,
    Controls,
    Edge,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    MarkerType,
} from '@xyflow/react';
// 导入自定义组件
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useWorkflowData, type WorkflowKey } from './data/workflows';
import { useTranslationState } from '@/hooks/useTranslation';
import '@xyflow/react/dist/style.css';

export interface AgentNodeData {
    label: string;
    description?: string;
    [key: string]: unknown; // 添加索引签名
}

export default function WorkflowDiagramPanel() {
    const params = useParams<{ id: string }>();
    const projectId = (params as any)?.id as string | undefined;
    const router = useRouter();
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const workflows = useWorkflowData();
    const [nodes, setNodes, onNodesChange] = useNodesState(workflows['translate']?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(workflows['translate']?.edges || []);
    const { currentStage } = useTranslationState();
    const onConnect = useCallback(
        (connection: any) => {
            const edge = { ...connection, type: 'custom-edge' };
            setEdges(eds => addEdge(edge, eds));
        },
        [setEdges]
    );
    // if (!mounted) {
    //     return <div className="h-[600px] w-full bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-slate-900 p-4">加载中...</div>;
    // }
    useEffect(() => {
        console.log('节点:', nodes);
        console.log('边:', edges);

        // 特别检查边的定义
        edges.forEach(edge => {
            console.log(`边 ${edge.id}: 从 ${edge.source} 到 ${edge.target}`);
            console.log(`sourceHandle: ${edge.sourceHandle}, targetHandle: ${edge.targetHandle}`);
        });
    }, [nodes, edges]);

    // 确保只在客户端渲染
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const mapStageToFlow = (stage?: string): WorkflowKey => {
            const upper = (stage || '').toUpperCase();
            if (upper === 'QA') return 'evaluate';
            if (upper === 'SIGN_OFF' || upper === 'ERROR') return 'translate';
            // 其它阶段（含 NOT_STARTED / MT / POST_EDIT / SIGN_OFF）统一展示预译流程
            return 'translate';
        };
        const wf = workflows[mapStageToFlow(currentStage as any)];
        if (wf?.nodes && wf?.edges) {
            setNodes(wf.nodes as any);
            setEdges(wf.edges as any);
        }
    }, [currentStage, setNodes, setEdges, workflows]);

    // 完全跳过服务器渲染
    if (!mounted) {
        return (
            <div className="h-72 w-full p-2">
                <div className="h-full w-full space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-[calc(100%-1.25rem)] w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
            </div>
        );
    }

    return (
        <ReactFlowProvider>
            <div className="relative h-72 w-full overflow-hidden">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    edgeTypes={edgeTypes}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 1.0 }}
                    minZoom={0.2}
                    maxZoom={2}
                    defaultViewport={{ x: 0, y: 0, zoom: 0.4 }}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    className="node-sm h-full w-full"
                >
                    <Background
                        color={theme === 'dark' ? '#334155' : '#94a3b8'}
                        gap={12}
                        size={0.8}
                        variant={'dots' as BackgroundVariant}
                    />
                    {/* <Controls
                        className="shadow-xl bg-white dark:bg-gray-800 dark:text-slate-600 rounded-lg p-1"
                        showZoom={true}
                        showFitView={true}
                        position="bottom-right"
                    /> */}
                </ReactFlow>
            </div>
        </ReactFlowProvider>
    );
}
