"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations('IDE.about');
  const tLogo = useTranslations('IDE.menus.logo');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{tLogo('about')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="text-sm text-foreground/80 leading-relaxed space-y-2">
          <p>{t('description')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
