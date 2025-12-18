'use client';

import React, { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { useTranslationState } from '@/hooks/useTranslation';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import MTWorkflowPanel from './panels/workflow-diagram/MTWorkflowPanel';
import QAWorkflowPanel from './panels/workflow-diagram/QAWorkflowPanel';
import PostEditWorkflowPanel from './panels/workflow-diagram/PostEditWorkflowPanel';
import MtReviewPanel from './panels/mt-review';
import QaReviewPanel from './panels/qa-review';
import PostEditPanel from './panels/post-edit';
import SignoffPanel from './panels/signoff';
import LoggingPanel from './panels/logging';

interface TranslationProcessPanelProps {
    panelTab: string;
    setPanelTab: (value: string) => void;
    projectId: string;
}

export const TranslationProcessPanel: React.FC<TranslationProcessPanelProps> = ({
    panelTab,
    setPanelTab,
    projectId,
}) => {
    const t = useTranslations('IDE.translationPanel');
    const { currentStage } = useTranslationState();
    const isPERunning = useAgentWorkflowSteps(s => s.isPERunning);

    // 监听 currentStage 变化，自动切换对应的标签页
    useEffect(() => {
        const stageToTabMap: Record<string, string> = {
            NOT_STARTED: 'pre-flow',
            MT: 'pre-flow',
            MT_REVIEW: 'mt-review',
            QA: 'qa-flow',
            QA_REVIEW: 'qa-review',
            POST_EDIT: 'post-edit-flow',
            POST_EDIT_REVIEW: 'post-edit-review',
            SIGN_OFF: 'signoff',
            COMPLETED: 'signoff',
        };

        console.log('TranslationProcessPanel: currentStage changed to:', currentStage);
        console.log('TranslationProcessPanel: current panelTab:', panelTab);

        if (currentStage && stageToTabMap[currentStage]) {
            const targetTab = stageToTabMap[currentStage];
            console.log('TranslationProcessPanel: should switch to tab:', targetTab);
            if (panelTab !== targetTab) {
                console.log(
                    'TranslationProcessPanel: switching tab from',
                    panelTab,
                    'to',
                    targetTab
                );
                setPanelTab(targetTab);
            }
        }
    }, [currentStage, panelTab, setPanelTab]);

    // 监听 PE 工作流运行状态，自动切换到译后工作流标签页
    useEffect(() => {
        if (isPERunning && panelTab !== 'post-edit-flow') {
            console.log('TranslationProcessPanel: PE running, switching to post-edit-flow');
            setPanelTab('post-edit-flow');
        }
    }, [isPERunning, panelTab, setPanelTab]);

    return (
        <Tabs value={panelTab} onValueChange={setPanelTab} className="flex h-full flex-col pb-12">
            <div className="relative z-10 border-b bg-muted/20 px-2">
                <TabsList className="pointer-events-auto h-9 bg-transparent">
                    <TabsTrigger value="pre-flow" className="text-xs">
                        {t('preWorkflow')}
                    </TabsTrigger>
                    <TabsTrigger value="mt-review" className="text-xs">
                        {t('mtReview')}
                    </TabsTrigger>
                    <TabsTrigger value="qa-flow" className="text-xs">
                        {t('qaWorkflow')}
                    </TabsTrigger>
                    <TabsTrigger value="qa-review" className="text-xs">
                        {t('qaReview')}
                    </TabsTrigger>
                    <TabsTrigger value="post-edit-flow" className="text-xs">
                        {t('postEditWorkflow')}
                    </TabsTrigger>
                    <TabsTrigger value="post-edit-review" className="text-xs">
                        {t('postEditReview')}
                    </TabsTrigger>
                    <TabsTrigger value="signoff" className="text-xs">
                        {t('signoff')}
                    </TabsTrigger>
                    <TabsTrigger value="output" className="text-xs">
                        {t('outputLog')}
                    </TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="pre-flow" className="m-1 flex-1 p-1">
                <MTWorkflowPanel />
            </TabsContent>
            <TabsContent value="mt-review" className="my-1 size-full flex-1">
                <MtReviewPanel />
            </TabsContent>
            <TabsContent value="qa-flow" className="m-0 flex-1 p-0">
                <QAWorkflowPanel />
            </TabsContent>
            <TabsContent value="qa-review" className="my-1 size-full flex-1">
                <QaReviewPanel />
            </TabsContent>
            <TabsContent value="post-edit-flow" className="m-0 flex-1 p-0">
                <PostEditWorkflowPanel />
            </TabsContent>
            <TabsContent value="post-edit-review" className="my-1 h-full flex-1">
                <PostEditPanel />
            </TabsContent>
            <TabsContent value="signoff" className="m-0 flex-1 overflow-auto p-0">
                <SignoffPanel />
            </TabsContent>
            <TabsContent value="output" className="m-0 flex-1 overflow-auto p-0">
                <LoggingPanel logs={[]} onClear={() => {}} />
            </TabsContent>
        </Tabs>
    );
};
