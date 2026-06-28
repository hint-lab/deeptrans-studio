'use client';

import { Button } from '@/components/ui/button';
import { ImportMemoryDialog } from './components/import-memory-dialog';
import { listMemoriesAction, createMemoryAction, deleteMemoryAction } from '@/actions/memories';
import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Trash2,
    Database,
    Plus,
    Search,
    Download,
    FileText,
    Calendar,
    Languages,
    BarChart3,
    Settings,
    Eye,
    MoreHorizontal,
    LayoutGrid,
    List,
} from 'lucide-react';
import { useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemorySettingsDialog } from './components/memory-settings-dialog';
import { useTranslations, useLocale } from 'next-intl';

export default function MemoriesPage() {
    const t = useTranslations('Dashboard.Memories');
    const locale = useLocale();
    const [loading, setLoading] = useState(true);
    const [memories, setMemories] = useState<
        Array<{
            id: string;
            name: string;
            description?: string;
            _count?: { entries: number };
            createdAt?: string;
            updatedAt?: string;
            sourceLanguage?: string;
            targetLanguage?: string;
        }>
    >([]);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsMemoryId, setSettingsMemoryId] = useState<string>('');

    const loadMemories = async () => {
        setLoading(true);
        try {
            const res = (await listMemoriesAction()) as {
                success: boolean;
                data?: Array<{
                    id: string;
                    name: string;
                    description?: string;
                    _count?: { entries: number };
                }>;
                error?: string;
            };
            if (res.success) setMemories(res.data ?? []);
            else toast.error(res.error ?? '加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadMemories();
    }, []);

    const handleCreate = async () => {
        if (!newName.trim()) {
            toast.info('请输入名称');
            return;
        }
        setCreating(true);
        try {
            const res = await createMemoryAction({ name: newName.trim() });
            if (!res.success) {
                const message = typeof res.error === 'string' ? res.error : '创建失败';
                throw new Error(message);
            }
            setNewName('');
            toast.success('创建成功');
            void loadMemories();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            toast.error('创建失败' + message);
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await deleteMemoryAction(id);
            if (!res.success) {
                const message =
                    typeof (res as { error?: string }).error === 'string'
                        ? (res as { error?: string }).error
                        : '删除失败';
                throw new Error(message);
            }
            toast.success('已删除');
            void loadMemories();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            toast.error('删除失败' + message);
        }
    };

    const handleExport = async (id: string) => {
        toast.info('导出准备中', { description: '即将支持导出 TMX/CSV' });
    };

    const handleSettings = (id: string) => {
        setSettingsMemoryId(id);
        setSettingsOpen(true);
    };

    // 过滤记忆库
    const filteredMemories = memories.filter(
        memory =>
            memory.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (memory.description &&
                memory.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // 格式化日期
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return t('noDate');
        try {
            return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }).format(new Date(dateStr));
        } catch {
            return t('noDate');
        }
    };

    // 获取记忆库大小等级（用于展示）
    const getMemorySize = (entryCount: number) => {
        if (entryCount >= 10000)
            return {
                label: t('sizeLarge'),
                color: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            };
        if (entryCount >= 1000)
            return {
                label: t('sizeMedium'),
                color: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            };
        if (entryCount >= 100)
            return {
                label: t('sizeSmall'),
                color: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            };
        return {
            label: t('sizeTiny'),
            color: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        };
    };

    return (
        <div className="mx-auto w-full max-w-7xl p-6">
            <div className="space-y-6">
                {/* Header Section */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            {t('title')}
                        </h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            {t('description')}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <ImportMemoryDialog onCompleted={loadMemories} />
                        <Button variant="outline" className="gap-2">
                            <Download className="h-4 w-4" />
                            {t('exportAll')}
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Card className="border bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('totalMemories')}
                                    </p>
                                    <p className="text-2xl font-semibold text-foreground">
                                        {memories.length}
                                    </p>
                                </div>
                                <Database className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('totalEntries')}
                                    </p>
                                    <p className="text-2xl font-semibold text-foreground">
                                        {memories
                                            .reduce((sum, m) => sum + (m._count?.entries ?? 0), 0)
                                            .toLocaleString()}
                                    </p>
                                </div>
                                <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('activeMemories')}
                                    </p>
                                    <p className="text-2xl font-semibold text-foreground">
                                        {memories.filter(m => (m._count?.entries ?? 0) > 0).length}
                                    </p>
                                </div>
                                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('languagePairs')}
                                    </p>
                                    <p className="text-2xl font-semibold text-foreground">
                                        {
                                            new Set(
                                                memories.map(
                                                    m =>
                                                        `${m.sourceLanguage || 'auto'}-${m.targetLanguage || 'zh'}`
                                                )
                                            ).size
                                        }
                                    </p>
                                </div>
                                <Languages className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Toolbar */}
                <Card className="border bg-card">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="relative max-w-md flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                                <Input
                                    placeholder={t('searchPlaceholder')}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                                    size="icon"
                                    onClick={() => setViewMode('grid')}
                                    title={t('gridView')}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'outline'}
                                    size="icon"
                                    onClick={() => setViewMode('list')}
                                    title={t('listView')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Create Card */}
                <Card className="border bg-card">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex-1">
                                <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">
                                    {t('quickCreate')}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {t('quickCreateDesc')}
                                </p>
                            </div>
                            <div className="flex min-w-0 gap-2 sm:min-w-fit">
                                <Input
                                    placeholder={t('memoryName')}
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="flex-1 sm:w-64"
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                />
                                <Button
                                    onClick={handleCreate}
                                    disabled={creating || !newName.trim()}
                                    className="gap-2 whitespace-nowrap"
                                >
                                    {creating ? (
                                        <>
                                            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                                            创建中
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4" />
                                            {t('create')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Memory Libraries Grid/List */}
                {loading ? (
                    <Card>
                        <CardContent className="p-8">
                            <div className="flex items-center justify-center">
                                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                                <span className="ml-3 text-gray-600 dark:text-gray-400">
                                    {t('loading')}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ) : filteredMemories.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <Database className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                                {searchQuery ? t('noResults') : t('noMemories')}
                            </h3>
                            <p className="mb-4 text-gray-600 dark:text-gray-400">
                                {searchQuery ? t('adjustSearch') : t('createFirstDesc')}
                            </p>
                            {!searchQuery && (
                                <div className="flex justify-center gap-3">
                                    <Button
                                        onClick={() => setNewName(t('newMemory'))}
                                        variant="outline"
                                        className="gap-2"
                                    >
                                        <Plus className="h-4 w-4" />
                                        {t('createMemory')}
                                    </Button>
                                    <ImportMemoryDialog onCompleted={loadMemories} />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <div
                        className={
                            viewMode === 'grid'
                                ? 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
                                : 'space-y-3'
                        }
                    >
                        {filteredMemories.map(memory => {
                            const entryCount = memory._count?.entries ?? 0;
                            const sizeInfo = getMemorySize(entryCount);

                            return viewMode === 'grid' ? (
                                /* Grid Card View */
                                <Card
                                    key={memory.id}
                                    className="group border bg-card transition-colors hover:border-muted-foreground/30"
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 flex-1">
                                                <CardTitle className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                                                    {memory.name}
                                                </CardTitle>
                                                <CardDescription className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                    {memory.description || t('noDescription')}
                                                </CardDescription>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    align="end"
                                                    className="min-w-[180px]"
                                                >
                                                    <DropdownMenuItem asChild>
                                                        <a
                                                            href={`/dashboard/memories/${memory.id}`}
                                                            className="flex items-center justify-between gap-2"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <Eye className="h-4 w-4" />{' '}
                                                                {t('viewDetails')}
                                                            </span>
                                                        </a>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleExport(memory.id)}
                                                        className="flex items-center justify-between"
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Download className="h-4 w-4" />{' '}
                                                            {t('export')}
                                                        </span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleSettings(memory.id)}
                                                        className="flex items-center justify-between"
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Settings className="h-4 w-4" />{' '}
                                                            {t('settings')}
                                                        </span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(memory.id)}
                                                        className="flex items-center justify-between text-red-600 focus:text-red-600"
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Trash2 className="h-4 w-4" />{' '}
                                                            {t('delete')}
                                                        </span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pt-0">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {t('entryCount')}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900 dark:text-white">
                                                        {entryCount.toLocaleString()}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-xs ${sizeInfo.color}`}
                                                    >
                                                        {sizeInfo.label}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {t('languagePairs')}
                                                </span>
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Languages className="h-3 w-3" />
                                                    <span>
                                                        {memory.sourceLanguage || 'auto'} →{' '}
                                                        {memory.targetLanguage || 'zh'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {t('updateTime')}
                                                </span>
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>{formatDate(memory.updatedAt)}</span>
                                                </div>
                                            </div>

                                            <div className="border-t pt-2">
                                                <Button asChild className="w-full">
                                                    <a href={`/dashboard/memories/${memory.id}`}>
                                                        {t('viewMemory')}
                                                    </a>
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                /* List View */
                                <Card
                                    key={memory.id}
                                    className="border bg-card transition-colors hover:border-muted-foreground/30"
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                                <div className="rounded-md border bg-muted/40 p-2">
                                                    <Database className="h-5 w-5 text-muted-foreground" />
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                                                        {memory.name}
                                                    </h3>
                                                    <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                                                        {memory.description || t('noDescription')}
                                                    </p>
                                                </div>

                                                <div className="hidden items-center gap-6 text-sm sm:flex">
                                                    <div className="text-center">
                                                        <div className="font-semibold text-gray-900 dark:text-white">
                                                            {entryCount.toLocaleString()}
                                                        </div>
                                                        <div className="text-gray-500">
                                                            {t('entriesShort')}
                                                        </div>
                                                    </div>

                                                    <div className="text-center">
                                                        <div className="font-semibold text-gray-900 dark:text-white">
                                                            {memory.sourceLanguage || 'auto'} →{' '}
                                                            {memory.targetLanguage || 'zh'}
                                                        </div>
                                                        <div className="text-gray-500">
                                                            {t('languagePairs')}
                                                        </div>
                                                    </div>

                                                    <div className="text-center">
                                                        <div className="font-semibold text-gray-900 dark:text-white">
                                                            {formatDate(memory.updatedAt)}
                                                        </div>
                                                        <div className="text-gray-500">
                                                            {t('updatedShort')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className={sizeInfo.color}>
                                                    {sizeInfo.label}
                                                </Badge>
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={`/dashboard/memories/${memory.id}`}>
                                                        {t('view')}
                                                    </a>
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        className="min-w-[180px]"
                                                    >
                                                        <DropdownMenuItem asChild>
                                                            <a
                                                                href={`/dashboard/memories/${memory.id}`}
                                                                className="flex items-center justify-between gap-2"
                                                            >
                                                                <span className="flex items-center gap-2">
                                                                    <Eye className="h-4 w-4" />{' '}
                                                                    {t('viewDetails')}
                                                                </span>
                                                            </a>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleExport(memory.id)}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <Download className="h-4 w-4" />{' '}
                                                                {t('export')}
                                                            </span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleSettings(memory.id)
                                                            }
                                                            className="flex items-center justify-between"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <Settings className="h-4 w-4" />{' '}
                                                                {t('settings')}
                                                            </span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleDelete(memory.id)}
                                                            className="flex items-center justify-between text-red-600 focus:text-red-600"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <Trash2 className="h-4 w-4" />{' '}
                                                                {t('delete')}
                                                            </span>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
            <MemorySettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                memoryId={settingsMemoryId}
                onUpdated={loadMemories}
            />
        </div>
    );
}
