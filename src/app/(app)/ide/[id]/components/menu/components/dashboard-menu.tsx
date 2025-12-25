import { MenubarMenu, MenubarTrigger, MenubarItem } from '@/components/ui/menubar';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function DashboardMenu() {
    const t = useTranslations('IDE.menu');
    const router = useRouter();
    return (
        <MenubarMenu>
            <MenubarTrigger
                onClick={() => {
                    router.push(`/dashboard`);
                }}
            >
                <span className="flex cursor-pointer items-center gap-2 whitespace-nowrap hover:opacity-90">
                    {t('dashboard')}
                </span>
            </MenubarTrigger>
        </MenubarMenu>
    );
}
