'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

export function PreferencesDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const tLogo = useTranslations('IDE.menus.logo');
    const tShort = useTranslations('IDE.shortcuts');
    const safeShort = (key: string) => {
        try {
            const value = tShort(key as any);
            if (value) return value;
        } catch {}
        return key;
    };
    const shortcuts = [
        { id: 'batchTranslate', combo: '⌘B' },
        { id: 'batchEvaluate', combo: '⌘E' },
        { id: 'batchPostEdit', combo: '⌘P' },
        { id: 'batchSignoff', combo: '⌘⇧S' },
        { id: 'openShortcuts', combo: '⌘/' },
        { id: 'rollback', combo: '⌘[' },
        { id: 'advance', combo: '⌘]' },
    ];
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{tLogo('preferences')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label>{safeShort('title')}</Label>
                        <div className="space-y-2 rounded-md border p-3 text-sm">
                            {shortcuts.map(it => (
                                <div key={it.id} className="flex items-center justify-between">
                                    <span>{safeShort(it.id)}</span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {it.combo}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
