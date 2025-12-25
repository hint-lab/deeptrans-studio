import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@/components/ui/menubar';
import { cn } from '@/lib/utils';
import { BadgeCheck, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ReviewMenu({
    isTranslating,
    onApprove,
}: {
    isTranslating: boolean;
    onApprove: () => void;
}) {
    const t = useTranslations('IDE.menus.review');
    return (
        <MenubarMenu>
            <MenubarTrigger
                className={cn(
                    'relative w-12 px-2 py-2 font-medium transition-all duration-200 md:px-4 md:py-3 xl:w-28',
                    'before:absolute before:bottom-0 before:left-1/2 before:h-0.5 before:w-0 before:-translate-x-1/2 before:bg-indigo-500 before:transition-all hover:before:w-4/5',
                    'after:absolute after:inset-0 after:bg-transparent after:transition-colors hover:after:bg-indigo-50/50 dark:hover:after:bg-indigo-900/20',
                    isTranslating
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-700 hover:text-indigo-600 dark:text-gray-200 dark:hover:text-indigo-400'
                )}
                aria-label={t('label')}
            >
                <span className="relative z-10 flex items-center gap-1">
                    <BadgeCheck className="h-4 w-4 flex-none shrink-0" />
                    <span className="hidden whitespace-nowrap text-sm xl:inline">{t('label')}</span>
                </span>
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={() => onApprove()} disabled={isTranslating}>
                    {t('approve')}
                </MenubarItem>
                <MenubarItem
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(
                                new CustomEvent('deeptrans:qa', { detail: { phase: 'all' } })
                            );
                        }
                    }}
                    disabled={isTranslating}
                >
                    <span className="flex items-center gap-1">
                        <RotateCcw className="h-3 w-3" />
                        {t('redoQA')}
                    </span>
                </MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}
