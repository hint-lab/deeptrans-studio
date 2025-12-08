"use client";
import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarCheckboxItem } from "@/components/ui/menubar";
import { useRightPanel } from "@/hooks/useRightPanel";
import { useSidebar } from "@/hooks/useSidebar";
import { useBottomPanel } from "@/hooks/useBottomPanel";
import { useState } from "react";
import { useTranslations } from 'next-intl';

export function ViewMenu() {
    const t = useTranslations('IDE.menu');
    const { mode, setMode, toggleChatMode } = useRightPanel() as any;
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const { isBottomPanelOpen, toggleBottomPanel } = useBottomPanel();
    const [open, setOpen] = useState(false);

    return (
        <>
            <MenubarMenu>
                <MenubarTrigger><span className="flex items-center whitespace-nowrap gap-2 cursor-pointer hover:opacity-90">{t('view')}</span></MenubarTrigger>
                <MenubarContent>
                    <MenubarCheckboxItem
                        checked={isSidebarOpen}
                        onCheckedChange={toggleSidebar}
                    >
                        <span>{t('sidebar')}</span>
                    </MenubarCheckboxItem>

                    <MenubarCheckboxItem
                        checked={mode === 'chat'}
                        onCheckedChange={() => toggleChatMode()}
                    >
                        <span>{t('chatPanel')}</span>
                    </MenubarCheckboxItem>


                    <MenubarCheckboxItem
                        checked={isBottomPanelOpen}
                        onCheckedChange={toggleBottomPanel}
                    >
                        <span>{t('bottomPanel')}</span>
                    </MenubarCheckboxItem>
                </MenubarContent>
            </MenubarMenu>
        </>
    );
}