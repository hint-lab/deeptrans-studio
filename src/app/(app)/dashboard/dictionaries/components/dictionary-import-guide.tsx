'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DICTIONARY_TEMPLATE_FILENAME, DICTIONARY_TEMPLATE_URL } from '@/lib/dictionary-template';
import { ArrowRight, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DictionaryTemplateDownloadButton({
    className,
    compact = false,
}: {
    className?: string;
    compact?: boolean;
}) {
    const t = useTranslations('Dashboard.Dictionaries.Guide');

    return (
        <Button
            asChild
            variant={compact ? 'outline' : 'default'}
            size={compact ? 'sm' : 'default'}
            className={className}
        >
            <a href={DICTIONARY_TEMPLATE_URL} download={DICTIONARY_TEMPLATE_FILENAME}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('downloadTemplate')}
            </a>
        </Button>
    );
}

export function DictionaryImportGuide() {
    const t = useTranslations('Dashboard.Dictionaries.Guide');

    const steps = [
        { number: '1', title: t('stepDownload'), detail: t('stepDownloadDetail') },
        { number: '2', title: t('stepFill'), detail: t('stepFillDetail') },
        { number: '3', title: t('stepImport'), detail: t('stepImportDetail') },
    ];

    return (
        <Card className="mb-6 overflow-hidden border-emerald-200/80 shadow-none dark:border-emerald-900">
            <CardContent className="p-0">
                <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
                    <div className="space-y-5 p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div>
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold tracking-tight">
                                            {t('title')}
                                        </h2>
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                        >
                                            {t('recommended')}
                                        </Badge>
                                    </div>
                                    <p className="max-w-2xl text-sm text-muted-foreground">
                                        {t('description')}
                                    </p>
                                </div>
                            </div>
                            <DictionaryTemplateDownloadButton className="shrink-0 bg-emerald-700 hover:bg-emerald-800" />
                        </div>

                        <ol className="grid gap-3 sm:grid-cols-3">
                            {steps.map((step, index) => (
                                <li key={step.number} className="relative flex gap-3">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                        {step.number}
                                    </span>
                                    <div>
                                        <p className="text-sm font-medium">{step.title}</p>
                                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                            {step.detail}
                                        </p>
                                    </div>
                                    {index < steps.length - 1 && (
                                        <ArrowRight
                                            className="absolute -right-1 top-1 hidden h-4 w-4 text-muted-foreground/50 sm:block"
                                            aria-hidden="true"
                                        />
                                    )}
                                </li>
                            ))}
                        </ol>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t('manualOption')}</span>
                        </div>
                    </div>

                    <div className="border-t bg-slate-50/80 p-5 dark:bg-slate-950/40 lg:border-l lg:border-t-0">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {t('formatTitle')}
                        </p>
                        <div className="overflow-hidden rounded-md border bg-background text-xs shadow-sm">
                            <div className="grid grid-cols-[1fr_1fr_0.8fr] bg-emerald-700 font-mono text-white">
                                <span className="border-r border-white/20 px-3 py-2">source *</span>
                                <span className="border-r border-white/20 px-3 py-2">target *</span>
                                <span className="px-3 py-2">notes</span>
                            </div>
                            <div className="grid grid-cols-[1fr_1fr_0.8fr] font-mono text-muted-foreground">
                                <span className="border-r px-3 py-2">governing law</span>
                                <span className="border-r px-3 py-2">准据法</span>
                                <span className="px-3 py-2">{t('exampleNote')}</span>
                            </div>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {t('formatTip')}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
