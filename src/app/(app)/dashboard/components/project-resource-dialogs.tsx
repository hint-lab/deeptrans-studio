'use client';

import { getAllDictionariesAction } from '@/actions/dictionary';
import { listMemoriesAction } from '@/actions/memories';
import {
    getProjectDictionaryBindingsAction,
    getProjectMemoryBindingsAction,
    updateProjectDictionaryBindingsAction,
    updateProjectMemoryBindingsAction,
} from '@/actions/project-bindings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    canSaveProjectResourceBindings,
    resolveProjectResourceBindings,
    type ProjectResourceBindingLoadState,
} from '@/lib/project-resource-bindings';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type DictLite = { id: string; name: string };
type MemLite = { id: string; name: string };

function toResourceLite(value: unknown): DictLite | null {
    if (!value || typeof value !== 'object') return null;

    const resource = value as { id?: unknown; name?: unknown };
    return typeof resource.id === 'string' && typeof resource.name === 'string'
        ? { id: resource.id, name: resource.name }
        : null;
}

function failureMessage(_error: unknown, fallback: string): string {
    // Server-action exceptions may include guard, storage, or database detail.
    // The UI keeps a stable retry message instead of exposing those internals.
    return fallback;
}

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
    const [items, setItems] = useState<DictLite[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [loadState, setLoadState] = useState<ProjectResourceBindingLoadState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [reloadNonce, setReloadNonce] = useState(0);

    const canSave = canSaveProjectResourceBindings(loadState, saving);

    useEffect(() => {
        if (!open) {
            setLoadState('idle');
            setErrorMessage(null);
            return;
        }

        let cancelled = false;
        setLoadState('loading');
        setErrorMessage(null);
        setItems([]);
        setSelected([]);

        void (async () => {
            try {
                const [dictRes, bindRes] = await Promise.all([
                    getAllDictionariesAction(),
                    getProjectDictionaryBindingsAction(projectId),
                ]);

                const resolved = resolveProjectResourceBindings(
                    dictRes,
                    bindRes,
                    toResourceLite,
                    t('resourceLoadFailed')
                );
                if (cancelled) return;

                if (!resolved.success) {
                    setLoadState('error');
                    setErrorMessage(resolved.error);
                    toast.error(t('resourceLoadFailed'), { description: resolved.error });
                    return;
                }

                setItems(resolved.items);
                setSelected(resolved.selected);
                setLoadState('ready');
            } catch (error) {
                if (cancelled) return;

                const message = failureMessage(error, t('resourceLoadFailed'));
                setLoadState('error');
                setErrorMessage(message);
                toast.error(t('resourceLoadFailed'), { description: message });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, projectId, reloadNonce, t]);

    const toggle = (id: string) =>
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const handleSave = async () => {
        if (!canSave) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            const res = await updateProjectDictionaryBindingsAction(projectId, selected);
            if (!res?.success) throw new Error(res?.error || 'failed');
            onOpenChange(false);
        } catch (error) {
            const message = failureMessage(error, t('resourceSaveFailed'));
            setErrorMessage(message);
            toast.error(t('resourceSaveFailed'), { description: message });
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
                            {loadState === 'loading' ? (
                                <div role="status" className="text-sm text-muted-foreground">
                                    {t('resourceLoading')}
                                </div>
                            ) : loadState === 'error' ? (
                                <div role="alert" className="space-y-3 text-sm text-destructive">
                                    <p>{errorMessage || t('resourceLoadFailed')}</p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setReloadNonce(value => value + 1)}
                                    >
                                        {t('retry')}
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    {items.map(it => (
                                        <label
                                            key={it.id}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <Checkbox
                                                checked={selected.includes(it.id)}
                                                onCheckedChange={() => toggle(it.id)}
                                                disabled={!canSave}
                                            />
                                            <span>{it.name}</span>
                                        </label>
                                    ))}
                                    {loadState === 'ready' && !items.length && (
                                        <div className="text-sm text-muted-foreground">
                                            {t('noData')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </ScrollArea>
                    {loadState === 'ready' && errorMessage && (
                        <p role="alert" className="text-sm text-destructive">
                            {errorMessage}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={!canSave}>
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
    const [items, setItems] = useState<MemLite[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [loadState, setLoadState] = useState<ProjectResourceBindingLoadState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [inaccessibleBindingCount, setInaccessibleBindingCount] = useState(0);
    const [reloadNonce, setReloadNonce] = useState(0);

    const canSave = canSaveProjectResourceBindings(loadState, saving);

    useEffect(() => {
        if (!open) {
            setLoadState('idle');
            setErrorMessage(null);
            setInaccessibleBindingCount(0);
            return;
        }

        let cancelled = false;
        setLoadState('loading');
        setErrorMessage(null);
        setInaccessibleBindingCount(0);
        setItems([]);
        setSelected([]);

        void (async () => {
            try {
                const [memRes, bindRes] = await Promise.all([
                    listMemoriesAction(),
                    getProjectMemoryBindingsAction(projectId),
                ]);

                const resolved = resolveProjectResourceBindings(
                    memRes,
                    bindRes,
                    toResourceLite,
                    t('resourceLoadFailed')
                );
                if (cancelled) return;

                if (!resolved.success) {
                    setLoadState('error');
                    setErrorMessage(resolved.error);
                    toast.error(t('resourceLoadFailed'), { description: resolved.error });
                    return;
                }

                setItems(resolved.items);
                setSelected(resolved.selected);
                const count = Number(
                    (bindRes as { inaccessibleBindingCount?: unknown })?.inaccessibleBindingCount
                );
                setInaccessibleBindingCount(Number.isSafeInteger(count) && count > 0 ? count : 0);
                setLoadState('ready');
            } catch (error) {
                if (cancelled) return;

                const message = failureMessage(error, t('resourceLoadFailed'));
                setLoadState('error');
                setErrorMessage(message);
                toast.error(t('resourceLoadFailed'), { description: message });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, projectId, reloadNonce, t]);

    const toggle = (id: string) =>
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const handleSave = async () => {
        if (!canSave) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            const res = await updateProjectMemoryBindingsAction(projectId, selected);
            if (!res?.success) throw new Error(res?.error || 'failed');
            onOpenChange(false);
        } catch (error) {
            const message = failureMessage(error, t('resourceSaveFailed'));
            setErrorMessage(message);
            toast.error(t('resourceSaveFailed'), { description: message });
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
                    <p className="text-xs leading-5 text-muted-foreground">
                        {t('memoryRetrievalScopeNotice')}
                    </p>
                    {loadState === 'ready' && inaccessibleBindingCount > 0 && (
                        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
                            {t('legacyMemoryBindingNotice', { count: inaccessibleBindingCount })}
                        </p>
                    )}
                    <ScrollArea className="h-64 pr-2">
                        <div className="space-y-2">
                            {loadState === 'loading' ? (
                                <div role="status" className="text-sm text-muted-foreground">
                                    {t('resourceLoading')}
                                </div>
                            ) : loadState === 'error' ? (
                                <div role="alert" className="space-y-3 text-sm text-destructive">
                                    <p>{errorMessage || t('resourceLoadFailed')}</p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setReloadNonce(value => value + 1)}
                                    >
                                        {t('retry')}
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    {items.map(it => (
                                        <label
                                            key={it.id}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <Checkbox
                                                checked={selected.includes(it.id)}
                                                onCheckedChange={() => toggle(it.id)}
                                                disabled={!canSave}
                                            />
                                            <span>{it.name}</span>
                                        </label>
                                    ))}
                                    {loadState === 'ready' && !items.length && (
                                        <div className="text-sm text-muted-foreground">
                                            {t('noData')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </ScrollArea>
                    {loadState === 'ready' && errorMessage && (
                        <p role="alert" className="text-sm text-destructive">
                            {errorMessage}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={!canSave}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
