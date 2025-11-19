import { MenubarMenu, MenubarTrigger, MenubarItem } from "@/components/ui/menubar";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';

export function DashboardMenu() {
    const t = useTranslations('IDE.menu');
    const router = useRouter();
    return (
        <MenubarMenu>
            <MenubarTrigger onClick={() => {
                router.push(`/dashboard`);
            }}><span className="flex items-center whitespace-nowrap gap-2">{t('dashboard')}</span></MenubarTrigger>
        </MenubarMenu>
    );
}