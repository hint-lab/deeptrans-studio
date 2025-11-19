"use client";

import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  ReactFlow, addEdge, Background,
  useNodesState, useEdgesState,
  BackgroundVariant
} from '@xyflow/react';
import { useTheme } from "next-themes";
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useWorkflowData } from './data/workflows';
import '@xyflow/react/dist/style.css';

export default function PostEditWorkflowPanel() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const peStep = useAgentWorkflowSteps(s => s.peStep);
  const isPERunning = useAgentWorkflowSteps(s => s.isPERunning);
  const workflows = useWorkflowData();
  const flow = workflows['postedit'];
  const [nodes, setNodes, onNodesChange] = useNodesState(flow?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow?.edges || []);

  // 监听 PE 状态变化，强制重新渲染节点
  useEffect(() => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        _forceUpdate: Date.now() // 强制更新节点
      }
    })));
  }, [peStep, isPERunning, setNodes]);

  const onConnect = useCallback((connection: any) => {
    const edge = { ...connection, type: 'custom-edge' };
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges]);

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


