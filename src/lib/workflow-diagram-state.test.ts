import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getWorkflowDiagramNodeState,
    getWorkflowDiagramTerminalState,
} from './workflow-diagram-state';

test('marks only the real running workflow step as active', () => {
    assert.equal(
        getWorkflowDiagramNodeState({
            workflow: 'translate',
            stage: 'MT',
            isRunning: true,
            currentStep: 'dict-lookup',
            nodeStep: 'mono-term-extract',
        }),
        'completed'
    );
    assert.equal(
        getWorkflowDiagramNodeState({
            workflow: 'translate',
            stage: 'MT',
            isRunning: true,
            currentStep: 'dict-lookup',
            nodeStep: 'dict-lookup',
        }),
        'active'
    );
    assert.equal(
        getWorkflowDiagramNodeState({
            workflow: 'translate',
            stage: 'MT',
            isRunning: true,
            currentStep: 'dict-lookup',
            nodeStep: 'term-embed-trans',
        }),
        'pending'
    );
});

test('shows completed workflow history only after the persisted review stage', () => {
    for (const [workflow, stage] of [
        ['translate', 'MT_REVIEW'],
        ['evaluate', 'QA_REVIEW'],
        ['postedit', 'POST_EDIT_REVIEW'],
    ] as const) {
        assert.equal(
            getWorkflowDiagramNodeState({
                workflow,
                stage,
                isRunning: false,
                currentStep: 'idle',
                nodeStep: 'not-used',
            }),
            'completed',
            `${workflow} should be complete at ${stage}`
        );
        assert.equal(
            getWorkflowDiagramTerminalState({
                workflow,
                stage,
                isRunning: false,
                terminal: 'end',
            }),
            'completed',
            `${workflow} end terminal should be complete at ${stage}`
        );
    }
});

test('does not let a waiting diagram look like a running workflow', () => {
    assert.equal(
        getWorkflowDiagramNodeState({
            workflow: 'evaluate',
            stage: 'QA',
            isRunning: false,
            currentStep: 'idle',
            nodeStep: 'bi-term-eval',
        }),
        'pending'
    );
    assert.equal(
        getWorkflowDiagramTerminalState({
            workflow: 'evaluate',
            stage: 'QA',
            isRunning: false,
            terminal: 'start',
        }),
        'pending'
    );
    assert.equal(
        getWorkflowDiagramNodeState({
            workflow: 'postedit',
            stage: 'POST_EDIT',
            isRunning: false,
            currentStep: 'done',
            nodeStep: 'discourse-embed-trans',
        }),
        'pending',
        'a local done marker must not impersonate the persisted review stage'
    );
});
