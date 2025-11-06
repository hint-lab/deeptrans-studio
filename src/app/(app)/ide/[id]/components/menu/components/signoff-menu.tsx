import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";
import { cn } from '@/lib/utils';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function SignoffMenu({
  isRunning,
  canSignoffCurrent,
  canBatchSignoff,
  onSignoffCurrent,
  onBatchSignoff,
}: {
  isRunning: boolean;
  canSignoffCurrent: boolean;
  canBatchSignoff: boolean;
  onSignoffCurrent: () => void | Promise<void>;
  onBatchSignoff: () => void | Promise<void>;
}) {
  const t = useTranslations('IDE.menus.signoff');
  return (
    <MenubarMenu>
      <MenubarTrigger
        className={cn(
          "w-12 xl:w-36 relative px-2 py-2 md:px-4 md:py-3 font-medium transition-all duration-200 justify-center",
          "before:absolute before:bottom-0 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0.5 before:bg-blue-600 before:transition-all hover:before:w-4/5",
          "after:absolute after:inset-0 after:bg-transparent hover:after:bg-blue-50/50 dark:hover:after:bg-blue-900/20 after:transition-colors",
          "text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400",
        )}
        aria-label={t('label')}
      >
        <span className="relative z-10 flex items-center gap-1">
          <BadgeCheck className="h-4 w-4 shrink-0 flex-none" />
          <span className="hidden xl:inline text-sm whitespace-nowrap">{t('label')}</span>
        </span>
      </MenubarTrigger>
      <MenubarContent>
        <MenubarItem onClick={() => onSignoffCurrent?.()} disabled={isRunning || !canSignoffCurrent}>{t('signoffCurrent')}</MenubarItem>
        <MenubarItem onClick={() => onBatchSignoff?.()} disabled={isRunning || !canBatchSignoff}>
          <span>{t('batchSignoff')}</span>
          <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400">⌘⇧S</span>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

export default SignoffMenu;


