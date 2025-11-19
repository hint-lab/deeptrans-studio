"use client";

import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  ReactFlow, addEdge, Background,
  useNodesState, useEdgesState,
  BackgroundVariant
} from '@xyflow/react';
import { useTheme } from "next-themes";
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useWorkflowData } from './data/workflows';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import '@xyflow/react/dist/style.css';

export default function MTWorkflowPanel() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { preStep, isPreRunning } = useAgentWorkflowSteps();
  const workflows = useWorkflowData();
  const flow = workflows['translate'];
  const [nodes, setNodes, onNodesChange] = useNodesState(flow?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow?.edges || []);

  const onConnect = useCallback((connection: any) => {
    const edge = { ...connection, type: 'custom-edge' };
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges]);

  // 更新节点状态以反映当前workflow步骤
  useEffect(() => {
    if (!flow?.nodes) return;
    const mapped = preStep as any;
    const updatedNodes = flow.nodes.map((node: any) => {
      const isCurrentStep = node.data?.phase === mapped;
      const isRunning = isCurrentStep && isPreRunning;
      return {
        ...node,
        data: {
          ...node.data,
          isActive: isCurrentStep,
          isRunning: isRunning,
        },
        className: isCurrentStep ? 'current-step' : '',
      };
    });
    setNodes(updatedNodes);
  }, [preStep, isPreRunning, flow?.nodes, setNodes]);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="h-72 w-full bg-muted/20" />;

  return (
    <ReactFlowProvider>
      <div className="h-72 w-full overflow-hidden relative">
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
          className="node-sm w-full h-full"
        >
          <Background
            color={theme === 'dark' ? '#334155' : '#94a3b8'}
            gap={12}
            size={0.8}
            variant={"dots" as BackgroundVariant}
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}


