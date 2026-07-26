import type { ReactFlowProps } from '@xyflow/react';

/**
 * The workflow diagrams communicate the current translation state and open
 * per-user Prompt settings. They are not editable canvases. Keeping the
 * interaction contract in one place prevents one stage from quietly regaining
 * free-canvas gestures while another stays read-only.
 */
export const workflowDiagramFitViewOptions = { padding: 1 };

export const readOnlyWorkflowDiagramProps = {
    fitView: true,
    fitViewOptions: workflowDiagramFitViewOptions,
    minZoom: 0.2,
    maxZoom: 2,
    defaultViewport: { x: 0, y: 0, zoom: 0.4 },
    nodesDraggable: false,
    nodesConnectable: false,
    nodesFocusable: false,
    elementsSelectable: false,
    edgesFocusable: false,
    edgesReconnectable: false,
    selectNodesOnDrag: false,
    autoPanOnNodeFocus: false,
    panOnDrag: false,
    panOnScroll: false,
    zoomOnScroll: false,
    zoomOnPinch: false,
    zoomOnDoubleClick: false,
    preventScrolling: false,
    disableKeyboardA11y: true,
} satisfies Pick<
    ReactFlowProps,
    | 'fitView'
    | 'fitViewOptions'
    | 'minZoom'
    | 'maxZoom'
    | 'defaultViewport'
    | 'nodesDraggable'
    | 'nodesConnectable'
    | 'nodesFocusable'
    | 'elementsSelectable'
    | 'edgesFocusable'
    | 'edgesReconnectable'
    | 'selectNodesOnDrag'
    | 'autoPanOnNodeFocus'
    | 'panOnDrag'
    | 'panOnScroll'
    | 'zoomOnScroll'
    | 'zoomOnPinch'
    | 'zoomOnDoubleClick'
    | 'preventScrolling'
    | 'disableKeyboardA11y'
>;

/**
 * React Flow makes a node pointer-inert when it is neither selectable nor
 * draggable unless the flow receives an onNodeClick callback. Prompt nodes
 * own their click action inside AgentNode, so this intentionally does nothing
 * except preserve that pointer route in read-only diagrams.
 */
export const preserveWorkflowPromptNodeClicks = () => undefined;
