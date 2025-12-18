'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { getAllDictionariesAction } from '@/actions/dictionary';
import { listMemoriesAction } from '@/actions/memories';
import {
    getProjectDictionaryBindingsAction,
    updateProjectDictionaryBindingsAction,
    getProjectMemoryBindingsAction,
    updateProjectMemoryBindingsAction,
} from '@/actions/project-bindings';

type DictLite = { id: string; name: string };
type MemLite = { id: string; name: string };

export function ProjectDictionariesDialog({
    projectId,
    open,
    onOpenChange,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const t = useTranslations('Dashboard.ProjectList');
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<DictLite[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const [dictRes, bindRes] = await Promise.all([
                    getAllDictionariesAction() as any,
                    getProjectDictionaryBindingsAction(projectId) as any,
                ]);
                if (!cancelled) {
                    if (dictRes?.success)
                        setItems(
                            (dictRes.data || []).map((d: any) => ({ id: d.id, name: d.name }))
                        );
                    if (bindRes?.success) setSelected(bindRes.data || []);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, projectId]);

    const toggle = (id: string) =>
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = (await updateProjectDictionaryBindingsAction(projectId, selected)) as any;
            if (!res?.success) throw new Error(res?.error || 'failed');
            onOpenChange(false);
        } catch (e) {
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('configureDictionaries')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Label className="text-sm">{t('selectDictionaries')}</Label>
                    <ScrollArea className="h-64 pr-2">
                        <div className="space-y-2">
                            {items.map(it => (
                                <label key={it.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={selected.includes(it.id)}
                                        onCheckedChange={() => toggle(it.id)}
                                    />
                                    <span>{it.name}</span>
                                </label>
                            ))}
                            {!items.length && !loading && (
                                <div className="text-sm text-muted-foreground">{t('noData')}</div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ProjectMemoriesDialog({
    projectId,
    open,
    onOpenChange,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const t = useTranslations('Dashboard.ProjectList');
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<MemLite[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const [memRes, bindRes] = await Promise.all([
                    listMemoriesAction() as any,
                    getProjectMemoryBindingsAction(projectId) as any,
                ]);
                if (!cancelled) {
                    if (memRes?.success)
                        setItems((memRes.data || []).map((m: any) => ({ id: m.id, name: m.name })));
                    if (bindRes?.success) setSelected(bindRes.data || []);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, projectId]);

    const toggle = (id: string) =>
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const handleSave = async () => {
        try {
            setSaving(true);
            const res = (await updateProjectMemoryBindingsAction(projectId, selected)) as any;
            if (!res?.success) throw new Error(res?.error || 'failed');
            onOpenChange(false);
        } catch (e) {
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('configureMemories')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Label className="text-sm">{t('selectMemories')}</Label>
                    <ScrollArea className="h-64 pr-2">
                        <div className="space-y-2">
                            {items.map(it => (
                                <label key={it.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={selected.includes(it.id)}
                                        onCheckedChange={() => toggle(it.id)}
                                    />
                                    <span>{it.name}</span>
                                </label>
                            ))}
                            {!items.length && !loading && (
                                <div className="text-sm text-muted-foreground">{t('noData')}</div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
