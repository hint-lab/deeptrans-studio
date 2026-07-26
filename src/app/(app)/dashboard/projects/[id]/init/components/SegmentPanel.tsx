'use client';

import {
    listWorkflowPromptSettingsAction,
    resetWorkflowPromptAction,
    saveWorkflowPromptAction,
} from '@/actions/workflow-prompts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SegmentGranularity } from '@/lib/document-segmentation';
import { WORKFLOW_PROMPT_MAX_LENGTH } from '@/lib/workflow-prompt-keys';
import { Check, Loader2, RotateCcw, Save, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

export type PreviewSegmentItem = {
    type: string;
    sourceText: string;
    order?: number;
    metadata?: any;
};

const GRANULARITY_ORDER: SegmentGranularity[] = ['fine', 'balanced', 'coarse'];

type PromptSetting = {
    nodeKey: string;
    content: string;
    enabled: boolean;
    version: number;
    customized: boolean;
};

function isPromptSetting(value: unknown): value is PromptSetting {
    if (!value || typeof value !== 'object') return false;
    const setting = value as Record<string, unknown>;
    return (
        setting.nodeKey === 'document-segmentation' &&
        typeof setting.content === 'string' &&
        typeof setting.enabled === 'boolean' &&
        typeof setting.version === 'number'
    );
}

export default function SegmentPanel({
    segItems,
    bodyCount,
    averageCharacters,
    segLoading,
    segError,
    granularity,
    onGranularityChange,
    showFull,
    onShowFullChange,
    hasPlan,
    planner,
    onGenerate,
    onPromptChanged,
    busy,
}: {
    segItems: PreviewSegmentItem[];
    bodyCount?: number;
    /** Full-plan statistic returned by the server, not just visible preview rows. */
    averageCharacters?: number;
    segLoading: boolean;
    segError: string | null;
    granularity: SegmentGranularity;
    onGranularityChange: (value: SegmentGranularity) => void;
    showFull: boolean;
    onShowFullChange: (value: boolean) => void;
    hasPlan: boolean;
    planner?: 'llm' | 'mixed' | 'structure-fallback' | null;
    onGenerate: () => void;
    onPromptChanged: () => void;
    busy?: boolean;
}) {
    const t = useTranslations('Dashboard.Init');
    const locale = useLocale();
    const isBusy = !!busy || !!segLoading;
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptLoaded, setPromptLoaded] = useState(false);
    const [promptSaving, setPromptSaving] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [promptCustomized, setPromptCustomized] = useState(false);
    const bodyItems = segItems.filter(item => String(item.type || '').toUpperCase() !== 'TITLE');
    const previewAverageCharacters = bodyItems.length
        ? Math.round(
              bodyItems.reduce((sum, item) => sum + String(item.sourceText || '').length, 0) /
                  bodyItems.length
          )
        : 0;
    const resolvedAverageCharacters =
        typeof averageCharacters === 'number' && Number.isFinite(averageCharacters)
            ? Math.max(0, Math.round(averageCharacters))
            : previewAverageCharacters;

    async function loadPrompt() {
        setPromptLoading(true);
        try {
            const settings = await listWorkflowPromptSettingsAction(locale);
            const setting = Array.isArray(settings)
                ? settings.find(isPromptSetting)
                : undefined;
            if (!setting) throw new Error('missing prompt setting');
            setPrompt(setting.content);
            setPromptCustomized(setting.customized);
            setPromptLoaded(true);
        } catch {
            toast.error(t('segmentPromptLoadFailed'));
        } finally {
            setPromptLoading(false);
        }
    }

    async function savePrompt() {
        setPromptSaving(true);
        try {
            const result = await saveWorkflowPromptAction({
                nodeKey: 'document-segmentation',
                content: prompt,
                enabled: true,
            });
            setPrompt(result.content);
            setPromptCustomized(result.customized);
            toast.success(t('segmentPromptSaved'));
            onPromptChanged();
        } catch {
            toast.error(t('segmentPromptSaveFailed'));
        } finally {
            setPromptSaving(false);
        }
    }

    async function resetPrompt() {
        setPromptSaving(true);
        try {
            const result = await resetWorkflowPromptAction('document-segmentation');
            setPrompt(result.content);
            setPromptCustomized(false);
            toast.success(t('segmentPromptReset'));
            onPromptChanged();
        } catch {
            toast.error(t('segmentPromptSaveFailed'));
        } finally {
            setPromptSaving(false);
        }
    }

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
                                average: resolvedAverageCharacters,
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
                        disabled={isBusy || !hasPlan}
                        onCheckedChange={onShowFullChange}
                    />
                    <Popover
                        open={settingsOpen}
                        onOpenChange={open => {
                            setSettingsOpen(open);
                            if (open && !promptLoaded && !promptLoading) void loadPrompt();
                        }}
                    >
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
                        <PopoverContent align="end" className="w-[25rem] space-y-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    {t('segmentSettings')}
                                    {promptCustomized && (
                                        <Badge
                                            variant="outline"
                                            className="border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300"
                                        >
                                            <Check className="mr-1 h-3 w-3" />
                                            {t('segmentPromptCustomized')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {t('segmentSettingsDesc')}
                                </div>
                            </div>
                            <div
                                className="grid grid-cols-3 gap-2"
                                role="radiogroup"
                                aria-label={t('segmentGranularity')}
                            >
                                {GRANULARITY_ORDER.map(value => {
                                    const labelKey =
                                        value === 'fine'
                                            ? 'segmentFine'
                                            : value === 'balanced'
                                              ? 'segmentBalanced'
                                              : 'segmentCoarse';
                                    return (
                                        <Button
                                            key={value}
                                            type="button"
                                            size="sm"
                                            variant={granularity === value ? 'default' : 'outline'}
                                            className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-xs"
                                            role="radio"
                                            aria-checked={granularity === value}
                                            disabled={isBusy}
                                            onClick={() => onGranularityChange(value)}
                                        >
                                            {t(labelKey)}
                                        </Button>
                                    );
                                })}
                            </div>
                            <div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
                                {t(`segmentProfile_${granularity}`)}
                            </div>
                            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                                <div className="flex items-start gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{t('segmentPromptProtection')}</span>
                                </div>
                                {promptLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        {t('segmentPromptLoading')}
                                    </div>
                                ) : (
                                    <>
                                        <Textarea
                                            value={prompt}
                                            onChange={event => setPrompt(event.target.value)}
                                            maxLength={WORKFLOW_PROMPT_MAX_LENGTH}
                                            disabled={promptSaving}
                                            placeholder={t('segmentPromptPlaceholder')}
                                            aria-label={t('segmentPromptTitle')}
                                            className="min-h-24 resize-y bg-background text-xs leading-5"
                                        />
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-muted-foreground">
                                                {prompt.length}/{WORKFLOW_PROMPT_MAX_LENGTH}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs"
                                                    disabled={promptSaving || !promptCustomized}
                                                    onClick={() => void resetPrompt()}
                                                >
                                                    <RotateCcw className="mr-1 h-3 w-3" />
                                                    {t('segmentPromptResetAction')}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    disabled={promptSaving}
                                                    onClick={() => void savePrompt()}
                                                >
                                                    {promptSaving ? (
                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Save className="mr-1 h-3 w-3" />
                                                    )}
                                                    {t('segmentPromptSaveAction')}
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="text-[11px] leading-4 text-muted-foreground">
                                {t('segmentAutoRefresh')}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 px-2.5"
                        disabled={isBusy}
                        onClick={onGenerate}
                    >
                        {segLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {hasPlan ? t('segmentRegenerate') : t('segmentGenerate')}
                    </Button>
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
                {!hasPlan && !segLoading && !segError && (
                    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
                        {t('segmentPlanRequired')}
                    </div>
                )}
                {planner === 'structure-fallback' && hasPlan && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {t('segmentFallbackNotice')}
                    </div>
                )}
                {planner === 'mixed' && hasPlan && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {t('segmentMixedNotice')}
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
                    {!segItems.length && hasPlan && !segLoading && !segError && (
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
