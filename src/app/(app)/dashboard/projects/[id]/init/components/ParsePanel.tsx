'use client';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function ParsePanel({
    previewHtml,
}: {
    previewHtml: string;
}) {
    const t = useTranslations('Dashboard.Init');

    // 引入本地状态来屏蔽“旧错误数据的闪烁”
    const [isRetrying, setIsRetrying] = useState(false);
    const isParseError = previewHtml === 'ERROR:PARSER_FAILED';
    const showLoading = !previewHtml || isRetrying;
    // 监听数据变化：只有当真正的“成功内容”回来时，才结束 Loading
    useEffect(() => {
        // 如果内容存在，且不是错误标记，说明解析成功了，结束重试状态
        if (previewHtml && previewHtml !== 'ERROR:PARSER_FAILED') {
            setIsRetrying(false);
        }
    }, [previewHtml]);

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
        } catch { }
        if (out.length > maxChars) out = out.slice(0, maxChars);
        return out;
    }

    const [showFull, setShowFull] = useState(false);
    return (
        <section className="space-y-2" id="step-parse">
            <div className="text-xs font-medium text-muted-foreground">{t('parseResult')}</div>

            <div className={`overflow-hidden rounded-lg border bg-white p-0 shadow-sm dark:bg-gray-900 ${isParseError && !isRetrying ? 'border-red-200 dark:border-red-900' : ''}`}>

                <div className="flex items-center justify-between border-b bg-white px-4 py-2 text-xs text-muted-foreground dark:bg-gray-900">
                    <div>
                        {isParseError && !isRetrying
                            ? t('parseFailedTitle', { defaultValue: '解析异常' })
                            : t('htmlPreviewNote')}
                    </div>

                    {!isParseError && !showLoading && previewHtml && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="toggle-full" className="text-xs text-muted-foreground">
                                {t('showFull')}
                            </Label>
                            <Switch id="toggle-full" checked={showFull} onCheckedChange={setShowFull} />
                        </div>
                    )}
                </div>

                <div className="relative scroll-smooth bg-white dark:bg-gray-950">
                    {!isParseError && !showLoading && previewHtml && (
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-white to-transparent dark:from-gray-950" />
                    )}

                    {/* 逻辑分支：错误 -> Loading -> 内容 */}
                    {isParseError && !isRetrying ? (
                        // 1. 错误状态 UI (仅在非重试状态下显示)
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="mb-3 rounded-full bg-red-100 p-3 dark:bg-red-900/30">
                                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                {t('parseFailedMessage', { defaultValue: '文档解析服务暂时不可用' })}
                            </h3>
                            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                                {t('parseFailedDescription', { defaultValue: '可能是由于网络连接问题或文件格式异常。请尝试重新解析。' })}
                            </p>
                        </div>
                    ) : showLoading ? (
                        // 2. 加载中状态 UI (骨架屏)
                        // 当 previewHtml 为空，或者 isRetrying 为 true 时都会显示这个
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
                    ) : (
                        // 3. 成功内容 UI
                        <div
                            className="prose prose-sm dark:prose-invert prose-headings:font-semibold prose-p:leading-7 prose-img:rounded-md prose-hr:my-6 max-w-none px-5 py-4"
                            dangerouslySetInnerHTML={{
                                __html: showFull ? previewHtml : limitPreviewHtml(previewHtml),
                            }}
                        />
                    )}

                    {!isParseError && !showLoading && previewHtml && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent dark:from-gray-950" />
                    )}
                </div>
            </div>
        </section>
    );
}