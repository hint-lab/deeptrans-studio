'use client';

import { Moon, Sun } from 'lucide-react';
import UserNavDropDown from './user-nav-dropdown';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes'; // 引入主题钩子
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSidebar } from '@/hooks/useSidebar';
import { SidebarToggle } from '@/components/sidebar-toggle';
import LocaleSwitcher from '@/components/locale-switcher';
import { useTranslations } from 'next-intl';

export default function Header() {
    const t = useTranslations('Dashboard.Header');
    const { theme, setTheme, resolvedTheme } = useTheme(); // 使用 resolvedTheme
    const [mounted, setMounted] = useState(false);
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    useEffect(() => {
        setMounted(true);
    }, []);
    // 等待主题完全解析
    const logoTheme = resolvedTheme || theme;
    if (!mounted) {
        return (
            <div className="z-50 flex size-full items-center justify-between bg-background/95 px-4 backdrop-blur">
                <div className="h-6 w-[50px]" />
                <div className="ml-auto flex items-center space-x-4 px-3">
                    <div className="h-10 w-10" />
                    <UserNavDropDown />
                </div>
            </div>
        );
    }

    return (
        <div className="z-50 flex size-full items-center justify-between bg-background/95 px-4 backdrop-blur">
            <SidebarToggle isOpen={isSidebarOpen} onToggle={toggleSidebar} />
            <Link href="/dashboard">
                <Image
                    alt="Logo"
                    src={logoTheme === 'dark' ? '/logo3_dark.svg' : '/logo3.svg'}
                    width={50}
                    height={20}
                    priority
                    className="h-6 w-auto"
                />
            </Link>
            <div className="ml-auto flex items-center space-x-4 px-3">
                <LocaleSwitcher />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    aria-label={t('toggleTheme')}
                >
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <UserNavDropDown />
            </div>
        </div>
    );
}
