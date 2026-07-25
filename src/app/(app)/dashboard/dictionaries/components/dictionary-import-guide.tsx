'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { DICTIONARY_TEMPLATE_FILENAME, DICTIONARY_TEMPLATE_URL } from '@/lib/dictionary-template';
import { CircleHelp, Download, FileSpreadsheet, Upload } from 'lucide-react';
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

export function DictionaryImportHelpDialog() {
    const t = useTranslations('Dashboard.Dictionaries.Guide');

    const steps = [
        { number: '1', title: t('stepDownload'), detail: t('stepDownloadDetail') },
        { number: '2', title: t('stepFill'), detail: t('stepFillDetail') },
        { number: '3', title: t('stepImport'), detail: t('stepImportDetail') },
    ];

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 self-start gap-2">
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />
                    {t('helpButton')}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0">
                <DialogHeader className="border-b px-5 py-5 pr-12 sm:px-6">
                    <div className="flex items-start gap-3 text-left">
                        <div className="rounded-lg bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <DialogTitle>{t('title')}</DialogTitle>
                                <Badge
                                    variant="outline"
                                    className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                >
                                    {t('recommended')}
                                </Badge>
                            </div>
                            <DialogDescription className="mt-1.5 max-w-2xl leading-6">
                                {t('description')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="grid md:grid-cols-[1.05fr_0.95fr]">
                        <div className="p-5 sm:p-6">
                            <ol className="space-y-4">
                                {steps.map((step, index) => (
                                    <li key={step.number} className="relative flex gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 ring-4 ring-background dark:bg-emerald-950 dark:text-emerald-200">
                                            {step.number}
                                        </span>
                                        <div className="min-w-0 pb-1">
                                            <p className="text-sm font-medium">{step.title}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                                {step.detail}
                                            </p>
                                        </div>
                                        {index < steps.length - 1 && (
                                            <span
                                                className="absolute left-3.5 top-7 h-7 w-px bg-emerald-200 dark:bg-emerald-900"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className="border-t bg-slate-50/80 p-5 dark:bg-slate-950/40 md:border-l md:border-t-0 md:p-6">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {t('formatTitle')}
                            </p>
                            <div className="overflow-hidden rounded-md border bg-background text-xs shadow-sm">
                                <table className="w-full table-fixed font-mono">
                                    <thead className="bg-emerald-700 text-left text-white">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="w-[36%] border-r border-white/20 px-3 py-2 font-medium"
                                            >
                                                source
                                                <span className="ml-1 text-[10px] font-normal text-emerald-100">
                                                    {t('required')}
                                                </span>
                                            </th>
                                            <th
                                                scope="col"
                                                className="w-[36%] border-r border-white/20 px-3 py-2 font-medium"
                                            >
                                                target
                                                <span className="ml-1 text-[10px] font-normal text-emerald-100">
                                                    {t('required')}
                                                </span>
                                            </th>
                                            <th scope="col" className="w-[28%] px-3 py-2 font-medium">
                                                notes
                                                <span className="ml-1 text-[10px] font-normal text-emerald-100">
                                                    {t('optional')}
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-muted-foreground">
                                        <tr>
                                            <td className="break-words border-r px-3 py-2">
                                                governing law
                                            </td>
                                            <td className="break-words border-r px-3 py-2">
                                                准据法
                                            </td>
                                            <td className="break-words px-3 py-2">
                                                {t('exampleNote')}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                {t('formatTip')}
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="items-center gap-3 border-t bg-background px-5 py-4 sm:justify-between sm:px-6">
                    <div className="flex items-center gap-2 text-left text-xs leading-5 text-muted-foreground">
                        <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{t('manualOption')}</span>
                    </div>
                    <DictionaryTemplateDownloadButton className="w-full shrink-0 bg-emerald-700 hover:bg-emerald-800 sm:w-auto" />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
