'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getAllDictionariesAction } from '@/actions/dictionary';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';

type DictionaryLite = { id: string; name: string; isPublic?: boolean };

export function IdeSettingsModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { settings, updateProvider, updateDictionaries } = useUserSettings();
    const [provider, setProvider] = useState<string>(settings.provider);
    const [dicts, setDicts] = useState<DictionaryLite[]>([]);
    const [selected, setSelected] = useState<string[]>(settings.dictionaryIds || []);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setProvider(settings.provider);
        setSelected(settings.dictionaryIds);
    }, [settings]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await getAllDictionariesAction();
                if (!cancelled && res?.success && Array.isArray(res.data)) {
                    setDicts(res.data as DictionaryLite[]);
                }
            } catch {
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleSave = () => {
        updateProvider(provider);
        updateDictionaries(selected);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>设置</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label>加载的术语库（可多选）</Label>
                        <div className="max-h-44 overflow-auto rounded-md border p-2 text-sm">
                            {loading && (
                                <div className="space-y-2">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Skeleton key={i} className="h-5 w-40" />
                                    ))}
                                </div>
                            )}
                            {!loading && dicts.length === 0 && (
                                <div className="text-muted-foreground">暂无词典</div>
                            )}
                            {!loading &&
                                dicts.map(d => {
                                    const checked = selected.includes(d.id);
                                    return (
                                        <label
                                            key={d.id}
                                            className="flex cursor-pointer select-none items-center gap-2 py-1"
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={checked}
                                                onChange={e => {
                                                    const isChecked = e.target.checked;
                                                    setSelected(prev =>
                                                        isChecked
                                                            ? [...prev, d.id]
                                                            : prev.filter(x => x !== d.id)
                                                    );
                                                }}
                                            />
                                            <span>{d.name}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                    <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                        语篇与聊天检索使用当前项目绑定的记忆库。请在项目仪表盘的“项目资源”中配置，
                        该范围会由服务端校验后生效。
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handleSave}>保存</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
