import React, { useEffect, useRef, useState } from 'react';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { fetchDocumentPreviewByDocIdAction } from '@/actions/document';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';

const PreviewCard: React.FC = () => {
    const t = useTranslations('IDE.preview');
    const { activeDocumentItem } = useActiveDocumentItem();
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastLoadedId = useRef<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            setUrl(null);
            try {
                if (!activeDocumentItem?.id) return;
                const info = await fetchDocumentPreviewByDocIdAction(activeDocumentItem.id);
                if (info?.url) {
                    // 使用服务端代理，避免 localhost 拒绝连接
                    const proxied = `/api/document/preview/${activeDocumentItem.id}`;
                    setUrl(proxied);
                }
                lastLoadedId.current = activeDocumentItem.id;
            } catch (e: any) {
                setError(t('previewError'));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [activeDocumentItem?.id]);

    const handleOpenNew = async () => {
        try {
            const finalUrl =
                url ||
                (activeDocumentItem?.id ? `/api/document/preview/${activeDocumentItem.id}` : null);
            if (finalUrl) {
                setUrl(finalUrl);
                window.open(finalUrl, '_blank');
            }
        } catch {
            // ignore
        }
    };

    const handleDownload = async () => {
        if (!url) return;
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = activeDocumentItem?.name || 'document';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch {
            window.open(url, '_blank');
        }
    };

    return (
        <div className="flex size-full flex-col rounded-tl-md bg-background">
            <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] text-foreground/70">
                <span className="font-medium">{t('title')}</span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={handleDownload}
                        disabled={!url}
                    >
                        <Download className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={handleOpenNew}
                        disabled={!url}
                    >
                        <ExternalLink className="h-3 w-3" />
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden p-0">
                {loading && <Skeleton className="m-3 h-[calc(100%-24px)] w-[calc(100%-24px)]" />}
                {!loading && error && <div className="text-sm text-red-500">{error}</div>}
                {!loading && !error && url && (
                    <iframe src={url} className="h-full w-full border-0" />
                )}
                {!loading && !error && !url && (
                    <div className="text-sm text-muted-foreground">{t('noPreviewContent')}</div>
                )}
            </div>
        </div>
    );
};

export default PreviewCard;
