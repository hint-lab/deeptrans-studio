'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type TermPreviewItem = { term: string; count?: number; score?: number };

export type TermsPanelProps = {
    maxTerms: number;
    setMaxTerms: (value: number) => void;
    chunkSize: number;
    setChunkSize: (value: number) => void;
    overlap: number;
    setOverlap: (value: number) => void;
    termPrompt: string;
    setTermPrompt: (value: string) => void;
    termPreview: TermPreviewItem[];
    termPreviewLoading: boolean;
    termPreviewError: string | null;
    terms: Array<{ term: string; count: number; score?: number }>;
    dict?: Array<{ term: string; translation: string; notes?: string; source?: string }>;
    dictCheckedTerms?: string[];
    autoApplyTerms?: boolean;
    setAutoApplyTerms?: (value: boolean) => void;
    termPct: number;
    starting: boolean;
    onPreview: () => void;
    onViewDictionary?: () => void;
    onApply?: () => Promise<void>;
    applying?: boolean;
    onSkip?: () => void;
};

function formatScore(score?: number): string {
    if (typeof score !== 'number' || !Number.isFinite(score)) return '';
    if (score >= 0 && score <= 1) return `${Math.round(score * 100)}%`;
    return score.toFixed(score >= 10 ? 0 : 1);
}

