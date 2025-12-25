'use client';

import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export type PreviewSegmentItem = {
    type: string;
    sourceText: string;
    order?: number;
    metadata?: any;
};

export default function SegmentPanel({
    segItems,
    segLoading,
    segError,
    onResegment,
    busy,
}: {
    segItems: PreviewSegmentItem[];
    segLoading: boolean;
    segError: string | null;
    onResegment: (opts?: { all?: boolean }) => void;
    busy?: boolean;
}) {
    const t = useTranslations('Dashboard.Init');
    const isBusy = !!busy || !!segLoading;
    const [showFull, setShowFull] = useState(false);
    const itemsToShow = showFull ? segItems : segItems.slice(0, 100);
    return (
        <section className="space-y-2" id="step-segment">
            <div className="text-xs font-medium text-muted-foreground">{t('segmentResult')}</div>
            <div className="space-y-3 rounded-lg border bg-white p-4 dark:bg-gray-900">
                <div className="-mt-1 flex items-center justify-end gap-2 px-1">
                    {isBusy && (
                        <div className="flex w-full items-center gap-2 px-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> {t('generatingPreview')}
                        </div>
                    )}
                    <Label
                        htmlFor="toggle-seg-full"
                        className="whitespace-nowrap text-xs text-muted-foreground"
                    >
                        {t('showFull')}
                    </Label>
                    <Switch
                        id="toggle-seg-full"
                        checked={showFull}
                        onCheckedChange={v => {
                            setShowFull(v);
                            onResegment({ all: v });
                        }}
                    />
                </div>

                {segError && <div className="text-xs text-red-500">{segError}</div>}
                <div className="divide-y rounded border">
                    {itemsToShow.map((it, i) => (
                        <div key={i} className="p-2 text-sm">
                            <span
                                className={`mr-2 rounded border px-1.5 py-[1px] text-[10px] ${(it.type || '').toUpperCase().startsWith('HEADING') || (it.type || '').toUpperCase() === 'TITLE' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-border bg-muted text-foreground/70'}`}
                            >
                                {it.type}
                            </span>
                            <span className="whitespace-pre-wrap break-words align-top">
                                {String(it.sourceText || '')
                                    .replace(/\<\|\/?\d+\|\>/g, '')
                                    .trim()}
                            </span>
                        </div>
                    ))}
                    {!segItems.length && !segLoading && (
                        <div className="p-6 text-sm text-muted-foreground">{t('noPreview')}</div>
                    )}
                </div>

                {segItems.length > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs dark:border-blue-800 dark:bg-blue-900/20">
                        <span className="text-blue-700 dark:text-blue-300">
                            ✅ {t('segmentPreviewDoneTip')}
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
}
