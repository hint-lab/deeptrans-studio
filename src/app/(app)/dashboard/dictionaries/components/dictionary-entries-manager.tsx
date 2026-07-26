'use client';

import {
    createDictionaryEntryAction,
    deleteDictionaryAction,
    deleteDictionaryEntryAction,
    fetchDictionaryEntriesPagedAction,
    updateDictionaryEntryAction,
} from '@/actions/dictionary';
import {
    DICTIONARY_ENTRY_PAGE_SIZE_OPTIONS,
    dictionaryEntryPageCount,
} from '@/lib/dictionary-entry-pagination';
import { createLogger } from '@/lib/logger';
import type { Dictionary, DictionaryEntry } from '@prisma/client';
import { Edit, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import { ScrollArea } from 'src/components/ui/scroll-area';
import { Switch } from 'src/components/ui/switch';
import { Textarea } from 'src/components/ui/textarea';
import { ImportDictionaryEntriesDialog } from './import-dictionary-entries-dialog';
const logger = createLogger(
    {
        type: 'dictionaries:dictionary-entries-manager',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
interface DictionaryEntriesManagerProps {
    dictionary: Dictionary & { canWrite?: boolean };
    onDictionaryDeleted?: (dictionaryId: string) => void;
    onDictionaryEdited?: (dictionaryId: string, updatedData: Partial<Dictionary>) => void;
}

type EntryLoadOptions = {
    page?: number;
    pageSize?: number;
    term?: string;
    origin?: string;
};

export function DictionaryEntriesManager({
    dictionary,
    onDictionaryDeleted,
    onDictionaryEdited,
}: DictionaryEntriesManagerProps) {
    const [entries, setEntries] = useState<DictionaryEntry[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [total, setTotal] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [originFilter, setOriginFilter] = useState<string>('');
    const [editingEntry, setEditingEntry] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingEntries, setIsLoadingEntries] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const loadSequence = useRef(0);
    const activeDictionaryIdRef = useRef(dictionary.id);
    const [loadedDictionaryId, setLoadedDictionaryId] = useState<string | null>(
        dictionary.id
    );
    activeDictionaryIdRef.current = dictionary.id;
    const t = useTranslations('Dashboard.Dictionaries');
    const canWrite = dictionary.canWrite === true;
    const [editForm, setEditForm] = useState({
        sourceText: '',
        targetText: '',
        notes: '',
    });
    // Keep a previous dictionary's rows invisible while route metadata for a
    // new dictionary is resolving. This also locks mutations during that
    // handoff, so an old row can never be edited through a new dictionary UI.
    const listBelongsToCurrentDictionary = loadedDictionaryId === dictionary.id;
    const visibleEntries = listBelongsToCurrentDictionary ? entries : [];
    const visibleTotal = listBelongsToCurrentDictionary ? total : 0;
    const visiblePage = listBelongsToCurrentDictionary ? page : 1;
    const visibleListError = listBelongsToCurrentDictionary ? listError : null;
    const pageCount = dictionaryEntryPageCount(visibleTotal, pageSize);
    const shouldShowLoading = isLoadingEntries || !listBelongsToCurrentDictionary;
    const isBusy = isSaving || shouldShowLoading;
    const isListLocked = isBusy || Boolean(editingEntry);

    // A response from an earlier search/filter must never overwrite the most
    // recent list. This is deliberately client-side because a Server Action
    // call cannot be aborted once dispatched.
    const loadEntries = async (opts?: EntryLoadOptions) => {
        const requestId = ++loadSequence.current;
        const requestDictionaryId = dictionary.id;
        const curPage = opts?.page ?? page;
        const curSize = opts?.pageSize ?? pageSize;
        const term = opts?.term ?? searchTerm;
        const origin = opts?.origin ?? originFilter;
        setIsLoadingEntries(true);
        setListError(null);
        try {
            const result = await fetchDictionaryEntriesPagedAction(
                requestDictionaryId,
                curPage,
                curSize,
                term,
                origin || undefined
            );
            if (!result.success || !result.data) {
                throw new Error(result.error || t('entryLoadFailed'));
            }
            if (
                requestId !== loadSequence.current ||
                requestDictionaryId !== activeDictionaryIdRef.current
            ) {
                return false;
            }

            setEntries(
                result.data.map((entry: any) => ({
                    id: entry.id,
                    sourceText: entry.sourceText,
                    targetText: entry.targetText,
                    notes: entry.notes ?? null,
                    explanation: entry.explanation ?? null,
                    context: entry.context ?? null,
                    createdById: entry.createdById ?? null,
                    updatedById: entry.updatedById ?? null,
                    createdAt: new Date(entry.createdAt as any),
                    updatedAt: new Date(entry.updatedAt as any),
                    dictionaryId: entry.dictionaryId,
                    enabled: entry.enabled === true,
                    origin: entry.origin ?? null,
                }))
            );
            setLoadedDictionaryId(requestDictionaryId);
            setTotal((result as any).total ?? 0);
            setPage((result as any).page ?? curPage);
            setPageSize((result as any).pageSize ?? curSize);
            return true;
        } catch (error) {
            if (
                requestId !== loadSequence.current ||
                requestDictionaryId !== activeDictionaryIdRef.current
            ) {
                return false;
            }
            logger.error('加载词典条目失败:', error);
            setListError(t('entryLoadFailed'));
            return false;
        } finally {
            if (
                requestId === loadSequence.current &&
                requestDictionaryId === activeDictionaryIdRef.current
            ) {
                setIsLoadingEntries(false);
            }
        }
    };

    useEffect(() => {
        // Reset drafts and visible pagination immediately when the manager is
        // retargeted. The guarded loader below will fill in the new rows.
        loadSequence.current += 1;
        setLoadedDictionaryId(null);
        setEntries([]);
        setTotal(0);
        setPage(1);
        setEditingEntry(null);
        setEditForm({ sourceText: '', targetText: '', notes: '' });
        setListError(null);
    }, [dictionary.id]);

    useEffect(() => {
        const delay = searchTerm || originFilter ? 300 : 0;
        const timer = setTimeout(() => {
            void loadEntries({ page: 1, pageSize, term: searchTerm, origin: originFilter });
        }, delay);

        return () => {
            clearTimeout(timer);
            loadSequence.current += 1;
        };
    }, [dictionary.id, searchTerm, originFilter, pageSize]);

    const handleAddEntry = () => {
        if (!canWrite || isBusy) return;
        const newEntry: DictionaryEntry = {
            id: `temp-${Date.now()}`,
            sourceText: '',
            targetText: '',
            notes: null,
            explanation: null,
            context: null,
            createdById: null,
            updatedById: null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            dictionaryId: dictionary.id,
            origin: null as any,
        };

        setEntries(current => [newEntry, ...current]);
        setEditingEntry(newEntry.id);
        setEditForm({ sourceText: '', targetText: '', notes: '' });
    };

    const handleEditEntry = (entry: DictionaryEntry) => {
        if (!canWrite || isBusy) return;
        setEditingEntry(entry.id);
        setEditForm({
            sourceText: entry.sourceText,
            targetText: entry.targetText,
            notes: entry.notes ?? '',
        });
    };

    const handleSaveEntry = async (entryId: string) => {
        if (!canWrite) return;
        if (!editForm.sourceText.trim() || !editForm.targetText.trim()) {
            toast.error(t('entryRequired'));
            return;
        }

        const isNewEntry = entryId.startsWith('temp-');
        let saved = false;
        setIsSaving(true);
        try {
            if (isNewEntry) {
                // 新建条目
                const result = await createDictionaryEntryAction({
                    sourceText: editForm.sourceText,
                    targetText: editForm.targetText,
                    notes: editForm.notes,
                    dictionaryId: dictionary.id,
                });

                if (result.success && result.data) {
                    saved = true;
                    toast.success(t('entryCreated'));
                } else {
                    toast.error(result.error ?? t('entryCreateFailed'));
                }
            } else {
                // 更新现有条目
                const result = await updateDictionaryEntryAction(entryId, {
                    sourceText: editForm.sourceText,
                    targetText: editForm.targetText,
                    notes: editForm.notes,
                });

                if (result.success && result.data) {
                    saved = true;
                    toast.success(t('entryUpdated'));
                } else {
                    toast.error(result.error ?? t('entryUpdateFailed'));
                }
            }

            // A failed mutation keeps the draft open. Clearing it would turn a
            // temporary outage into irreversible user data loss.
            if (saved) {
                setEditingEntry(null);
                setEditForm({ sourceText: '', targetText: '', notes: '' });
                await loadEntries({ page: isNewEntry ? 1 : page });
            }
        } catch (error) {
            logger.error('保存词条失败:', error);
            toast.error(t('entrySaveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = (entryId: string | null = editingEntry) => {
        setEditingEntry(null);
        setEditForm({ sourceText: '', targetText: '', notes: '' });

        if (entryId?.startsWith('temp-')) {
            setEntries(current => current.filter(entry => entry.id !== entryId));
        }
    };

    const handleDeleteEntry = async (entryId: string) => {
        if (!canWrite) return;
        if (entryId.startsWith('temp-')) {
            setEntries(current => current.filter(entry => entry.id !== entryId));
            return;
        }

        setIsSaving(true);
        try {
            const result = await deleteDictionaryEntryAction(entryId);
            if (result.success) {
                toast.success(t('entryDeleted'));
                await loadEntries();
            } else {
                toast.error(result.error ?? t('entryDeleteFailed'));
            }
        } catch (error) {
            logger.error('删除词条失败:', error);
            toast.error(t('entryDeleteFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    const handleToggleEnabled = async (entry: DictionaryEntry, value: boolean) => {
        if (!canWrite) return;
        try {
            setIsSaving(true);
            const result = await updateDictionaryEntryAction(entry.id, { enabled: value });
            if (result.success) {
                setEntries(prev =>
                    prev.map(e => (e.id === entry.id ? { ...e, enabled: value } : e))
                );
                toast.success(value ? t('entryEnabled') : t('entryDisabled'));
            } else {
                toast.error(result.error ?? t('entryStateUpdateFailed'));
            }
        } catch (error) {
            logger.error('切换启用状态失败:', error);
            toast.error(t('entryStateUpdateFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="gap-4 border-b border-border/70 bg-muted/25 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {t('termItem')}
                        </p>
                        <CardTitle className="mt-1 text-xl tracking-tight">
                            {visibleTotal.toLocaleString()} {t('entries')}
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                            {visiblePage} / {pageCount} {t('pages')}
                            {shouldShowLoading ? ` · ${t('entryLoading')}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {canWrite && (
                            <ImportDictionaryEntriesDialog
                                dictionaryId={dictionary.id}
                                onCompleted={() => void loadEntries({ page: 1 })}
                                disabled={isListLocked}
                            />
                        )}
                        <Button
                            onClick={handleAddEntry}
                            size="sm"
                            disabled={isListLocked || !canWrite}
                            title={!canWrite ? t('readOnlyDictionary') : undefined}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('addEntry')}
                        </Button>
                        {onDictionaryDeleted && canWrite && (
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={isListLocked}
                                onClick={async () => {
                                    if (
                                        !confirm(
                                            t('DeleteDialog.description', {
                                                name: dictionary.name,
                                                count: visibleTotal.toLocaleString(),
                                            })
                                        )
                                    ) {
                                        return;
                                    }
                                    setIsSaving(true);
                                    try {
                                        const result = await deleteDictionaryAction(dictionary.id);
                                        if (result.success) {
                                            onDictionaryDeleted(dictionary.id);
                                            toast.success(t('deleteSuccess'));
                                        } else {
                                            toast.error(result.error ?? t('DeleteDialog.deleteFailed'));
                                        }
                                    } catch (error) {
                                        logger.error('删除词典失败:', error);
                                        toast.error(t('DeleteDialog.deleteError'));
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('deleteDictionary')}
                            </Button>
                        )}
                    </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id={`dictionary-${dictionary.id}-search`}
                            type="search"
                            placeholder={`${t('searchItem')}...`}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="h-9 bg-background pl-9"
                            disabled={isSaving || Boolean(editingEntry)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Label
                            htmlFor={`dictionary-${dictionary.id}-origin`}
                            className="shrink-0 text-xs text-muted-foreground"
                        >
                            {t('origin')}
                        </Label>
                        <select
                            id={`dictionary-${dictionary.id}-origin`}
                            value={originFilter}
                            onChange={e => setOriginFilter(e.target.value)}
                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving || Boolean(editingEntry)}
                        >
                            <option value="">{t('all')}</option>
                            <option value="manual">{t('manual')}</option>
                            <option value="import:xlsx">{t('importExcel')}</option>
                            <option value="import:tbx">{t('importTbx')}</option>
                            <option value="import:client">{t('importClient')}</option>
                            <option value="apply:new">{t('applyNew')}</option>
                            <option value="apply:copied">{t('applyCopied')}</option>
                            <option value="apply:user">{t('applyUser')}</option>
                            <option value="apply:mt">{t('applyMachineTranslation')}</option>
                        </select>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6" aria-busy={shouldShowLoading}>
                {visibleListError ? (
                    <div
                        role="alert"
                        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/35 bg-destructive/5 p-6 text-center"
                    >
                        <p className="text-sm text-destructive">{visibleListError}</p>
                        <Button variant="outline" size="sm" onClick={() => loadEntries()}>
                            {t('retry')}
                        </Button>
                    </div>
                ) : (
                    <ScrollArea className="h-[min(52vh,34rem)] pr-3">
                        <div className="space-y-2">
                            {visibleEntries.map(entry => (
                                <div
                                    key={entry.id}
                                    className="rounded-xl border border-border/80 bg-background p-3 transition-colors hover:bg-muted/20 sm:p-4"
                                >
                                    {editingEntry === entry.id ? (
                                        <div className="space-y-3">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <Label htmlFor={`source-${entry.id}`}>
                                                        {t('sourceLanguage')}
                                                    </Label>
                                                    <Input
                                                        id={`source-${entry.id}`}
                                                        value={editForm.sourceText}
                                                        onChange={e =>
                                                            handleInputChange(
                                                                'sourceText',
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder={t('enterSourceLanguageTerm')}
                                                        disabled={isBusy}
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor={`target-${entry.id}`}>
                                                        {t('targetLanguage')}
                                                    </Label>
                                                    <Input
                                                        id={`target-${entry.id}`}
                                                        value={editForm.targetText}
                                                        onChange={e =>
                                                            handleInputChange(
                                                                'targetText',
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder={t('enterTargetLanguageTerm')}
                                                        disabled={isBusy}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label htmlFor={`notes-${entry.id}`}>
                                                    {t('notes')}
                                                </Label>
                                                <Textarea
                                                    id={`notes-${entry.id}`}
                                                    value={editForm.notes}
                                                    onChange={e =>
                                                        handleInputChange('notes', e.target.value)
                                                    }
                                                    placeholder={t('enterNotes')}
                                                    rows={2}
                                                    disabled={isBusy}
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleCancelEdit(entry.id)}
                                                    disabled={isBusy}
                                                >
                                                    {t('cancel')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveEntry(entry.id)}
                                                    disabled={isBusy}
                                                >
                                                    {isSaving ? t('entrySaving') : t('entrySave')}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                                                <div className="min-w-0">
                                                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                        {t('sourceLanguage')}
                                                    </Label>
                                                    <p className="mt-1 break-words text-sm leading-6">
                                                        {entry.sourceText}
                                                    </p>
                                                </div>
                                                <div className="min-w-0 border-border/70 sm:border-l sm:pl-3">
                                                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                        {t('targetLanguage')}
                                                    </Label>
                                                    <p className="mt-1 break-words text-sm leading-6">
                                                        {entry.targetText}
                                                    </p>
                                                </div>
                                                <div className="min-w-0 border-t border-border/60 pt-2 sm:col-span-2">
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        <span className="text-xs font-medium text-muted-foreground">
                                                            {t('notes')}
                                                        </span>
                                                        <p className="break-words text-sm text-muted-foreground">
                                                            {entry.notes || '—'}
                                                        </p>
                                                        {(entry as any).origin && (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                                {t('origin')}: {String((entry as any).origin)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
                                                <div className="flex items-center gap-2">
                                                    <Label
                                                        htmlFor={`entry-${entry.id}-enabled`}
                                                        className="text-xs text-muted-foreground"
                                                    >
                                                        {t('enabled')}
                                                    </Label>
                                                    <Switch
                                                        id={`entry-${entry.id}-enabled`}
                                                        checked={!!(entry as any).enabled}
                                                        onCheckedChange={checked =>
                                                            handleToggleEnabled(entry, !!checked)
                                                        }
                                                        disabled={isListLocked || !canWrite}
                                                    />
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEditEntry(entry)}
                                                        disabled={isListLocked || !canWrite}
                                                        title={
                                                            !canWrite
                                                                ? t('readOnlyDictionary')
                                                                : t('editEntry')
                                                        }
                                                        aria-label={t('editEntry')}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteEntry(entry.id)}
                                                        className="text-destructive hover:text-destructive"
                                                        disabled={isListLocked || !canWrite}
                                                        title={
                                                            !canWrite
                                                                ? t('cannotDeleteReadOnlyEntry')
                                                                : t('deleteEntry')
                                                        }
                                                        aria-label={t('deleteEntry')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {!shouldShowLoading && visibleEntries.length === 0 && (
                                <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    {searchTerm || originFilter
                                        ? t('noMatchingEntries')
                                        : t('noEntries')}
                                </div>
                            )}
                            {shouldShowLoading && visibleEntries.length === 0 && (
                                <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                                    {t('entryLoading')}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}
                <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <Label htmlFor={`dictionary-${dictionary.id}-page-size`}>
                            {t('entriesPerPage')}
                        </Label>
                        <select
                            id={`dictionary-${dictionary.id}-page-size`}
                            value={pageSize}
                            onChange={e => {
                                setPage(1);
                                setPageSize(Number(e.target.value));
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isListLocked}
                        >
                            {DICTIONARY_ENTRY_PAGE_SIZE_OPTIONS.map(size => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isListLocked || visiblePage <= 1}
                            onClick={() => {
                                void loadEntries({ page: visiblePage - 1 });
                            }}
                        >
                            {t('previousPage')}
                        </Button>
                        <span className="min-w-20 text-center text-xs text-muted-foreground" aria-live="polite">
                            {visiblePage} / {pageCount} {t('pages')}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isListLocked || visiblePage >= pageCount}
                            onClick={() => {
                                void loadEntries({ page: visiblePage + 1 });
                            }}
                        >
                            {t('nextPage')}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
