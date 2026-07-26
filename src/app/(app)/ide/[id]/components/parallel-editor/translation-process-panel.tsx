'use client';

import type { TranslationStage } from '@/store/features/translationSlice';
import React from 'react';
import StageWorkbench, { type StageWorkbenchWorkflowContext } from './panels/stage-workbench';
import MTWorkflowPanel from './panels/workflow-diagram/MTWorkflowPanel';
import PostEditWorkflowPanel from './panels/workflow-diagram/PostEditWorkflowPanel';
import QAWorkflowPanel from './panels/workflow-diagram/QAWorkflowPanel';
import { WorkflowPromptProvider } from './panels/workflow-diagram/prompt-config-provider';

function renderWorkflow({ stage, workflowLabel }: StageWorkbenchWorkflowContext) {
    const className = 'size-full min-h-0 overflow-hidden rounded-md border bg-background';

    switch (stage) {
        case 'NOT_STARTED':
        case 'MT':
        case 'MT_REVIEW':
            return (
                <section
                    className={className}
                    aria-label={workflowLabel}
                    data-workflow-stage={stage}
                >
                    <MTWorkflowPanel />
                </section>
            );
        case 'QA':
        case 'QA_REVIEW':
            return (
                <section
                    className={className}
                    aria-label={workflowLabel}
                    data-workflow-stage={stage}
                >
                    <QAWorkflowPanel />
                </section>
            );
        case 'POST_EDIT':
        case 'POST_EDIT_REVIEW':
            return (
                <section
                    className={className}
                    aria-label={workflowLabel}
                    data-workflow-stage={stage}
                >
                    <PostEditWorkflowPanel />
                </section>
            );
        default:
            return null;
    }
}

type TranslationProcessPanelProps = {
    workflowOpen?: boolean;
    onWorkflowOpenChange?: (open: boolean, stage: TranslationStage) => void;
};

export const TranslationProcessPanel: React.FC<TranslationProcessPanelProps> = ({
    workflowOpen,
    onWorkflowOpenChange,
}) => {
    return (
        <WorkflowPromptProvider>
            <div className="size-full">
                <StageWorkbench
                    renderWorkflow={renderWorkflow}
                    workflowOpen={workflowOpen}
                    onWorkflowOpenChange={onWorkflowOpenChange}
                />
            </div>
        </WorkflowPromptProvider>
    );
};
