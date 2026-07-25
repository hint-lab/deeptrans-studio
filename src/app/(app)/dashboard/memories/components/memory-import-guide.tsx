'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { CircleHelp, Database, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function MemoryImportHelpDialog() {
    const t = useTranslations('Dashboard.Memories.Guide');

    const steps = [
        { number: '1', title: t('stepFile'), detail: t('stepFileDetail') },
        { number: '2', title: t('stepPair'), detail: t('stepPairDetail') },
        { number: '3', title: t('stepImport'), detail: t('stepImportDetail') },
    ];

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="shrink-0 gap-2">
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />
                    {t('helpButton')}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0">
                <DialogHeader className="border-b px-5 py-5 pr-12 sm:px-6">
                    <div className="flex items-start gap-3 text-left">
                        <div className="rounded-lg bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            <Database className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <DialogTitle>{t('title')}</DialogTitle>
                                <Badge
                                    variant="outline"
                                    className="border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
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
                    <div className="grid md:grid-cols-[0.9fr_1.1fr]">
                        <div className="p-5 sm:p-6">
                            <ol className="space-y-4">
                                {steps.map((step, index) => (
                                    <li key={step.number} className="relative flex gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800 ring-4 ring-background dark:bg-indigo-950 dark:text-indigo-200">
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
                                                className="absolute left-3.5 top-7 h-7 w-px bg-indigo-200 dark:bg-indigo-900"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </li>
                                ))}
                            </ol>

                            <div className="mt-5 border-t pt-4">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">
                                    {t('supportedTitle')}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {['TMX / XML', 'CSV / TSV', 'XLSX / XLS'].map(format => (
                                        <Badge
                                            key={format}
                                            variant="secondary"
                                            className="font-mono"
                                        >
                                            {format}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="border-t bg-slate-50/80 p-5 dark:bg-slate-950/40 md:border-l md:border-t-0 md:p-6">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {t('formatTitle')}
                            </p>
                            <div className="overflow-hidden rounded-md border bg-background text-xs shadow-sm">
                                <table className="w-full table-fixed">
                                    <thead className="bg-indigo-700 text-left font-mono text-white">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="w-[38%] border-r border-white/20 px-3 py-2 font-medium"
                                            >
                                                source
                                                <span className="ml-1 text-[10px] font-normal text-indigo-100">
                                                    {t('required')}
                                                </span>
                                            </th>
                                            <th
                                                scope="col"
                                                className="w-[38%] border-r border-white/20 px-3 py-2 font-medium"
                                            >
                                                target
                                                <span className="ml-1 text-[10px] font-normal text-indigo-100">
                                                    {t('required')}
                                                </span>
                                            </th>
                                            <th
                                                scope="col"
                                                className="w-[24%] px-3 py-2 font-medium"
                                            >
                                                notes
                                                <span className="ml-1 text-[10px] font-normal text-indigo-100">
                                                    {t('optional')}
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-muted-foreground">
                                        <tr>
                                            <td className="break-words border-r px-3 py-2 align-top">
                                                {t('exampleSource')}
                                            </td>
                                            <td className="break-words border-r px-3 py-2 align-top">
                                                {t('exampleTarget')}
                                            </td>
                                            <td className="break-words px-3 py-2 align-top">
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
                        <span>{t('defaultMemoryTip')}</span>
                    </div>
                    <DialogClose asChild>
                        <Button className="w-full shrink-0 bg-indigo-700 hover:bg-indigo-800 sm:w-auto">
                            {t('understood')}
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
