'use client';
import {
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarItem,
    MenubarSeparator,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarRadioGroup,
    MenubarRadioItem,
} from '@/components/ui/menubar';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { cn } from '@/lib/utils';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ExportMenu() {
    const t = useTranslations('IDE.menus.export');
    const { explorerTabs } = useExplorerTabs();
    const { activeDocumentItem } = useActiveDocumentItem();
    const [layout, setLayout] = useState<'vertical' | 'horizontal'>('horizontal');
    const tabs = explorerTabs?.documentTabs ?? [];
    const aid = (activeDocumentItem as any)?.id;
    const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
    const items: any[] = (currentTab?.items ?? []) as any[];
    const canExport = items.length > 0 && items.every((it: any) => it.status === 'COMPLETED');
    console.log('canExport:' + canExport + ',' + items.length);
    const docId = (currentTab as any)?.id || '';
    console.log('docId:' + docId);
    return (
        <MenubarMenu>
            <MenubarTrigger>
                <span className="flex cursor-pointer items-center gap-2 whitespace-nowrap hover:opacity-90">
                    {t('label')}
                </span>
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem asChild disabled={!canExport}>
                    <a
                        href={
                            canExport
                                ? `/api/export/markdown?documentId=${encodeURIComponent(docId)}&mode=bilingual&layout=${layout}`
                                : '#'
                        }
                    >
                        {t('bilingualMarkdown')}
                    </a>
                </MenubarItem>
                <MenubarItem asChild disabled={!canExport}>
                    <a
                        href={
                            canExport
                                ? `/api/export/markdown?documentId=${encodeURIComponent(docId)}&mode=target`
                                : '#'
                        }
                    >
                        {t('targetOnlyMarkdown')}
                    </a>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem asChild disabled={!canExport}>
                    <a
                        href={
                            canExport
                                ? `/api/export/word?documentId=${encodeURIComponent(docId)}&mode=bilingual&layout=${layout}`
                                : '#'
                        }
                    >
                        {t('bilingualWord')}
                    </a>
                </MenubarItem>
                <MenubarItem asChild disabled={!canExport}>
                    <a
                        href={
                            canExport
                                ? `/api/export/word?documentId=${encodeURIComponent(docId)}&mode=target`
                                : '#'
                        }
                    >
                        {t('targetOnlyWord')}
                    </a>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                    <MenubarSubTrigger>{t('exportFormat')}</MenubarSubTrigger>
                    <MenubarSubContent>
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                            {t('bilingualLayout')}
                        </div>
                        <MenubarRadioGroup
                            value={layout}
                            onValueChange={v =>
                                setLayout((v as any) === 'vertical' ? 'vertical' : 'horizontal')
                            }
                        >
                            <MenubarRadioItem value="vertical">{t('vertical')}</MenubarRadioItem>
                            <MenubarRadioItem value="horizontal">
                                {t('horizontal')}
                            </MenubarRadioItem>
                        </MenubarRadioGroup>
                    </MenubarSubContent>
                </MenubarSub>
            </MenubarContent>
        </MenubarMenu>
    );
}

export default ExportMenu;
