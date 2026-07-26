import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readIDEComponent = (...segments: string[]) =>
    fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', '(app)', 'ide', '[id]', 'components', ...segments),
        'utf8'
    );

test('right-sidebar controls expose their actual panel names to keyboard and assistive tech', () => {
    const source = readIDEComponent('right-sidebar.tsx');

    assert.match(
        source,
        /<Button[\s\S]*?type="button"[\s\S]*?aria-label=\{t\('chat'\)\}[\s\S]*?aria-pressed=\{mode === 'chat'\}/
    );
    assert.match(source, /aria-label=\{t\('help'\)\}/);
    assert.match(source, /aria-label=\{t\('preview'\)\}/);
    assert.doesNotMatch(source, /asChild/);
});

test('explorer uses native rows with disclosure and current-item state', () => {
    const source = readIDEComponent('explorer.tsx');

    assert.match(source, /getExplorerDisclosureAction/);
    assert.match(source, /role="alert"/);
    assert.match(source, /onClick=\{retryExplorerLoad\}/);
    assert.match(source, /isCurrentExplorerLoadRequest/);
    assert.match(
        source,
        /type="button"[\s\S]*?aria-expanded=\{hasChildren \? isExpanded : undefined\}/
    );
    assert.match(source, /aria-current=\{isActive \? 'true' : undefined\}/);
    assert.match(source, /onKeyDown=\{event =>[\s\S]*?handleDisclosureKeyDown/);
});

test('the idle run icon always has a localized accessible label', () => {
    const source = readIDEComponent('menu', 'components', 'run-menu.tsx');

    assert.match(source, /const idleButtonLabel = tStage\('oneClickCompletion'\);/);
    assert.match(source, /const accessibleButtonLabel = buttonText \|\| idleButtonLabel;/);
    assert.match(source, /aria-label=\{accessibleButtonLabel\}/);
});

test('help panel uses scoped requests and exposes actionable loading and retry states', () => {
    const source = readIDEComponent('help-panel.tsx');

    assert.match(source, /isCurrentHelpPanelRequest/);
    assert.match(source, /AbortController/);
    assert.match(source, /role="search"/);
    assert.match(source, /role="alert"/);
    assert.match(source, /setReloadKey/);
    assert.match(source, /const openDocument = useCallback/);
    assert.doesNotMatch(source, /target = '\/docs\/getting-started'/);
    assert.doesNotMatch(source, /setError\(e\?\.message/);
});

test('translation workspace names the current segment, stage, and next action', () => {
    const stageBadge = readIDEComponent('parallel-editor', 'stage-badge.tsx');
    const workbench = readIDEComponent('parallel-editor', 'panels', 'stage-workbench.tsx');
    const hello = readIDEComponent('parallel-editor', 'hello-page.tsx');

    assert.match(stageBadge, /getTranslationStageGuidance/);
    assert.match(stageBadge, /data-current-stage=\{currentStage\}/);
    assert.match(stageBadge, /role="status"/);
    assert.match(stageBadge, /aria-describedby=\{stageStatusId\}/);
    assert.match(stageBadge, /tGuidance\('currentSegment'\)/);
    assert.match(stageBadge, /t\('toasts\.operationFailedDescription'\)/);
    assert.doesNotMatch(stageBadge, /description: String\(error\)/);
    assert.match(workbench, /aria-label=\{tGuidance\('workbenchLabel'/);
    assert.match(workbench, /aria-expanded=\{workflowOpen\}/);
    assert.match(workbench, /aria-controls=\{workflowPanelId\}/);
    assert.match(workbench, /tGuidance\('nextAction'/);
    assert.match(hello, /const steps = \['select', 'confirm', 'advance'\] as const;/);
    assert.match(hello, /<ol className="mt-6 divide-y border-y"/);
    assert.doesNotMatch(hello, /\u{1F60B}/u);
});

test('workflow diagrams are a truthful read-only status trace', () => {
    const canvas = readIDEComponent(
        'parallel-editor',
        'panels',
        'workflow-diagram',
        'workflow-diagram-canvas.ts'
    );

    for (const file of [
        'MTWorkflowPanel.tsx',
        'QAWorkflowPanel.tsx',
        'PostEditWorkflowPanel.tsx',
    ]) {
        const source = readIDEComponent('parallel-editor', 'panels', 'workflow-diagram', file);

        assert.match(source, /getWorkflowDiagramNodeState/);
        assert.match(source, /getWorkflowDiagramTerminalState/);
        assert.match(source, /data-workflow-state=/);
        assert.match(source, /\{\.\.\.readOnlyWorkflowDiagramProps\}/);
        assert.match(source, /onNodeClick=\{preserveWorkflowPromptNodeClicks\}/);
        assert.doesNotMatch(source, /onConnect=/);
    }

    assert.match(canvas, /elementsSelectable: false/);
    assert.match(canvas, /edgesFocusable: false/);
    assert.match(canvas, /panOnDrag: false/);
    assert.match(canvas, /zoomOnScroll: false/);
});
