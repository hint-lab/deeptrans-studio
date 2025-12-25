'use client';
import { useRightPanel } from '@/hooks/useRightPanel';
import { useSidebar } from '@/hooks/useSidebar';
import { createLogger } from '@/lib/logger';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import React, { useEffect, useRef } from 'react';
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
function IDELayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('IDE');
    const { data: session, status, update } = useSession();
    const params = useParams();
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const { mode } = useRightPanel();
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
    const logger = createLogger({
        type: 'client:ide-layout',
    }, {
        json: false,// 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    });
    useEffect(() => {
        logger.debug('IDE Client session 状态:', status, "IDE Client session 当前时间:", new Date().toLocaleString(), "IDE Client session 过期时间:", session?.expires ? new Date(session.expires).toLocaleString() : "未设置");
    }, [session, status]);
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // 页面变为可见，检查session
                if (status !== "authenticated") {
                    update();
                    logger.debug('IDE Client session update状态:', status, "IDE Client session update过期时间:", session);
                }

            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [update]);
    // 动态计算布局
    const getLayoutSizes = () => {
        if (mode === 'none') {
            // 没有右侧面板时
            return isSidebarOpen ? [15, 85] : [0, 100];
        } else {
            // 有右侧面板时
            return isSidebarOpen ? [15, 60, 25] : [0, 75, 25];
        }
    };

    const layoutSizes = getLayoutSizes();

    // 当sidebar状态改变时，同步ResizablePanel的状态
    useEffect(() => {
        if (sidebarPanelRef.current) {
            const newSize = layoutSizes[0] || 0;
            sidebarPanelRef.current.resize(newSize);
        }
    }, [isSidebarOpen, layoutSizes]);

    return (
        <div className="fixed inset-0 bg-secondary">
            {/* Menu */}
            <div className="z-60 fixed left-0 right-0 top-0 h-10 pr-10">
                <Menu />
            </div>
            {/* IDE */}
            <div className="fixed bottom-6 left-0 top-10 z-40 mt-1 w-full bg-secondary xl:pr-8">
                <ResizablePanelGroup
                    direction="horizontal"
                    onLayout={sizes => {
                        document.cookie = `react-resizable-panels:layout=${JSON.stringify(sizes)}`;
                    }}
                    className="size-full items-stretch"
                >
                    {/* 左侧 Explorer 面板 */}
                    <ResizablePanel
                        ref={sidebarPanelRef}
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
                                key={mode}
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
    );
}
export default IDELayout;
// export default withSplashScreen(IDELayout);

// export default withSplashScreen(IDELayout);
