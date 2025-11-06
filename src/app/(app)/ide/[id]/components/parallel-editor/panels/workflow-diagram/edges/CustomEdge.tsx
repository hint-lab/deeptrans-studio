import React from 'react';
import { EdgeProps } from 'reactflow';
import { BaseEdge, EdgeLabelRenderer, getStraightPath, useReactFlow } from '@xyflow/react';

export function CustomEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return <BaseEdge id={id} path={edgePath} />;
}