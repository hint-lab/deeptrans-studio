'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Coffee } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function BatchProgressDialog({
    open,
    onOpenChange,
    percent,
    onCancel,
    title,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    jobId: string | undefined;
    percent: number | undefined;
    onCancel: () => void;
    title?: string;
}) {
    const t = useTranslations('IDE.menus.batchProgress');
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)));

    return (
        <Dialog
            open={open}
            onOpenChange={nextOpen => {
                if (!nextOpen && open) {
                    onCancel();
                    return;
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title || t('defaultTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-foreground/70">
                        <span>{t('progress')}</span>
                        <span className="ml-auto font-mono">{p}%</span>
                    </div>
                    <Progress value={p} />
                    <div className="flex items-center justify-center py-2">
                        <div className="flex items-center gap-2 text-foreground/70">
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                            <Coffee className="h-6 w-6" />
                            <span>{t('waitMessage')}</span>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={onCancel}>
                            {t('cancel')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default BatchProgressDialog;
