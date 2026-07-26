'use client';
import { ProtectedSessionGuard } from '@/components/protected-session-guard';
import { useRightPanel } from '@/hooks/useRightPanel';
import { useSidebar } from '@/hooks/useSidebar';
import { getIDEExplorerPanelSize, getIDELayoutSizes } from '@/lib/ide-layout';
import { useParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef } from 'react';
import { ImperativePanelHandle } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'src/components/ui/resizable';
import { cn } from 'src/lib/utils';
import { CardsChat } from './components/chat';
import ExplorerView from './components/explorer';
import Footer from './components/footer';
import HelpPanel from './components/help-panel';
import { Menu } from './components/menu';
import ParallelEditor from './components/parallel-editor';
import PreviewCard from './components/preview';
import RightSidebar from './components/right-sidebar';
import { WorkspaceGuideProvider } from './components/workspace-guide';

function IDELayout({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const { isSidebarOpen } = useSidebar();
    const { mode } = useRightPanel();
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
    const layoutSizes = useMemo(
        () => getIDELayoutSizes(isSidebarOpen, mode),
        [isSidebarOpen, mode]
    );

    // 只在侧栏开关变化时调整 Explorer；拖拽后的宽度不应被普通渲染重置。
    useEffect(() => {
        sidebarPanelRef.current?.resize(getIDEExplorerPanelSize(isSidebarOpen));
    }, [isSidebarOpen]);

    return (
        <WorkspaceGuideProvider>
            <div className="fixed inset-0 bg-secondary">
            <ProtectedSessionGuard />
            {/* Menu */}
            <div className="z-60 fixed left-0 right-0 top-0 h-10 pr-10">
                <Menu />
            </div>
            {/* IDE */}
            <div className="fixed bottom-6 left-0 top-10 z-40 mt-1 w-full bg-secondary xl:pr-8">
                <ResizablePanelGroup
                    id="ide-workspace-panels"
                    direction="horizontal"
                    onLayout={sizes => {
                        document.cookie = `react-resizable-panels:layout=${JSON.stringify(sizes)}`;
                    }}
                    className="size-full items-stretch"
                >
                    {/* 左侧 Explorer 面板 */}
                    <ResizablePanel
                        ref={sidebarPanelRef}
                        id="ide-explorer-panel"
                        order={1}
                        defaultSize={layoutSizes[0]}
                        collapsedSize={0}
                        collapsible={true}
                        minSize={0}
                        maxSize={30}
                        className={cn('flex rounded-tr-md bg-background')}
                    >
                        <ExplorerView projectId={params.id as string} />
                    </ResizablePanel>

                    <ResizableHandle className="w-1 bg-secondary" />

                    {/* 中间主编辑区域 */}
                    <ResizablePanel
                        id="ide-editor-panel"
                        order={2}
                        defaultSize={layoutSizes[1]}
                        minSize={40}
                        maxSize={mode === 'none' ? 100 : 80}
                        className={cn('flex size-full rounded-t-md bg-background')}
                    >
                        <ParallelEditor />
                    </ResizablePanel>

                    {/* 右侧面板（Chat/Preview） */}
                    {mode !== 'none' && (
                        <>
                            <ResizableHandle className="w-1 bg-secondary" />
                            <ResizablePanel
                                id="ide-right-panel"
                                order={3}
                                defaultSize={layoutSizes[2]}
                                collapsedSize={5}
                                collapsible={true}
                                minSize={15}
                                maxSize={40}
                                className="flex rounded-tl-md bg-background"
                            >
                                {mode === 'chat' ? <CardsChat /> : null}
                                {mode === 'preview' ? <PreviewCard /> : null}
                                {mode === 'help' ? <HelpPanel /> : null}
                            </ResizablePanel>
                        </>
                    )}
                </ResizablePanelGroup>
            </div>

            {/* Footer */}
            <div className="fixed bottom-0 z-40 h-6 w-full rounded-t-md bg-secondary">
                <Footer />
            </div>
            {/* RightSidebar - 始终显示 */}
            <div className="fixed inset-y-0 right-0 z-40 hidden w-8 rounded-t-md bg-background xl:block">
                <RightSidebar />
            </div>
            </div>
        </WorkspaceGuideProvider>
    );
}
export default IDELayout;
// export default withSplashScreen(IDELayout);

// export default withSplashScreen(IDELayout);
