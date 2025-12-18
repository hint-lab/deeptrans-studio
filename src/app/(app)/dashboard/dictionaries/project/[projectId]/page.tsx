'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DictionaryEntriesManager } from '../../components/dictionary-entries-manager';
import { type DictionaryVisibility } from '@prisma/client';
import { fetchDictionaryMetaByProjectIdAction } from '@/actions/dictionary';
import { toast } from 'sonner';

export default function DictionaryDetailPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const router = useRouter();
    const [dictionary, setDictionary] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);
    const { projectId } = usePromise(params);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetchDictionaryMetaByProjectIdAction(projectId);
                const d = (res as any)?.data;
                console.log('Fetched dictionary data: ', JSON.stringify(res));
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
    }, [projectId, toast, router]);

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-sm text-muted-foreground">加载中...</div>
            </div>
        );
    }

    if (!dictionary) return null;

    return (
        <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">词库管理</h1>
                    <p className="text-sm text-muted-foreground">
                        管理 {dictionary.name} 中的术语条目
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push('/dashboard/dictionaries')}
                    >
                        返回词库列表
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
