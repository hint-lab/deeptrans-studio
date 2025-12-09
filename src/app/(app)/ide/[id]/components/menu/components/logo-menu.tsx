import Image from "next/image";
import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarShortcut } from "@/components/ui/menubar";
import { useTranslations } from 'next-intl';
import { useState } from "react";
import { AboutDialog } from "../../about-dialog";
import { PreferencesDialog } from "../../preferences-dialog";

interface LogoMenuProps {
    logoSrc: string;
}

export function LogoMenu({ logoSrc }: LogoMenuProps) {
    const t = useTranslations('IDE.menus.logo');
    const [aboutOpen, setAboutOpen] = useState(false);
    const [prefOpen, setPrefOpen] = useState(false);
    return (
        <MenubarMenu>
            <MenubarTrigger className="font-bold w-40 cursor-pointer hover:opacity-90">
                <Image
                    src={logoSrc}
                    alt="DeepTrans Studio"
                    width="160"
                    height="64"
                    priority
                    className="shrink-0 flex-none "
                />
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={() => setAboutOpen(true)}>{t('about')}</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setPrefOpen(true)}>{t('preferences')} <MenubarShortcut>⌘,</MenubarShortcut></MenubarItem>
            </MenubarContent>
            <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
            <PreferencesDialog open={prefOpen} onOpenChange={setPrefOpen} />
        </MenubarMenu>
    );
} 