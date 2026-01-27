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
import { useMemo, useState } from 'react';

const logger = createLogger({
    type: 'ide:export-menu',
}, {
    json: false,
    pretty: false,
    colors: true,
    includeCaller: false,
});

// 定义允许导出的状态列表
// 使用 Set 可以将查询复杂度降低到 O(1)，虽然对于短列表来说与 Array 差异不大，但语义更清晰
const EXPORTABLE_STATUSES = new Set([
    'MT_REVIEW',
    'QA_REVIEW',
    'POST_EDIT',
    'POST_EDIT_REVIEW',
    'SIGN_OFF',
    'COMPLETED'
]);

export function ExportMenu() {
    const t = useTranslations('IDE.menus.export');
    const { explorerTabs } = useExplorerTabs();
    const { activeDocumentItem } = useActiveDocumentItem();
    const [layout, setLayout] = useState<'vertical' | 'horizontal'>('horizontal');

    // 使用 useMemo 优化计算逻辑，避免非相关渲染时的重复计算
    const { canExport, docId } = useMemo(() => {
        const tabs = explorerTabs?.documentTabs ?? [];
        const aid = (activeDocumentItem as any)?.id;

        // 找到当前激活的文档 Tab
        const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
        const items: any[] = (currentTab?.items ?? []) as any[];
        const docId = (currentTab as any)?.id || '';

        // 核心逻辑修改：检查段落是否非空，且所有段落的状态都在允许列表中
        const canExport = items.length > 0 && items.every((it: any) =>
            EXPORTABLE_STATUSES.has(it.status)
        );

        logger.debug('canExport:' + canExport + ', 段落个数:' + items.length, 'docId:' + docId);

        return { canExport, docId };
    }, [explorerTabs, activeDocumentItem]);

    // 生成导出链接的辅助函数
    const getExportLink = (type: 'markdown' | 'word', mode: 'bilingual' | 'target') => {
        if (!canExport || !docId) return '#';

        const baseUrl = `/api/export/${type}?documentId=${encodeURIComponent(docId)}&mode=${mode}`;
        // 双语模式需要附加布局参数
        return mode === 'bilingual' ? `${baseUrl}&layout=${layout}` : baseUrl;
    };

    return (
        <MenubarMenu>
            <MenubarTrigger>
                <span className="flex cursor-pointer items-center gap-2 whitespace-nowrap hover:opacity-90">
                    {t('label')}
                </span>
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem asChild disabled={!canExport}>
                    <a href={getExportLink('markdown', 'bilingual')}>
                        {t('bilingualMarkdown')}
                    </a>
                </MenubarItem>
                <MenubarItem asChild disabled={!canExport}>
                    <a href={getExportLink('markdown', 'target')}>
                        {t('targetOnlyMarkdown')}
                    </a>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem asChild disabled={!canExport}>
                    <a href={getExportLink('word', 'bilingual')}>
                        {t('bilingualWord')}
                    </a>
                </MenubarItem>
                <MenubarItem asChild disabled={!canExport}>
                    <a href={getExportLink('word', 'target')}>
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