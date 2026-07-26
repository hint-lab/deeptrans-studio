import type { TranslationStage } from '@/store/features/translationSlice';

export type WorkflowDiagramKey = 'translate' | 'evaluate' | 'postedit';
export type WorkflowDiagramNodeState = 'pending' | 'active' | 'completed';

type WorkflowDefinition = {
    phases: readonly string[];
    reviewStage: TranslationStage;
};

const WORKFLOWS: Record<WorkflowDiagramKey, WorkflowDefinition> = {
    translate: {
        phases: ['mono-term-extract', 'dict-lookup', 'term-embed-trans'],
        reviewStage: 'MT_REVIEW',
    },
    evaluate: {
        phases: ['bi-term-eval', 'syntax-eval', 'syntex-embed-trans'],
        reviewStage: 'QA_REVIEW',
    },
    postedit: {
        phases: ['discourse-query', 'discourse-eval', 'discourse-embed-trans'],
        reviewStage: 'POST_EDIT_REVIEW',
    },
};

export function isWorkflowDiagramComplete(workflow: WorkflowDiagramKey, stage: TranslationStage) {
    return stage === WORKFLOWS[workflow].reviewStage;
}

/**
 * The diagram is a read-only trace, not an alternate control surface. Its
 * node state must therefore derive from the real run state and persisted
 * review stage, never from a node click.
 */
export function getWorkflowDiagramNodeState({
    workflow,
    stage,
    isRunning,
    currentStep,
    nodeStep,
}: {
    workflow: WorkflowDiagramKey;
    stage: TranslationStage;
    isRunning: boolean;
    currentStep?: string;
    nodeStep?: string;
}): WorkflowDiagramNodeState {
    if (isWorkflowDiagramComplete(workflow, stage)) return 'completed';

    const phases = WORKFLOWS[workflow].phases;
    const currentIndex = phases.indexOf(String(currentStep || ''));
    const nodeIndex = phases.indexOf(String(nodeStep || ''));

    if (!isRunning || currentIndex < 0 || nodeIndex < 0) return 'pending';
    if (nodeIndex < currentIndex) return 'completed';
    if (nodeIndex === currentIndex) return 'active';
    return 'pending';
}

export function getWorkflowDiagramTerminalState({
    workflow,
    stage,
    isRunning,
    terminal,
}: {
    workflow: WorkflowDiagramKey;
    stage: TranslationStage;
    isRunning: boolean;
    terminal: 'start' | 'end';
}): WorkflowDiagramNodeState {
    const complete = isWorkflowDiagramComplete(workflow, stage);
    if (terminal === 'end') return complete ? 'completed' : 'pending';
    return complete ? 'completed' : isRunning ? 'active' : 'pending';
}
