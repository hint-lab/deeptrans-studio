'use client';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ThemeToggleProps {
    theme: string | undefined;
    setTheme: (theme: string) => void;
    mounted: boolean;
}

export function ThemeToggle({ theme, setTheme, mounted }: ThemeToggleProps) {
    const t = useTranslations('IDE.menus.theme');
    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" className="gap-2">
                <span className="invisible">
                    <Moon size="16" />
                </span>
            </Button>
        );
    }

    const Icon = theme === 'dark' ? Sun : Moon;

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('toggle')}
            className="gap-2"
        >
            <Icon size="16" />
        </Button>
    );
}
