'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

export type ShortcutItem = {
    id: string; // i18n key under IDE.shortcuts
    combo: string; // e.g. ⌘B
    description?: string; // Description of the shortcut
};

export function KeyboardShortcutsDialog({
    open,
    onOpenChange,
    items,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    items: ShortcutItem[];
}) {
    const t = useTranslations('IDE.shortcuts');
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    {items.map(({ id, combo }) => (
                        <div key={id} className="flex items-center justify-between text-sm">
                            <div className="text-foreground/80">{t(id)}</div>
                            <Badge
                                variant="secondary"
                                className="px-2 py-0.5 font-mono text-[11px]"
                            >
                                {combo}
                            </Badge>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
