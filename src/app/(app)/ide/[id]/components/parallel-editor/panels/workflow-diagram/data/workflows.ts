'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Node, Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { AgentNodeData } from '../index';

export type WorkflowKey = 'translate' | 'evaluate' | 'postedit';

// Hook to get internationalized workflow data
export function useWorkflowData() {
    const t = useTranslations('IDE.workflow');

    return useMemo(() => {
        const translateNodes: Node<AgentNodeData>[] = [
            {
                id: 'ts',
                data: { label: t('start'), variant: 'start' } as any,
                position: { x: 50, y: 80 },
                type: 'terminalNode',
            },
            {
                id: 't1',
                data: { label: t('termExtraction'), phase: 'mono-term-extract' } as any,
                position: { x: 200, y: 55 },
                type: 'agentNode',
            },
            {
                id: 't2',
                data: { label: t('dictionaryQuery'), phase: 'dict-lookup' } as any,
                position: { x: 420, y: 55 },
                type: 'agentNode',
            },
            {
                id: 't3',
                data: { label: t('termEmbeddedTranslation'), phase: 'term-embed-trans' } as any,
                position: { x: 640, y: 55 },
                type: 'agentNode',
            },
            {
                id: 'te',
                data: { label: t('end'), variant: 'end' } as any,
                position: { x: 900, y: 80 },
                type: 'terminalNode',
            },
        ];
        const translateEdges: Edge[] = [
            {
                id: 'ts-t1',
                source: 'ts',
                target: 't1',
                sourceHandle: 'output',
                targetHandle: 'input',
                label: t('terms'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 't1-t2',
                source: 't1',
                target: 't2',
                sourceHandle: 'output',
                targetHandle: 'input',
                label: t('query'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 't2-t3',
                source: 't2',
                target: 't3',
                sourceHandle: 'output',
                targetHandle: 'input',
                label: t('embed'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 't3-te',
                source: 't3',
                target: 'te',
                sourceHandle: 'output',
                targetHandle: 'input',
                label: t('complete'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
        ];

        const evaluateNodes: Node<AgentNodeData>[] = [
            {
                id: 'es',
                data: { label: t('start'), variant: 'start' } as any,
                position: { x: 50, y: 80 },
                type: 'terminalNode',
            },
            {
                id: 'e1',
                data: { label: t('syntaxEvaluation'), qaPhase: 'bi-term-eval' } as any,
                position: { x: 200, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'e2',
                data: { label: t('syntaxSuggestion'), qaPhase: 'syntax-eval' } as any,
                position: { x: 420, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'e3',
                data: {
                    label: t('syntaxEmbeddedTranslation'),
                    qaPhase: 'syntex-embed-trans',
                } as any,
                position: { x: 640, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'ee',
                data: { label: t('end'), variant: 'end' } as any,
                position: { x: 840, y: 80 },
                type: 'terminalNode',
            },
        ];
        const evaluateEdges: Edge[] = [
            {
                id: 'es-e1',
                source: 'es',
                target: 'e1',
                targetHandle: 'input',
                label: t('modalConjunctions'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'e1-e2',
                source: 'e1',
                target: 'e2',
                targetHandle: 'input',
                label: t('syntax'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'e2-e3',
                source: 'e2',
                target: 'e3',
                targetHandle: 'input',
                label: t('embed'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'e3-ee',
                source: 'e3',
                target: 'ee',
                targetHandle: 'input',
                label: t('complete'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
        ];

        const posteditNodes: Node<AgentNodeData>[] = [
            {
                id: 'ps',
                data: { label: t('start'), variant: 'start' } as any,
                position: { x: 50, y: 70 },
                type: 'terminalNode',
            },
            {
                id: 'p1',
                data: { label: t('discourseQuery'), stage: 'discourse-query' } as any,
                position: { x: 200, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'p2',
                data: { label: t('discourseEvaluation'), stage: 'discourse-eval' } as any,
                position: { x: 420, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'p3',
                data: {
                    label: t('discourseEmbeddedTranslation'),
                    stage: 'discourse-embed-trans',
                } as any,
                position: { x: 640, y: 60 },
                type: 'agentNode',
            },
            {
                id: 'pe',
                data: { label: t('end'), variant: 'end' } as any,
                position: { x: 900, y: 70 },
                type: 'terminalNode',
            },
        ];
        const posteditEdges: Edge[] = [
            {
                id: 'ps-p1',
                source: 'ps',
                target: 'p1',
                targetHandle: 'input',
                label: t('query'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'p1-p2',
                source: 'p1',
                target: 'p2',
                targetHandle: 'input',
                label: t('evaluation'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'p2-p3',
                source: 'p2',
                target: 'p3',
                targetHandle: 'input',
                label: t('embeddedTranslation'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
            {
                id: 'p3-pe',
                source: 'p3',
                target: 'pe',
                targetHandle: 'input',
                label: t('complete'),
                markerEnd: { type: MarkerType.ArrowClosed },
            },
        ];

        return {
            translate: { nodes: translateNodes, edges: translateEdges },
            evaluate: { nodes: evaluateNodes, edges: evaluateEdges },
            postedit: { nodes: posteditNodes, edges: posteditEdges },
        } as Record<WorkflowKey, { nodes: Node<AgentNodeData>[]; edges: Edge[] }>;
    }, [t]);
}
