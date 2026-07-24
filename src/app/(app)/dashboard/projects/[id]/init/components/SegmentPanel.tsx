'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { SegmentGranularity } from '@/lib/document-segmentation';
import { Loader2, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type PreviewSegmentItem = {
    type: string;
    sourceText: string;
    order?: number;
    metadata?: any;
};

const GRANULARITY_ORDER: SegmentGranularity[] = ['fine', 'balanced', 'coarse'];

export default function SegmentPanel({
    segItems,
    bodyCount,
    segLoading,
    segError,
    granularity,
    onGranularityChange,
    showFull,
    onShowFullChange,
    busy,
}: {
    segItems: PreviewSegmentItem[];
    bodyCount?: number;
    segLoading: boolean;
    segError: string | null;
    granularity: SegmentGranularity;
    onGranularityChange: (value: SegmentGranularity) => void;
    showFull: boolean;
    onShowFullChange: (value: boolean) => void;
    busy?: boolean;
}) {
    const t = useTranslations('Dashboard.Init');
    const isBusy = !!busy || !!segLoading;
    const bodyItems = segItems.filter(item => String(item.type || '').toUpperCase() !== 'TITLE');
    const averageCharacters = bodyItems.length
        ? Math.round(
              bodyItems.reduce((sum, item) => sum + String(item.sourceText || '').length, 0) /
                  bodyItems.length
          )
        : 0;
    const sliderValue = Math.max(0, GRANULARITY_ORDER.indexOf(granularity));

    return (
        <section className="space-y-2" id="step-segment">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-medium text-muted-foreground">
                        {t('segmentResult')}
                    </div>
                    {!!segItems.length && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                            {t('segmentPreviewStats', {
                                count: Math.max(bodyItems.length, Number(bodyCount || 0)),
                                average: averageCharacters,
                            })}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Label
                        htmlFor="toggle-seg-full"
                        className="whitespace-nowrap text-xs text-muted-foreground"
                    >
                        {t('showFull')}
                    </Label>
                    <Switch
                        id="toggle-seg-full"
                        checked={showFull}
                        disabled={isBusy}
                        onCheckedChange={onShowFullChange}
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 px-2.5"
                                aria-label={t('segmentSettings')}
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                {t('settings')}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80 space-y-4">
                            <div>
                                <div className="text-sm font-medium">{t('segmentSettings')}</div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {t('segmentSettingsDesc')}
                                </div>
                            </div>
                            <Slider
                                aria-label={t('segmentGranularity')}
                                min={0}
                                max={2}
                                step={1}
                                value={[sliderValue]}
                                onValueChange={values => {
                                    const next = GRANULARITY_ORDER[values[0] ?? 1] || 'balanced';
                                    onGranularityChange(next);
                                }}
                            />
                            <div className="grid grid-cols-3 text-[11px] text-muted-foreground">
                                <span>{t('segmentFine')}</span>
                                <span className="text-center">{t('segmentBalanced')}</span>
                                <span className="text-right">{t('segmentCoarse')}</span>
                            </div>
                            <div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
                                {t(`segmentProfile_${granularity}`)}
                            </div>
                            <div className="text-[11px] leading-4 text-muted-foreground">
                                {t('segmentAutoRefresh')}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-white p-4 dark:bg-gray-900">
                {isBusy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> {t('generatingPreview')}
                    </div>
                )}
                {segError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                        {segError}
                    </div>
                )}
                <div className="divide-y rounded border">
                    {segItems.map((item, index) => (
                        <div key={`${item.type}-${index}`} className="p-2 text-sm">
                            <span
                                className={`mr-2 rounded border px-1.5 py-[1px] text-[10px] ${(item.type || '').toUpperCase().startsWith('HEADING') || (item.type || '').toUpperCase() === 'TITLE' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-border bg-muted text-foreground/70'}`}
                            >
                                {item.type}
                            </span>
                            <span className="whitespace-pre-wrap break-words align-top">
                                {String(item.sourceText || '')
                                    .replace(/\<\|\/?\d+\|\>/g, '')
                                    .trim()}
                            </span>
                        </div>
                    ))}
                    {!segItems.length && !segLoading && !segError && (
                        <div className="p-6 text-sm text-muted-foreground">{t('noPreview')}</div>
                    )}
                </div>

                {segItems.length > 0 && !segError && (
                    <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs dark:border-blue-800 dark:bg-blue-900/20">
                        <span className="text-blue-700 dark:text-blue-300">
                            {t('segmentPreviewDoneTip')}
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
}
