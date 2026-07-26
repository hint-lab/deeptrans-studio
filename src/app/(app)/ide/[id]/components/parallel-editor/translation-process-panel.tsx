'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import type { TranslationStage } from '@/store/features/translationSlice';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef } from 'react';
import LoggingPanel from './panels/logging';
import MtReviewPanel from './panels/mt-review';
import PostEditPanel from './panels/post-edit';
import QaReviewPanel from './panels/qa-review';
import SignoffPanel from './panels/signoff';
import MTWorkflowPanel from './panels/workflow-diagram/MTWorkflowPanel';
import PostEditWorkflowPanel from './panels/workflow-diagram/PostEditWorkflowPanel';
import { WorkflowPromptProvider } from './panels/workflow-diagram/prompt-config-provider';
import QAWorkflowPanel from './panels/workflow-diagram/QAWorkflowPanel';

export type TranslationProcessTab =
    | 'pre-flow'
    | 'mt-review'
    | 'qa-flow'
    | 'qa-review'
    | 'post-edit-flow'
    | 'post-edit-review'
    | 'signoff'
    | 'output';

const translationProcessTabs = new Set<TranslationProcessTab>([
    'pre-flow',
    'mt-review',
    'qa-flow',
    'qa-review',
    'post-edit-flow',
    'post-edit-review',
    'signoff',
    'output',
]);

export function getStageDefaultPanelTab(stage: TranslationStage): TranslationProcessTab {
    switch (stage) {
        case 'NOT_STARTED':
        case 'MT':
        case 'ERROR':
        case 'CANCELED':
            return 'pre-flow';
        case 'MT_REVIEW':
            return 'mt-review';
        case 'QA':
            return 'qa-flow';
        case 'QA_REVIEW':
            return 'qa-review';
        case 'POST_EDIT':
            return 'post-edit-flow';
        case 'POST_EDIT_REVIEW':
            return 'post-edit-review';
        case 'SIGN_OFF':
        case 'COMPLETED':
            return 'signoff';
    }
}

export function getStageWorkflowPanelTab(
    stage: TranslationStage
): Extract<TranslationProcessTab, 'pre-flow' | 'qa-flow' | 'post-edit-flow'> | null {
    switch (stage) {
        case 'NOT_STARTED':
        case 'MT':
        case 'MT_REVIEW':
        case 'ERROR':
        case 'CANCELED':
            return 'pre-flow';
        case 'QA':
        case 'QA_REVIEW':
            return 'qa-flow';
        case 'POST_EDIT':
        case 'POST_EDIT_REVIEW':
            return 'post-edit-flow';
        case 'SIGN_OFF':
        case 'COMPLETED':
            return null;
    }
}

type TranslationProcessPanelProps = {
    panelTab: TranslationProcessTab;
    onPanelTabChange: (tab: TranslationProcessTab) => void;
};

export const TranslationProcessPanel: React.FC<TranslationProcessPanelProps> = ({
    panelTab,
    onPanelTabChange,
}) => {
    const t = useTranslations('IDE.translationPanel');
    const { currentStage } = useTranslationState();
    const isPERunning = useAgentWorkflowSteps(state => state.isPERunning);
    const previousStageRef = useRef<TranslationStage | null>(null);

    // The lower workbench follows the actual translation state. Automatic
    // stages open their complete flow canvas; review stages open their review
    // surface instead of a status-card placeholder.
    useEffect(() => {
        if (currentStage === previousStageRef.current) return;
        previousStageRef.current = currentStage;
        onPanelTabChange(getStageDefaultPanelTab(currentStage));
    }, [currentStage, onPanelTabChange]);

    useEffect(() => {
        if (isPERunning) onPanelTabChange('post-edit-flow');
    }, [isPERunning, onPanelTabChange]);

    return (
        <WorkflowPromptProvider>
            <Tabs
                value={panelTab}
                onValueChange={value => {
                    if (translationProcessTabs.has(value as TranslationProcessTab)) {
                        onPanelTabChange(value as TranslationProcessTab);
                    }
                }}
                className="flex size-full min-h-0 flex-col"
            >
                <div className="relative z-10 shrink-0 border-b bg-muted/20 px-2">
                    <TabsList className="h-9 w-full justify-start gap-0.5 overflow-x-auto rounded-none bg-transparent p-0">
                        <TabsTrigger value="pre-flow" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('preWorkflow')}
                        </TabsTrigger>
                        <TabsTrigger value="mt-review" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('mtReview')}
                        </TabsTrigger>
                        <TabsTrigger value="qa-flow" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('qaWorkflow')}
                        </TabsTrigger>
                        <TabsTrigger value="qa-review" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('qaReview')}
                        </TabsTrigger>
                        <TabsTrigger value="post-edit-flow" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('postEditWorkflow')}
                        </TabsTrigger>
                        <TabsTrigger value="post-edit-review" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('postEditReview')}
                        </TabsTrigger>
                        <TabsTrigger value="signoff" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('signoff')}
                        </TabsTrigger>
                        <TabsTrigger value="output" className="shrink-0 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                            {t('outputLog')}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="pre-flow" className="m-0 min-h-0 flex-1 overflow-hidden p-1">
                    <MTWorkflowPanel />
                </TabsContent>
                <TabsContent value="mt-review" className="m-0 min-h-0 flex-1 overflow-auto p-2">
                    <MtReviewPanel />
                </TabsContent>
                <TabsContent value="qa-flow" className="m-0 min-h-0 flex-1 overflow-hidden p-1">
                    <QAWorkflowPanel />
                </TabsContent>
                <TabsContent value="qa-review" className="m-0 min-h-0 flex-1 overflow-auto p-2">
                    <QaReviewPanel />
                </TabsContent>
                <TabsContent value="post-edit-flow" className="m-0 min-h-0 flex-1 overflow-hidden p-1">
                    <PostEditWorkflowPanel />
                </TabsContent>
                <TabsContent value="post-edit-review" className="m-0 min-h-0 flex-1 overflow-auto p-2">
                    <PostEditPanel />
                </TabsContent>
                <TabsContent value="signoff" className="m-0 min-h-0 flex-1 overflow-auto">
                    <SignoffPanel />
                </TabsContent>
                <TabsContent value="output" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <LoggingPanel />
                </TabsContent>
            </Tabs>
        </WorkflowPromptProvider>
    );
};