export default function TermsPanel(props: TermsPanelProps) {
    const {
        maxTerms,
        setMaxTerms,
        chunkSize,
        setChunkSize,
        overlap,
        setOverlap,
        termPrompt,
        setTermPrompt,
        termPreview,
        termPreviewLoading,
        termPreviewError,
        terms,
        autoApplyTerms,
        setAutoApplyTerms,
        termPct,
        starting,
        onPreview,
        onViewDictionary,
        onApply,
        applying,
    } = props;
    const t = useTranslations('Dashboard.Init');
    const [showFull, setShowFull] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const isFinalResult = termPct >= 100;
    const resultTerms: TermPreviewItem[] = isFinalResult ? terms : termPreview;
    // Formal extraction is the reviewable source of truth, so it is always
    // complete. Only the lightweight local preview may be collapsed.
    const showAllTerms = isFinalResult || showFull;
    const visibleTerms = showAllTerms ? resultTerms : resultTerms.slice(0, 20);
    const matchedSet = useMemo(
        () => new Set<string>((props.dict || []).map(entry => String(entry.term || ''))),
        [props.dict]
    );
    const checkedSet = useMemo(
        () => new Set<string>((props.dictCheckedTerms || []).map(term => String(term || ''))),
        [props.dictCheckedTerms]
    );

    const refreshPreview = () => {
        setSettingsOpen(false);
        onPreview();
    };

    return (
        <section className="space-y-3" id="step-terms">
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle className="text-sm">{t('termsTitle')}</CardTitle>
                            <CardDescription>{t('termsDesc')}</CardDescription>
                        </div>
                        {props.onSkip && (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={props.onSkip}
                                disabled={props.starting || props.applying}
                            >
                                {t('skip')}
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <div className="-mt-1 px-6">
                    <div className="relative h-[2px] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                        <div
                            className="absolute left-0 top-0 h-full bg-emerald-400 dark:bg-emerald-500"
                            style={{ width: `${Math.max(0, Math.min(100, termPct))}%` }}
                        />
                    </div>
                </div>
                <CardContent className="space-y-4 pt-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-muted-foreground">
                                {isFinalResult ? t('termsTitle') : t('termsPreviewResult')}
                            </div>
                            {!!resultTerms.length && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                    {isFinalResult
                                        ? t('termsFinalStats', { count: resultTerms.length })
                                        : t('termsPreviewStats', { count: resultTerms.length })}
                                </div>
                            )}
                        </div>
                        <div className={isFinalResult ? 'hidden' : 'flex items-center gap-2'}>
                            <Label
                                htmlFor="toggle-terms-full"
                                className="whitespace-nowrap text-xs text-muted-foreground"
                            >
                                {t('showFull')}
                            </Label>
                            <Switch
                                id="toggle-terms-full"
                                checked={showFull}
                                disabled={termPreviewLoading}
                                onCheckedChange={setShowFull}
                            />
                            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5 px-2.5"
                                        aria-label={t('termSettings')}
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                        {t('settings')}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-[360px] space-y-4">
                                    <div>
                                        <div className="text-sm font-medium">
                                            {t('termSettings')}
                                        </div>
                                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                            {t('termSettingsDesc')}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="term-max" className="text-xs">
                                                {t('vocabSize')}
                                            </Label>
                                            <Input
                                                id="term-max"
                                                type="number"
                                                min={20}
                                                max={200}
                                                step={10}
                                                value={maxTerms}
                                                onChange={event =>
                                                    setMaxTerms(
                                                        Math.max(
                                                            20,
                                                            Math.min(
                                                                200,
                                                                Number(event.target.value) || 120
                                                            )
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="term-chunk" className="text-xs">
                                                {t('chunkSize')}
                                            </Label>
                                            <Input
                                                id="term-chunk"
                                                type="number"
                                                min={1000}
                                                max={12000}
                                                step={500}
                                                value={chunkSize}
                                                onChange={event =>
                                                    setChunkSize(
                                                        Math.max(
                                                            1000,
                                                            Math.min(
                                                                12000,
                                                                Number(event.target.value) || 8000
                                                            )
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="term-overlap" className="text-xs">
                                                {t('overlap')}
                                            </Label>
                                            <Input
                                                id="term-overlap"
                                                type="number"
                                                min={0}
                                                max={1000}
                                                step={50}
                                                value={overlap}
                                                onChange={event =>
                                                    setOverlap(
                                                        Math.max(
                                                            0,
                                                            Math.min(
                                                                1000,
                                                                Number(event.target.value) || 0
                                                            )
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="flex items-end justify-between gap-3 rounded-md border px-3 py-2">
                                            <Label
                                                htmlFor="term-auto-translate"
                                                className="text-xs leading-4"
                                            >
                                                {t('termsAutoTranslate')}
                                            </Label>
                                            <Switch
                                                id="term-auto-translate"
                                                checked={autoApplyTerms}
                                                onCheckedChange={value =>
                                                    setAutoApplyTerms?.(value)
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="term-preference" className="text-xs">
                                            {t('termPreference')}
                                        </Label>
                                        <Textarea
                                            id="term-preference"
                                            value={termPrompt}
                                            onChange={event => setTermPrompt(event.target.value)}
                                            placeholder={t('termPreferencePlaceholder')}
                                            className="min-h-20"
                                        />
                                    </div>
                                    <div className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                                        {t('termLocalPreviewNote')}
                                    </div>
                                    <Button
                                        type="button"
                                        className="w-full"
                                        onClick={refreshPreview}
                                        disabled={termPreviewLoading || starting}
                                    >
                                        {t('applySettingsPreview')}
                                    </Button>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-white p-4 dark:bg-gray-900">
                        <div className="flex items-center justify-between gap-3">
                            {!isFinalResult && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onPreview}
                                    disabled={termPreviewLoading || starting}
                                >
                                    {termPreviewLoading ? (
                                        <>
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                            {t('extractingShort')}
                                        </>
                                    ) : (
                                        t('extractPreview')
                                    )}
                                </Button>
                            )}
                            <div className="ml-auto text-[11px] text-muted-foreground">
                                {termPct}%
                            </div>
                        </div>

                        {!isFinalResult && termPreviewError && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                {termPreviewError}
                            </div>
                        )}
                        {(isFinalResult || !termPreviewError) && (
                            <div className="grid overflow-hidden rounded-lg border bg-border xl:grid-cols-2 xl:gap-px">
                                {visibleTerms.map((item, index) => {
                                    const isMatched = matchedSet.has(String(item.term || ''));
                                    const isChecked =
                                        isFinalResult && checkedSet.has(String(item.term || ''));
                                    const statusLabel = isMatched
                                        ? t('dictMatched')
                                        : isChecked
                                          ? t('dictCandidate')
                                          : t('dictPending');
                                    return (
                                        <div
                                            key={`${item.term}-${index}`}
                                            className={`flex min-w-0 items-start gap-2.5 bg-background px-3 py-2.5 text-sm xl:border-b-0 ${index === visibleTerms.length - 1 ? 'border-b-0' : 'border-b'}`}
                                        >
                                            <span
                                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isMatched ? 'bg-blue-500' : isChecked ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'}`}
                                                aria-hidden="true"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="break-words font-medium leading-5">
                                                    {item.term}
                                                </div>
                                                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                                                    {typeof item.count === 'number' && (
                                                        <span>
                                                            {t('termFrequency', {
                                                                count: item.count,
                                                            })}
                                                        </span>
                                                    )}
                                                    {formatScore(item.score) && (
                                                        <span>
                                                            {t('termScore', {
                                                                score: formatScore(item.score),
                                                            })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[10px] leading-4 text-muted-foreground">
                                                {statusLabel}
                                            </span>
                                        </div>
                                    );
                                })}
                                {visibleTerms.length % 2 === 1 && (
                                    <div
                                        aria-hidden="true"
                                        className="hidden bg-background xl:block"
                                    />
                                )}
                                {!resultTerms.length && !termPreviewLoading && (
                                    <div className="bg-background p-6 text-sm text-muted-foreground xl:col-span-2">
                                        {t('noPreview')}
                                    </div>
                                )}
                                {termPreviewLoading && !resultTerms.length && (
                                    <div className="flex items-center justify-center gap-2 bg-background p-6 text-sm text-muted-foreground xl:col-span-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('extractingTerms')}
                                    </div>
                                )}
                            </div>
                        )}

                        {!!resultTerms.length && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    {t('dictMatchedLegend')}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    {t('dictCandidateLegend')}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                                    {t('dictPendingLegend')}
                                </span>
                                {!showAllTerms && resultTerms.length > 20 && (
                                    <span>{t('showingFirstTerms', { count: 20 })}</span>
                                )}
                            </div>
                        )}
                    </div>

                    {termPct >= 100 && (
                        <div className="flex items-center justify-between rounded-md border bg-emerald-50/60 px-3 py-2 text-xs dark:bg-emerald-900/20">
                            <span>{t('termsDone')}</span>
                            <div className="flex items-center gap-2">
                                {onApply && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={onApply}
                                        disabled={!!applying || !terms.length}
                                    >
                                        {applying ? t('writingShort') : t('manualWriteToDict')}
                                    </Button>
                                )}
                                {onViewDictionary && (
                                    <Button size="sm" variant="outline" onClick={onViewDictionary}>
                                        {t('viewDictionary')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}
