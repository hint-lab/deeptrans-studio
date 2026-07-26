'use client';
import {
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarCheckboxItem,
} from '@/components/ui/menubar';
import { useRightPanel } from '@/hooks/useRightPanel';
import { useSidebar } from '@/hooks/useSidebar';
import { useBottomPanel } from '@/hooks/useBottomPanel';
import { useTranslations } from 'next-intl';

export function ViewMenu() {
    const t = useTranslations('IDE.menu');
    const { mode, setMode } = useRightPanel();
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const { isBottomPanelOpen, setBottomPanelOpen } = useBottomPanel();

    return (
        <>
            <MenubarMenu>
                <MenubarTrigger>
                    <span className="flex cursor-pointer items-center gap-2 whitespace-nowrap hover:opacity-90">
                        {t('view')}
                    </span>
                </MenubarTrigger>
                <MenubarContent>
                    <MenubarCheckboxItem checked={isSidebarOpen} onCheckedChange={toggleSidebar}>
                        <span>{t('sidebar')}</span>
                    </MenubarCheckboxItem>

                    <MenubarCheckboxItem
                        checked={mode === 'chat'}
                        onCheckedChange={checked => setMode(checked ? 'chat' : 'none')}
                        aria-label={t('chatPanel')}
                    >
                        <span>{t('chatPanel')}</span>
                    </MenubarCheckboxItem>

                    <MenubarCheckboxItem
                        checked={mode === 'preview'}
                        onCheckedChange={checked => setMode(checked ? 'preview' : 'none')}
                        aria-label={t('filePreviewPanel')}
                    >
                        <span>{t('filePreviewPanel')}</span>
                    </MenubarCheckboxItem>

                    <MenubarCheckboxItem
                        checked={mode === 'help'}
                        onCheckedChange={checked => setMode(checked ? 'help' : 'none')}
                        aria-label={t('helpPanel')}
                    >
                        <span>{t('helpPanel')}</span>
                    </MenubarCheckboxItem>

                    <MenubarCheckboxItem
                        checked={isBottomPanelOpen}
                        onCheckedChange={setBottomPanelOpen}
                    >
                        <span>{t('bottomPanel')}</span>
                    </MenubarCheckboxItem>
                </MenubarContent>
            </MenubarMenu>
        </>
    );
}
