import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";
import { cn } from '@/lib/utils';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SignoffMenu({
  isRunning,
  canSignoff,
  onSignoffCurrent,
  onBatchSignoff,
}: {
  isRunning: boolean;
  canSignoff: boolean;
  onSignoffCurrent: () => void | Promise<void>;
  onBatchSignoff: () => void | Promise<void>;
}) {
  const t = useTranslations('IDE.menus.signoff');
  return (
    <MenubarMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <MenubarTrigger
                className={cn(
                  "w-12 xl:w-36 relative px-2 py-2 md:px-4 md:py-3 font-medium transition-all duration-200 justify-center cursor-pointer",
                  "before:absolute before:bottom-0 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0.5 before:bg-blue-600 before:transition-all hover:before:w-4/5",
                  "after:absolute after:inset-0 after:bg-transparent hover:after:bg-blue-50/50 dark:hover:after:bg-blue-900/20 after:transition-colors",
                  "text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400",
                )}
                aria-label={t('label')}
                // 禁用悬停显示下拉菜单
                onMouseEnter={(e) => e.stopPropagation()}
              >
                <span className="relative z-10 flex items-center gap-1">
                  <BadgeCheck className="h-4 w-4 shrink-0 flex-none" />
                  <span className="hidden xl:inline text-sm whitespace-nowrap">{t('label')}</span>
                </span>
              </MenubarTrigger>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            <p className="text-sm font-medium">{t('label')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('toolTip') || "执行签发操作，仅处理处于译后编辑状态的分段。"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <MenubarContent>
        <MenubarItem 
          onClick={() => onSignoffCurrent?.()} 
          disabled={isRunning || !canSignoff}
          className="cursor-pointer"
        >
          {t('signoffCurrent')}
        </MenubarItem>
        <MenubarItem 
          onClick={() => onBatchSignoff?.()} 
          disabled={isRunning || !canSignoff}
          className="cursor-pointer"
        >
          <span>{t('batchSignoff')}</span>
          <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400">⌘⇧S</span>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

export default SignoffMenu;