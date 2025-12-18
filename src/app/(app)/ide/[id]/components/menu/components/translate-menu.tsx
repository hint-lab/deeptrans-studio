// 预翻译菜单组件
import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@/components/ui/menubar';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import { BookText } from 'lucide-react';
import { useTranslationLanguage } from '@/hooks/useTranslation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
interface TranslateMenuProps {
    isTranslating: boolean;
    canTranslate: boolean;
    onTranslate: (service: string) => void;
    onBatchTranslate?: () => void;
    progressPercent?: number;
}

export function TranslateMenu({
    isTranslating,
    canTranslate,
    onTranslate,
    onBatchTranslate,
    progressPercent,
}: TranslateMenuProps) {
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();
    const t = useTranslations('IDE.menus.translate');

    useEffect(() => {
        // console.log(sourceLanguage, targetLanguage);
    }, [sourceLanguage, targetLanguage]);

    return (
        <MenubarMenu>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        {/* 使用 div 包裹，禁用 MenubarTrigger 的悬停行为 */}
                        <div className="relative">
                            <MenubarTrigger
                                className={cn(
                                    'relative w-12 cursor-pointer justify-center px-2 py-2 font-medium transition-all duration-200 md:px-4 md:py-3 xl:w-36',
                                    'before:absolute before:bottom-0 before:left-1/2 before:h-0.5 before:w-0 before:-translate-x-1/2 before:bg-indigo-500 before:transition-all hover:before:w-4/5',
                                    'after:absolute after:inset-0 after:bg-transparent after:transition-colors hover:after:bg-indigo-50/50 dark:hover:after:bg-indigo-900/20',
                                    isTranslating
                                        ? 'text-indigo-600 dark:text-indigo-400'
                                        : 'text-gray-700 hover:text-indigo-600 dark:text-gray-200 dark:hover:text-indigo-400'
                                )}
                                aria-label={t('label')}
                                // 禁用悬停显示下拉菜单
                                onMouseEnter={e => e.stopPropagation()}
                            >
                                <span className="relative z-10 flex items-center gap-1">
                                    <BookText className="h-4 w-4 flex-none shrink-0" />
                                    <span className="hidden whitespace-nowrap text-sm xl:inline">{`${t('label')}${isTranslating && typeof progressPercent === 'number' ? ` ${Math.min(100, Math.max(0, Math.round(progressPercent)))}%` : ''}`}</span>
                                </span>
                                {isTranslating && (
                                    <span className="absolute bottom-0 left-0 h-0.5 w-full animate-progress bg-indigo-500"></span>
                                )}
                            </MenubarTrigger>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                        <p className="text-sm font-medium">{t('label')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('toolTip') || '执行预翻译操作，仅处理处于未开始状态的分段。'}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <MenubarContent className="duration-200 animate-in zoom-in-90">
                <MenubarItem
                    onClick={() => onTranslate('openai')}
                    disabled={isTranslating || !canTranslate}
                    className="cursor-pointer"
                >
                    {isTranslating ? (
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{t('translating')}</span>
                            <Icons.spinner className="animate-spin text-indigo-500" />
                        </div>
                    ) : (
                        t('singleTranslation')
                    )}
                </MenubarItem>
                <MenubarItem
                    onClick={() => onBatchTranslate?.()}
                    disabled={isTranslating || !canTranslate}
                    className="cursor-pointer"
                >
                    <span>{t('batchTranslation')}</span>
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        ⌘B
                    </span>
                </MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}

interface TranslateMenuItemProps {
    isTranslating: boolean;
    onTranslate: () => void;
}

export function TranslateSubMenuItem({ isTranslating, onTranslate }: TranslateMenuItemProps) {
    const t = useTranslations('IDE.menus.translate');
    return (
        <MenubarItem
            className={cn(
                'relative flex cursor-pointer items-center overflow-hidden px-3 py-2 text-sm',
                'transition-all duration-200 ease-in-out',
                isTranslating
                    ? 'cursor-not-allowed bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                    : 'cursor-pointer text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:scale-[0.98] dark:text-gray-200 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400'
            )}
            disabled={isTranslating}
            onClick={onTranslate}
        >
            {isTranslating ? (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{t('translating')}</span>
                    <Icons.spinner className="animate-spin text-indigo-500" />
                    <span className="absolute bottom-0 left-0 h-0.5 animate-progress bg-indigo-500"></span>
                </div>
            ) : (
                <div className="group relative flex items-center justify-between gap-2">
                    <span className="pr-6">{t('quickTranslation')}</span>
                    <span className="absolute right-2 origin-left scale-0 text-indigo-500 transition-transform group-hover:scale-100">
                        →
                    </span>
                </div>
            )}
        </MenubarItem>
    );
}

export function DeepTranslateSubMenuItem({ isTranslating, onTranslate }: TranslateMenuItemProps) {
    const t = useTranslations('IDE.menus.translate');
    return (
        <MenubarItem
            className={cn(
                'relative flex cursor-pointer items-center overflow-hidden px-3 py-2 text-sm',
                'transition-all duration-200 ease-in-out',
                isTranslating
                    ? 'cursor-not-allowed bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                    : 'cursor-pointer text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:scale-[0.98] dark:text-gray-200 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400'
            )}
            disabled={isTranslating}
            onClick={onTranslate}
        >
            {isTranslating ? (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{t('translating')}</span>
                    <Icons.spinner className="animate-spin text-indigo-500" />
                    <span className="absolute bottom-0 left-0 h-0.5 animate-progress bg-indigo-500"></span>
                </div>
            ) : (
                <div className="group relative flex items-center gap-2">
                    <span className="pr-6">{t('deepTranslation')}</span>
                    <span className="absolute right-2 origin-left scale-0 text-indigo-500 transition-transform group-hover:scale-100">
                        →
                    </span>
                </div>
            )}
        </MenubarItem>
    );
}

export function BatchTranslateSubMenuItem() {
    const t = useTranslations('IDE.menus.translate');
    return (
        <MenubarItem className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600 active:scale-[0.98] dark:text-gray-200 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400">
            <span>{t('batchTranslation')}</span>
            <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 transition-colors dark:bg-gray-700 dark:text-gray-400">
                ⌘B
            </span>
        </MenubarItem>
    );
}

export function ImportGlossaryMenuItem() {
    const t = useTranslations('IDE.menus.translate');
    return (
        <MenubarItem className="flex cursor-pointer items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600 active:scale-[0.98] dark:text-gray-200 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400">
            {t('importGlossary')}
        </MenubarItem>
    );
}
