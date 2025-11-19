"use client";
import { Menu } from "./components/menu";
import RightSidebar from "./components/right-sidebar";
import ExplorerView from "./components/explorer";
import Footer from "./components/footer";
import { CardsChat } from "./components/chat";
import PreviewCard from "./components/preview";
import HelpPanel from "./components/help-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "src/components/ui/resizable";
import { cn } from "src/lib/utils";
import ParallelEditor from "./components/parallel-editor";
import React, { useState, useEffect, useRef } from "react";
import { useSidebar } from "@/hooks/useSidebar";
import { useRightPanel } from "@/hooks/useRightPanel";
import { useBottomPanel } from "@/hooks/useBottomPanel";
import { useParams } from "next/navigation";
import { useTranslationState } from '@/hooks/useTranslation';
import { useTranslations } from 'next-intl';
import { ImperativePanelHandle } from "react-resizable-panels";

function IDELayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('IDE');
  const params = useParams();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  const { mode } = useRightPanel();
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

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
      <div className="fixed top-0 left-0 right-0 h-10 z-60 pr-10">
        <Menu />
      </div>
      {/* IDE */}
      <div className="fixed top-10 mt-1 left-0 xl:pr-8 w-full z-40 bg-secondary bottom-6">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes) => {
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
            className={cn("flex bg-background rounded-tr-md")}
          >
            <ExplorerView
              projectId={params.id as string}
            />
          </ResizablePanel>

          <ResizableHandle className="bg-secondary w-1" />

          {/* 中间主编辑区域 */}
          <ResizablePanel
            defaultSize={layoutSizes[1]}
            minSize={40}
            maxSize={mode === 'none' ? 100 : 80}
            className={cn("flex bg-background size-full rounded-t-md")}
          >
            <ParallelEditor />
          </ResizablePanel>

          {/* 右侧面板（Chat/Preview） */}
          {mode !== 'none' && (
            <>
              <ResizableHandle className="bg-secondary w-1" />
              <ResizablePanel
                key={mode}
                defaultSize={layoutSizes[2]}
                collapsedSize={5}
                collapsible={true}
                minSize={15}
                maxSize={40}
                className="flex bg-background rounded-tl-md"
              >
                {mode === 'chat' ? <CardsChat /> : null}
                {mode === 'preview' ? <PreviewCard /> : null}
                {mode === 'help' ? <HelpPanel /> : null}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div >

      {/* Footer */}
      < div className="fixed h-6 bottom-0 w-full z-40 bg-secondary rounded-t-md" >
        <Footer />
      </div >
      {/* RightSidebar - 始终显示 */}
      <div className="fixed inset-y-0 right-0 w-8 z-40 bg-background rounded-t-md hidden xl:block">
        <RightSidebar />
      </div>
    </div >
  );
}
export default IDELayout;
// export default withSplashScreen(IDELayout);

// export default withSplashScreen(IDELayout);
