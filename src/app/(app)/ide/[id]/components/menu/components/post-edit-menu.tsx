import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@/components/ui/menubar';
import { cn } from '@/lib/utils';
import { ClipboardCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PostEditMenu({
    isTranslating,
    canEnter,
    onMarkReviewed,
    onBatchPostEdit,
}: {
    isTranslating: boolean;
    canEnter?: boolean;
    onMarkReviewed?: () => void;
    onBatchPostEdit?: () => void;
}) {
    const t = useTranslations('IDE.menus.postEdit');
    return (
        <MenubarMenu>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
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
                                    <ClipboardCheck className="h-4 w-4 flex-none shrink-0" />
                                    <span className="hidden whitespace-nowrap text-sm xl:inline">
                                        {t('label')}
                                    </span>
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
                            {t('toolTip') || '执行译后编辑操作，仅处理处于质检复核状态的分段。'}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <MenubarContent>
                <MenubarItem
                    onClick={() => onMarkReviewed?.()}
                    disabled={isTranslating || !canEnter}
                    className="cursor-pointer"
                >
                    {t('singlePostEdit')}
                </MenubarItem>
                <MenubarItem
                    onClick={() => onBatchPostEdit?.()}
                    disabled={isTranslating || !canEnter}
                    className="cursor-pointer"
                >
                    <span>{t('batchPostEdit')}</span>
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        ⌘P
                    </span>
                </MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}
