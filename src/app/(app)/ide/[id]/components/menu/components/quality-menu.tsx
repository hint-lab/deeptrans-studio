import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function QualityMenu({ isTranslating, canQuality, onEvaluate, progressPercent }: { isTranslating: boolean, canQuality: boolean, onEvaluate: (phase: 'single' | 'batch') => void, progressPercent?: number }) {
    const t = useTranslations('IDE.menus.quality');
    return (
        <MenubarMenu>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="relative">
                            <MenubarTrigger 
                                className={cn(
                                    "w-12 xl:w-36 relative px-2 py-2 md:px-4 md:py-3 font-medium transition-all duration-200 justify-center cursor-pointer",
                                    "before:absolute before:bottom-0 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0.5 before:bg-indigo-500 before:transition-all hover:before:w-4/5",
                                    "after:absolute after:inset-0 after:bg-transparent hover:after:bg-indigo-50/50 dark:hover:after:bg-indigo-900/20 after:transition-colors",
                                    isTranslating
                                        ? "text-indigo-600 dark:text-indigo-400"
                                        : "text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400"
                                )} 
                                aria-label={t('label')}
                                // 禁用悬停显示下拉菜单
                                onMouseEnter={(e) => e.stopPropagation()}
                            >
                                <span className="relative z-10 flex items-center gap-1">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 flex-none" />
                                    <span className="hidden xl:inline text-sm whitespace-nowrap">{t('label')}{isTranslating && typeof progressPercent === 'number' ? ` ${Math.min(100, Math.max(0, Math.round(progressPercent)))}%` : ''}</span>
                                </span>
                                {isTranslating && (
                                    <span className="absolute bottom-0 left-0 h-0.5 w-full bg-indigo-500 animate-progress"></span>
                                )}
                            </MenubarTrigger>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                        <p className="text-sm font-medium">{t('label')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('toolTip') || "执行质检操作，仅处理处于预翻译复核状态的分段。"}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <MenubarContent>
                <MenubarItem 
                    disabled={isTranslating || !canQuality} 
                    onClick={() => onEvaluate("single")}
                    className="cursor-pointer"
                >
                    {t('singleEvaluation')}
                </MenubarItem>
                <MenubarItem 
                    disabled={isTranslating || !canQuality} 
                    onClick={() => onEvaluate("batch")}
                    className="cursor-pointer"
                >
                    <span>{t('batchEvaluation')}</span>
                    <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400">⌘E</span>
                </MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}