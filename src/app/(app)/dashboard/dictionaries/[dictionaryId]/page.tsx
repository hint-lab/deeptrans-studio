'use client';

import { fetchDictionaryMetaByIdAction } from '@/actions/dictionary';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { type DictionaryVisibility } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, use as usePromise, useState } from 'react';
import { toast } from 'sonner';
import { DictionaryEntriesManager } from '../components/dictionary-entries-manager';
export default function DictionaryDetailPage({
    params,
}: {
    params: Promise<{ dictionaryId: string }>;
}) {
    const router = useRouter();
    const [dictionary, setDictionary] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);
    const { dictionaryId } = usePromise(params);
    const t = useTranslations('Dashboard.Dictionaries');
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetchDictionaryMetaByIdAction(dictionaryId);
                const d = (res as any)?.data;
                if (!res?.success || !d) {
                    toast('加载失败：未找到该词库', { description: '请检查词库ID是否正确' });
                    router.push('/dashboard/dictionaries');
                    return;
                }
                setDictionary({
                    id: d.id,
                    name: d.name,
                    description: d.description ?? null,
                    domain: d.domain,
                    visibility: (d.visibility as DictionaryVisibility) || 'PRIVATE',
                    createdAt: new Date(d.createdAt as any),
                    updatedAt: new Date(d.updatedAt as any),
                    entryCount: (d as any)?._count?.entries ?? 0,
                    cover: '/images/dictionaries/default.svg',
                });
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [dictionaryId, toast, router]);

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
        );
    }

    if (!dictionary) return null;

    return (
        <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{t('title')}</h1>
                    <p className="text-sm text-muted-foreground">
                        {dictionary.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push('/dashboard/dictionaries')}
                    >
                        {t('backToList')}
                    </Button>
                </div>
            </div>
            <Separator className="mb-4" />
            <DictionaryEntriesManager
                dictionary={dictionary}
                onEntriesUpdated={() => setReloadToken(t => t + 1)}
                reloadToken={reloadToken}
            />
        </div>
    );
}
