import Image from 'next/image';
import {
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarItem,
    MenubarSeparator,
    MenubarShortcut,
} from '@/components/ui/menubar';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AboutDialog } from '../../about-dialog';
import { PreferencesDialog } from '../../preferences-dialog';

interface LogoMenuProps {
    logoSrc: string;
    compact?: boolean;
}

export function LogoMenu({ logoSrc, compact = false }: LogoMenuProps) {
    const t = useTranslations('IDE.menus.logo');
    const [aboutOpen, setAboutOpen] = useState(false);
    const [prefOpen, setPrefOpen] = useState(false);
    const currentLogoSrc = compact ? '/deeptrans_icon.svg' : logoSrc;

    return (
        <MenubarMenu>
            <MenubarTrigger
                className={`cursor-pointer font-bold hover:opacity-90 ${compact ? 'w-10 justify-center px-1' : 'w-40'}`}
            >
                <Image
                    src={currentLogoSrc}
                    alt="DeepTrans Studio"
                    width={compact ? 28 : 160}
                    height={compact ? 28 : 64}
                    priority
                    className={compact ? 'h-7 w-7 flex-none shrink-0' : 'flex-none shrink-0'}
                />
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={() => setAboutOpen(true)}>{t('about')}</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setPrefOpen(true)}>
                    {t('preferences')} <MenubarShortcut>⌘,</MenubarShortcut>
                </MenubarItem>
            </MenubarContent>
            <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
            <PreferencesDialog open={prefOpen} onOpenChange={setPrefOpen} />
        </MenubarMenu>
    );
}
