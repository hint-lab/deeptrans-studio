'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationState } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef } from 'react'; // 引入 useRef
import LoggingPanel from './panels/logging';
import MtReviewPanel from './panels/mt-review';
import PostEditPanel from './panels/post-edit';
import QaReviewPanel from './panels/qa-review';
import SignoffPanel from './panels/signoff';
import MTWorkflowPanel from './panels/workflow-diagram/MTWorkflowPanel';
import PostEditWorkflowPanel from './panels/workflow-diagram/PostEditWorkflowPanel';
import QAWorkflowPanel from './panels/workflow-diagram/QAWorkflowPanel';

const logger = createLogger({
    type: 'parallel-editor:translation-process-panel',
}, {
    json: false,
    pretty: false,
    colors: true,
    includeCaller: false,
});

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

    // 使用 ref 记录上一次的 stage，避免重复触发
    const prevStageRef = useRef<string | null>(null);

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

        // 只有当 currentStage 真正发生变化时，才执行切换逻辑
        if (currentStage && currentStage !== prevStageRef.current) {
            logger.info('TranslationProcessPanel: currentStage changed from', prevStageRef.current, 'to', currentStage);

            // 更新 ref
            prevStageRef.current = currentStage;

            if (stageToTabMap[currentStage]) {
                const targetTab = stageToTabMap[currentStage];
                logger.info('TranslationProcessPanel: Auto-switching to tab:', targetTab);
                setPanelTab(targetTab);
            }
        }
    }, [currentStage, setPanelTab]); // 移除 panelTab 依赖，切断循环

    // 监听 PE 工作流运行状态 (这也可能导致跳变，建议也加上类似保护，或者作为特例保留)
    useEffect(() => {
        if (isPERunning && panelTab !== 'post-edit-flow') {
            // 这里是否需要保护取决于业务逻辑：PE运行时是否强制用户看流程图？
            // 如果是，保持原样。如果不是，可以加上类似 prevRunning 的判断。
            // 目前看似合理，因为运行中看流程图比较直观。
            logger.info('TranslationProcessPanel: PE running, switching to post-edit-flow');
            setPanelTab('post-edit-flow');
        }
    }, [isPERunning, panelTab, setPanelTab]);

    return (
        <Tabs value={panelTab} onValueChange={setPanelTab} className="flex h-full flex-col pb-12">
            <div className="relative z-10 border-b bg-muted/20 px-2">
                <TabsList className="pointer-events-auto h-9 bg-transparent">
                    {/* ... TabsTrigger 内容保持不变 ... */}
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

            {/* ... TabsContent 内容保持不变 ... */}
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
                <LoggingPanel logs={[]} onClear={() => { }} />
            </TabsContent>
        </Tabs>
    );
};