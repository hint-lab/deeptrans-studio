'use client';

import { createMemoryAction, deleteMemoryAction, listMemoriesAction } from '@/actions/memories';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import {
    AlertTriangle,
    BarChart3,
    ChevronDown,
    Database,
    Download,
    Eye,
    FileText,
    Languages,
    LayoutGrid,
    List,
    Loader2,
    MoreHorizontal,
    Plus,
    Search,
    Settings,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ImportMemoryDialog } from './components/import-memory-dialog';
import { MemoryImportHelpDialog } from './components/memory-import-guide';
import { MemoryResourceCard, type MemorySummary } from './components/memory-resource-card';
import { MemorySettingsDialog } from './components/memory-settings-dialog';

function filenameFromContentDisposition(header: string | null) {
    if (!header) return null;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
    const quoted = /filename="([^"]+)"/i.exec(header)?.[1];
    let candidate = quoted;
    if (utf8) {
        try {
            candidate = decodeURIComponent(utf8);
        } catch {
            // Fall back to the ASCII filename when a malformed proxy header is returned.
        }
    }
    return candidate?.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_') || null;
}

export default function MemoriesPage() {
    const t = useTranslations('Dashboard.Memories');
    const locale = useLocale();
    const [loading, setLoading] = useState(true);
    const [memoryLoadFailed, setMemoryLoadFailed] = useState(false);
    const [memories, setMemories] = useState<MemorySummary[]>([]);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsMemoryId, setSettingsMemoryId] = useState('');
    const [exportingTarget, setExportingTarget] = useState<string | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<MemorySummary | null>(null);
    const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

    const showRetryableError = (title: string) => {
        toast.error(title, { description: t('retryLater') });
    };

    const loadMemories = async () => {
        setLoading(true);
        setMemoryLoadFailed(false);
        try {
            const result = (await listMemoriesAction()) as {
                success: boolean;
                data?: MemorySummary[];
            };
            if (!result.success) {
                setMemories([]);
                setMemoryLoadFailed(true);
                showRetryableError(t('loadFailed'));
                return;
            }
            setMemories(result.data ?? []);
        } catch {
            setMemories([]);
            setMemoryLoadFailed(true);
            showRetryableError(t('loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadMemories();
    }, []);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name) {
            toast.info(t('pleaseEnterName'));
            return;
        }

        setCreating(true);
        try {
            const result = await createMemoryAction({ name });
            if (!result.success) {
                showRetryableError(t('createFailed'));
                return;
            }
            setNewName('');
            toast.success(t('createSuccess'));
            await loadMemories();
        } catch {
            showRetryableError(t('createFailed'));
        } finally {
            setCreating(false);
        }
    };

    const requestDelete = (memory: MemorySummary) => {
        if (!deletingMemoryId) setDeleteCandidate(memory);
    };

    const confirmDelete = async () => {
        const memory = deleteCandidate;
        if (!memory || deletingMemoryId) return;

        setDeletingMemoryId(memory.id);
        try {
            const result = await deleteMemoryAction(memory.id);
            if (!result.success) {
                showRetryableError(t('deleteFailed'));
                return;
            }
            toast.success(t('deleteSuccess'));
            setDeleteCandidate(null);
            await loadMemories();
        } catch {
            showRetryableError(t('deleteFailed'));
        } finally {
            setDeletingMemoryId(null);
        }
    };

    const handleDeleteDialogOpenChange = (open: boolean) => {
        if (!open && !deletingMemoryId) setDeleteCandidate(null);
    };

    const handleExport = async (target: 'all' | { memoryId: string }, format: 'tmx' | 'csv') => {
        const exportKey =
            target === 'all' ? `all:${format}` : `memory:${target.memoryId}:${format}`;
        if (exportingTarget) return;

        setExportingTarget(exportKey);
        try {
            const params = new URLSearchParams({ format });
            if (target === 'all') params.set('scope', 'all');
            else params.set('memoryId', target.memoryId);

            const response = await fetch(`/api/memories/export?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'same-origin',
            });
            if (!response.ok) {
                toast.error(t('exportFailed'), {
                    description: response.status === 413 ? t('exportTooLarge') : t('retryLater'),
                });
                return;
            }

            const blob = await response.blob();
            if (!blob.size) {
                showRetryableError(t('exportFailed'));
                return;
            }

            const filename =
                filenameFromContentDisposition(response.headers.get('content-disposition')) ||
                `deeptrans-${target === 'all' ? 'memories' : 'memory'}.${format}`;
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
            toast.success(t('exportStarted', { format: format.toUpperCase() }));
        } catch {
            showRetryableError(t('exportFailed'));
        } finally {
            setExportingTarget(null);
        }
    };

    const handleSettings = (memory: MemorySummary) => {
        setSettingsMemoryId(memory.id);
        setSettingsOpen(true);
    };

    const settingsMemory = memories.find(memory => memory.id === settingsMemoryId);
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase(locale);
    const filteredMemories = memories.filter(
        memory =>
            memory.name.toLocaleLowerCase(locale).includes(normalizedQuery) ||
            memory.description?.toLocaleLowerCase(locale).includes(normalizedQuery)
    );
    const formatDate = (date?: string) => {
        if (!date) return t('noDate');
        try {
            return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }).format(new Date(date));
        } catch {
            return t('noDate');
        }
    };
    const totalEntries = memories.reduce((sum, memory) => sum + (memory._count?.entries ?? 0), 0);
    const activeMemories = memories.filter(memory => (memory._count?.entries ?? 0) > 0).length;
    const languagePairCount = new Set(
        memories.map(
            memory => `${memory.sourceLanguage || 'auto'}-${memory.targetLanguage || 'zh'}`
        )
    ).size;

    const renderMemoryActions = (memory: MemorySummary) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t('memoryActions', { name: memory.name })}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem asChild>
                    <a
                        href={`/dashboard/memories/${memory.id}`}
                        className="flex items-center gap-2"
                    >
                        <Eye className="h-4 w-4" />
                        {t('viewDetails')}
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void handleExport({ memoryId: memory.id }, 'tmx')}
                    disabled={exportingTarget !== null}
                    className="flex items-center gap-2"
                >
                    {exportingTarget === `memory:${memory.id}:tmx` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {exportingTarget === `memory:${memory.id}:tmx`
                        ? t('exporting')
                        : t('exportTmx')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void handleExport({ memoryId: memory.id }, 'csv')}
                    disabled={exportingTarget !== null}
                    className="flex items-center gap-2"
                >
                    {exportingTarget === `memory:${memory.id}:csv` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {exportingTarget === `memory:${memory.id}:csv`
                        ? t('exporting')
                        : t('exportCsv')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleSettings(memory)}
                    className="flex items-center gap-2"
                >
                    <Settings className="h-4 w-4" />
                    {t('settings')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => requestDelete(memory)}
                    disabled={deletingMemoryId !== null}
                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                    {t('delete')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:p-6">
            <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                            {t('title')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <MemoryImportHelpDialog />
                        <ImportMemoryDialog onCompleted={loadMemories} />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    disabled={exportingTarget !== null}
                                >
                                    {exportingTarget?.startsWith('all:') ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Download className="h-3.5 w-3.5" />
                                    )}
                                    {exportingTarget?.startsWith('all:')
                                        ? t('exporting')
                                        : t('exportAll')}
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[176px]">
                                <DropdownMenuItem
                                    onClick={() => void handleExport('all', 'tmx')}
                                    disabled={exportingTarget !== null}
                                    className="flex items-center gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    {t('exportTmx')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => void handleExport('all', 'csv')}
                                    disabled={exportingTarget !== null}
                                    className="flex items-center gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    {t('exportCsv')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <section
                    aria-label={t('title')}
                    className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-md border bg-card md:grid-cols-4 md:divide-y-0"
                >
                    {[
                        { label: t('totalMemories'), value: memories.length, Icon: Database },
                        {
                            label: t('totalEntries'),
                            value: totalEntries.toLocaleString(),
                            Icon: FileText,
                        },
                        { label: t('activeMemories'), value: activeMemories, Icon: BarChart3 },
                        { label: t('languagePairs'), value: languagePairCount, Icon: Languages },
                    ].map(({ label, value, Icon }) => (
                        <div key={label} className="flex items-center gap-2.5 px-3 py-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[11px] leading-4 text-muted-foreground">
                                    {label}
                                </p>
                                <p className="font-mono text-base font-semibold tabular-nums leading-5 text-foreground">
                                    {value}
                                </p>
                            </div>
                        </div>
                    ))}
                </section>

                <div className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-center">
                    <div className="relative max-w-md flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('searchPlaceholder')}
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            className="h-8 border-transparent bg-muted/45 pl-9 shadow-none focus-visible:border-input focus-visible:bg-background"
                        />
                    </div>
                    <div className="flex items-center gap-1" role="group" aria-label={t('title')}>
                        <Button
                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('grid')}
                            aria-label={t('gridView')}
                            aria-pressed={viewMode === 'grid'}
                            title={t('gridView')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('list')}
                            aria-label={t('listView')}
                            aria-pressed={viewMode === 'list'}
                            title={t('listView')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <section
                    aria-labelledby="memory-quick-create-title"
                    className="flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center"
                >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <h2
                                id="memory-quick-create-title"
                                className="text-sm font-semibold text-foreground"
                            >
                                {t('quickCreate')}
                            </h2>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {t('quickCreateDesc')}
                            </p>
                        </div>
                    </div>
                    <div className="flex min-w-0 gap-2 sm:min-w-fit">
                        <Input
                            placeholder={t('memoryName')}
                            value={newName}
                            onChange={event => setNewName(event.target.value)}
                            className="h-8 flex-1 sm:w-64"
                            onKeyDown={event => {
                                if (event.key === 'Enter') void handleCreate();
                            }}
                        />
                        <Button
                            size="sm"
                            onClick={() => void handleCreate()}
                            disabled={creating || !newName.trim()}
                            className="gap-1.5 whitespace-nowrap"
                        >
                            {creating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Plus className="h-3.5 w-3.5" />
                            )}
                            {creating ? t('creating') : t('create')}
                        </Button>
                    </div>
                </section>

                {loading ? (
                    <Card>
                        <CardContent className="flex min-h-32 items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
                            <Loader2
                                className="h-5 w-5 animate-spin text-primary"
                                aria-hidden="true"
                            />
                            {t('loading')}
                        </CardContent>
                    </Card>
                ) : memoryLoadFailed ? (
                    <Card>
                        <CardContent className="flex min-h-32 flex-col items-center justify-center gap-3 p-6 text-center">
                            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    {t('loadUnavailable')}
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {t('retryLater')}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => void loadMemories()}>
                                {t('retryLoad')}
                            </Button>
                        </CardContent>
                    </Card>
                ) : filteredMemories.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <Database
                                className="mx-auto mb-3 h-9 w-9 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <h2 className="text-base font-semibold text-foreground">
                                {searchQuery ? t('noResults') : t('noMemories')}
                            </h2>
                            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                                {searchQuery ? t('adjustSearch') : t('createFirstDesc')}
                            </p>
                            {!searchQuery && (
                                <div className="mt-4 flex justify-center gap-2">
                                    <Button
                                        onClick={() => setNewName(t('newMemory'))}
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        {t('createMemory')}
                                    </Button>
                                    <ImportMemoryDialog onCompleted={loadMemories} />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <section
                        aria-label={t('title')}
                        className={
                            viewMode === 'grid'
                                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
                                : 'space-y-2'
                        }
                    >
                        {filteredMemories.map(memory => (
                            <MemoryResourceCard
                                key={memory.id}
                                memory={memory}
                                viewMode={viewMode}
                                formatDate={formatDate}
                                labels={{
                                    viewMemory: t('viewMemory'),
                                    noDescription: t('noDescription'),
                                    entriesShort: t('entriesShort'),
                                    updatedShort: t('updatedShort'),
                                }}
                                actions={renderMemoryActions(memory)}
                            />
                        ))}
                    </section>
                )}
            </div>

            <MemorySettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                memoryId={settingsMemoryId}
                sourceLanguage={settingsMemory?.sourceLanguage}
                targetLanguage={settingsMemory?.targetLanguage}
                onUpdated={loadMemories}
            />
            <Dialog open={deleteCandidate !== null} onOpenChange={handleDeleteDialogOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('DeleteDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {deleteCandidate &&
                                t('DeleteDialog.description', {
                                    name: deleteCandidate.name,
                                    count: (deleteCandidate._count?.entries ?? 0).toLocaleString(),
                                })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-foreground">
                        <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                            aria-hidden="true"
                        />
                        <p>{t('DeleteDialog.irreversible')}</p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteCandidate(null)}
                            disabled={deletingMemoryId !== null}
                        >
                            {t('DeleteDialog.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void confirmDelete()}
                            disabled={deletingMemoryId !== null || !deleteCandidate}
                        >
                            {deletingMemoryId
                                ? t('DeleteDialog.deleting')
                                : t('DeleteDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
