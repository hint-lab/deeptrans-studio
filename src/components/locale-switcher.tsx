'use client';

import { setCookie } from 'cookies-next';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const locales = [
    { code: 'zh', name: '中文', flag: '' },
    { code: 'en', name: 'English', flag: '' },
];

interface LocaleSwitcherProps {
    variant?: 'default' | 'dark-bg';
    iconOnly?: boolean;
}

export default function LocaleSwitcher({
    variant = 'default',
    iconOnly = false,
}: LocaleSwitcherProps) {
    const locale = useLocale();
    const [isPending, startTransition] = useTransition();
    const currentLocale = locales.find(l => l.code === locale);

    function switchTo(nextLocale: string) {
        startTransition(() => {
            setCookie('NEXT_LOCALE', nextLocale, { path: '/' });
            window.location.reload();
        });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-2 text-sm ${
                        variant === 'dark-bg' ? 'text-white hover:bg-white/10 hover:text-white' : ''
                    }`}
                    disabled={isPending}
                >
                    <Languages className="mr-1 h-4 w-4" />
                    {!iconOnly && (
                        <>
                            <span className="hidden sm:inline">{currentLocale?.name}</span>
                            <span className="sm:hidden">{currentLocale?.flag}</span>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
                {locales.map(loc => (
                    <DropdownMenuItem
                        key={loc.code}
                        onClick={() => switchTo(loc.code)}
                        className={`cursor-pointer ${locale === loc.code ? 'bg-accent' : ''}`}
                    >
                        <span className="mr-2">{loc.flag}</span>
                        {loc.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
