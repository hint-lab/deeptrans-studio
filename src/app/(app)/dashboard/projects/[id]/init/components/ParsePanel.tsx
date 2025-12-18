'use client';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function ParsePanel({ previewHtml }: { previewHtml: string }) {
    const t = useTranslations('Dashboard.Init');
    // 仅用于预览：限制段落数与字符数
    function limitPreviewHtml(html: string): string {
        const maxParas = 100;
        const maxChars = 2000;
        if (!html) return html;
        let out = html;
        try {
            const paras = html.match(/<p[\s\S]*?<\/p>/gi) || [];
            if (paras.length > 0) {
                out = paras.slice(0, maxParas).join('');
            }
        } catch {}
        if (out.length > maxChars) out = out.slice(0, maxChars);
        return out;
    }

    const [showFull, setShowFull] = useState(false);

    return (
        <section className="space-y-2" id="step-parse">
            <div className="text-xs font-medium text-muted-foreground">{t('parseResult')}</div>
            <div className="overflow-hidden rounded-lg border bg-white p-0 shadow-sm dark:bg-gray-900">
                <div className="flex items-center justify-between border-b bg-white px-4 py-2 text-xs text-muted-foreground dark:bg-gray-900">
                    <div>{t('htmlPreviewNote')}</div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="toggle-full" className="text-xs text-muted-foreground">
                            {t('showFull')}
                        </Label>
                        <Switch id="toggle-full" checked={showFull} onCheckedChange={setShowFull} />
                    </div>
                </div>
                <div className="relative scroll-smooth bg-white dark:bg-gray-950">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-white to-transparent dark:from-gray-950" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent dark:from-gray-950" />
                    {previewHtml ? (
                        <div
                            className="prose prose-sm dark:prose-invert prose-headings:font-semibold prose-p:leading-7 prose-img:rounded-md prose-hr:my-6 max-w-none px-5 py-4"
                            dangerouslySetInnerHTML={{
                                __html: showFull ? previewHtml : limitPreviewHtml(previewHtml),
                            }}
                        />
                    ) : (
                        <div className="px-5 py-4 text-xs text-muted-foreground">
                            <div className="mb-2 flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" />{' '}
                                {t('generatingPreview')}
                            </div>
                            <div className="space-y-3">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
