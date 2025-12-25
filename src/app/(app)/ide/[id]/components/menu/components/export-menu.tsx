'use client';
import {
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarRadioGroup,
    MenubarRadioItem,
    MenubarSeparator,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
} from '@/components/ui/menubar';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { createLogger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
const logger = createLogger({
    type: 'ide:export-menu',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
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
    const docId = (currentTab as any)?.id || '';
    logger.debug('canExport:' + canExport + ',段落个数:' + items.length, 'docId:' + docId);
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
