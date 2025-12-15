// 预翻译菜单组件
import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/icons";
import { BookText } from "lucide-react";
import { useTranslationLanguage } from "@/hooks/useTranslation";
import { useEffect } from "react";
import { useTranslations } from 'next-intl';
interface TranslateMenuProps {
    isTranslating: boolean;
    onTranslate: (service: string) => void;
    onBatchTranslate?: () => void;
    progressPercent?: number;
}

export function TranslateMenu({ isTranslating, onTranslate, onBatchTranslate, progressPercent }: TranslateMenuProps) {
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();
    const t = useTranslations('IDE.menus.translate');
    useEffect(() => {
        // console.log(sourceLanguage, targetLanguage);
    }, [sourceLanguage, targetLanguage]);
    return (
        <MenubarMenu>
            <MenubarTrigger className={cn(
                "w-12 xl:w-36 relative px-2 py-2 md:px-4 md:py-3 font-medium transition-all duration-200 justify-center",
                "before:absolute before:bottom-0 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0.5 before:bg-indigo-500 before:transition-all hover:before:w-4/5",
                "after:absolute after:inset-0 after:bg-transparent hover:after:bg-indigo-50/50 dark:hover:after:bg-indigo-900/20 after:transition-colors",
                isTranslating
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400"
            )} aria-label={t('label')}>
                <span className="relative z-10 flex items-center gap-1">
                    <BookText className="h-4 w-4 shrink-0 flex-none" />
                    <span className="hidden xl:inline text-sm whitespace-nowrap">{`${t('label')}${isTranslating && typeof progressPercent === 'number' ? ` ${Math.min(100, Math.max(0, Math.round(progressPercent)))}%` : ''}`}</span>
                </span>
                {isTranslating && (
                    <span className="absolute bottom-0 left-0 h-0.5 w-full bg-indigo-500 animate-progress"></span>
                )}
            </MenubarTrigger>
            <MenubarContent className="animate-in zoom-in-90 duration-200">
                {/* <MenubarItem
                    onClick={() => onTranslate('deepLx')}
                    disabled={isTranslating}
                >
                    {isTranslating ? (
                        <div className="flex items-center gap-2">
                            <span className="font-medium">翻译中</span>
                            <Icons.spinner className="animate-spin text-indigo-500" />
                        </div>
                    ) : (
                        "快速翻译"
                    )}
                </MenubarItem> */}
                <MenubarItem
                    onClick={() => onTranslate('openai')}
                    disabled={isTranslating}
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
                    disabled={isTranslating}
                >
                    <span>{t('batchTranslation')}</span>
                    <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400">⌘B</span>
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
                "flex items-center px-3 py-2 text-sm relative overflow-hidden",
                "transition-all duration-200 ease-in-out",
                isTranslating
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 cursor-not-allowed"
                    : "text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer active:scale-[0.98]"
            )}
            disabled={isTranslating}
            onClick={onTranslate}
        >
            {isTranslating ? (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{t('translating')}</span>
                    <Icons.spinner className="animate-spin text-indigo-500" />
                    <span className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 animate-progress"></span>
                </div>
            ) : (
                <div className="flex justify-between items-center gap-2 relative group">
                    <span className="pr-6">{t('quickTranslation')}</span>
                    <span className="absolute right-2 scale-0 group-hover:scale-100 transition-transform origin-left text-indigo-500">
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
                "flex items-center px-3 py-2 text-sm relative overflow-hidden",
                "transition-all duration-200 ease-in-out",
                isTranslating
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 cursor-not-allowed"
                    : "text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer active:scale-[0.98]"
            )}
            disabled={isTranslating}
            onClick={onTranslate}
        >
            {isTranslating ? (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{t('translating')}</span>
                    <Icons.spinner className="animate-spin text-indigo-500" />
                    <span className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 animate-progress"></span>
                </div>
            ) : (
                <div className="flex items-center gap-2 relative group">
                    <span className="pr-6">{t('deepTranslation')}</span>
                    <span className="absolute right-2 scale-0 group-hover:scale-100 transition-transform origin-left text-indigo-500">
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
        <MenubarItem className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors active:scale-[0.98]">
            <span>{t('batchTranslation')}</span>
            <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400 transition-colors">⌘B</span>
        </MenubarItem>
    );
}

export function ImportGlossaryMenuItem() {
    const t = useTranslations('IDE.menus.translate');
    return (
        <MenubarItem className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors active:scale-[0.98]">
            {t('importGlossary')}
        </MenubarItem>
    );
}