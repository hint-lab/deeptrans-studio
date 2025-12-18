import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@/components/ui/menubar';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function SearchMenu() {
    const t = useTranslations('IDE.menus.search');
    return (
        <MenubarMenu>
            <MenubarTrigger>
                <span className="flex items-center gap-2 whitespace-nowrap">
                    {t('label')}
                    <Search size={16} />
                </span>
            </MenubarTrigger>
        </MenubarMenu>
    );
}
