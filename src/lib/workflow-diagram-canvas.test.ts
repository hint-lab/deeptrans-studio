import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflowDirectory = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'ide',
    '[id]',
    'components',
    'parallel-editor',
    'panels',
    'workflow-diagram'
);

const readWorkflowSource = (file: string) =>
    fs.readFileSync(path.join(workflowDirectory, file), 'utf8');

test('workflow diagrams use one read-only viewport policy and an accessible reset view', () => {
    const canvas = readWorkflowSource('workflow-diagram-canvas.ts');

    for (const prop of [
        'nodesDraggable: false',
        'nodesConnectable: false',
        'nodesFocusable: false',
        'elementsSelectable: false',
        'edgesFocusable: false',
        'edgesReconnectable: false',
        'panOnDrag: false',
        'panOnScroll: false',
        'zoomOnScroll: false',
        'zoomOnPinch: false',
        'zoomOnDoubleClick: false',
        'preventScrolling: false',
    ]) {
        assert.match(canvas, new RegExp(prop));
    }

    for (const panel of [
        'MTWorkflowPanel.tsx',
        'QAWorkflowPanel.tsx',
        'PostEditWorkflowPanel.tsx',
    ]) {
        const source = readWorkflowSource(panel);

        assert.match(source, /onNodeClick=\{preserveWorkflowPromptNodeClicks\}/);
        assert.match(source, /\{\.\.\.readOnlyWorkflowDiagramProps\}/);
        assert.match(
            source,
            /ariaLabelConfig=\{\{ 'controls\.fitView\.ariaLabel': t\('resetView'\) \}\}/
        );
        assert.match(source, /<Controls[\s\S]*?aria-label=\{t\('controlsLabel'\)\}/);
        assert.match(source, /<Controls[\s\S]*?showZoom=\{false\}/);
        assert.match(source, /<Controls[\s\S]*?showInteractive=\{false\}/);
        assert.doesNotMatch(source, /onConnect=/);
    }
});

test('the read-only React Flow wrapper keeps custom Prompt nodes clickable by design', () => {
    const canvas = readWorkflowSource('workflow-diagram-canvas.ts');
    const agentNode = readWorkflowSource('nodes/AgentNode.tsx');

    assert.match(canvas, /export const preserveWorkflowPromptNodeClicks = \(\) => undefined;/);
    assert.match(agentNode, /onClick=\{isPromptConfigurable \? handleClick : undefined\}/);
    assert.match(agentNode, /event\.key === 'Enter' \|\| event\.key === ' '/);
});
