'use client';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { enUS, zhCN } from 'date-fns/locale';
import { BookMarked, ChevronRight, Edit2, Library, Lock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ProjectDictionariesDialog, ProjectMemoriesDialog } from './project-resource-dialogs';

import { updateProjectInfoAction } from '@/actions/project';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createLogger } from '@/lib/logger';
import {
    getProjectDashboardHandoff,
    type ProjectDashboardStatusKey,
} from '@/lib/project-dashboard-entry';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
const logger = createLogger(
    {
        type: 'dashboard:project-list',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
// Avoid importing Prisma types in client components
type Project = {
    id: string;
    name: string | null;
    date: string | Date;
    sourceLanguage: string;
    targetLanguage: string;
    canWrite: boolean;
};
type ProjectWithDoc = Project & { documents?: { id: string; status?: string }[] };

function getProjectIconText(name?: string | null) {
    const trimmed = name?.trim();
    if (!trimmed) return '?';

    const firstChar = trimmed.charAt(0);
    if (/[^\x00-\x7F]/.test(firstChar)) return firstChar;

    return (trimmed.split(/[\s-_]+/)[0] ?? firstChar).slice(0, 2).toUpperCase();
}

function getCompactStatusClasses(statusKey: ProjectDashboardStatusKey) {
    switch (statusKey) {
        case 'completed':
            return 'text-emerald-600 dark:text-emerald-400';
        case 'preprocessed':
            return 'text-violet-600 dark:text-violet-400';
        case 'translating':
            return 'text-blue-600 dark:text-blue-400';
        case 'parsing':
        case 'segmenting':
        case 'termsExtracting':
            return 'text-amber-600 dark:text-amber-400';
        case 'error':
            return 'text-destructive';
        case 'waiting':
        case 'unknown':
        default:
            return 'text-muted-foreground';
    }
}

type DictionaryCleanupPreview = {
    id: string;
    name: string;
    entryCount: number;
    eligibleForCleanup: boolean;
};

type ProjectDictionaryCleanupPreview = {
    totalBound: number;
    eligibleForCleanup: number;
    retainedWhenCleanupRuns: number;
    dictionaries: DictionaryCleanupPreview[];
};

type ProjectDeletionResult = {
    success: true;
    project: { id: string; deleted: true };
    dictionaries: {
        totalBound: number;
        deleted: number;
        retained: number;
    };
};

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isDictionaryCleanupPreview(value: unknown): value is DictionaryCleanupPreview {
    if (!value || typeof value !== 'object') return false;

    const dictionary = value as Record<string, unknown>;
    return (
        typeof dictionary.id === 'string' &&
        typeof dictionary.name === 'string' &&
        isCount(dictionary.entryCount) &&
        typeof dictionary.eligibleForCleanup === 'boolean'
    );
}

export default function ProjectList({
    projects,
    onDeleted,
    onUpdated,
}: {
    projects: ProjectWithDoc[];
    onDeleted?: (id: string) => void;
    onUpdated?: (project: { id: string; name: string }) => void;
}) {
    const t = useTranslations('Dashboard.ProjectList');
    const locale = useLocale();
    const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
    const [editName, setEditName] = useState<string>('');
    const [dictDialog, setDictDialog] = useState<string | null>(null);
    const [memDialog, setMemDialog] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<{
        id: string;
        name: string;
        dictionaryCleanup?: ProjectDictionaryCleanupPreview;
        dictionaryCleanupUnavailable?: boolean;
    } | null>(null);

    const [isSavingProject, setIsSavingProject] = useState(false);

    const deleteProject = async (
        projectId: string,
        deleteEligibleDictionaries: boolean
    ): Promise<ProjectDeletionResult> => {
        const response = await fetch(`/api/projects/${projectId}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            // Preserve the explicit false choice while a client and server are being upgraded.
            body: JSON.stringify({
                deleteEligibleDictionaries,
                deleteDictionaries: deleteEligibleDictionaries,
            }),
        });

        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success === true && payload?.project?.deleted === true) {
            return payload as ProjectDeletionResult;
        }

        throw new Error(payload?.error || `Unable to delete project (${response.status})`);
    };

    // 点击删除按钮时获取词典信息
    const handleDeleteClick = async (project: ProjectWithDoc) => {
        try {
            // 获取项目关联的词典
            const response = await fetch(`/api/projects/${project.id}/dictionaries`);
            if (!response.ok) {
                throw new Error(`Unable to load dictionaries (${response.status})`);
            }

            const preview: unknown = await response.json();
            if (!preview || typeof preview !== 'object') {
                throw new Error('Invalid dictionary response');
            }

            const data = preview as {
                dictionaries?: unknown;
                cleanup?: {
                    totalBound?: unknown;
                    eligibleForCleanup?: unknown;
                    retainedWhenCleanupRuns?: unknown;
                };
            };
            const cleanup = data.cleanup;
            if (
                !Array.isArray(data.dictionaries) ||
                !data.dictionaries.every(isDictionaryCleanupPreview) ||
                !cleanup ||
                !isCount(cleanup.totalBound) ||
                !isCount(cleanup.eligibleForCleanup) ||
                !isCount(cleanup.retainedWhenCleanupRuns)
            ) {
                throw new Error('Invalid dictionary cleanup preview');
            }

            const eligibleDictionaries = data.dictionaries.filter(
                dictionary => dictionary.eligibleForCleanup
            );
            const { totalBound, eligibleForCleanup, retainedWhenCleanupRuns } = cleanup;
            if (
                totalBound !== data.dictionaries.length ||
                eligibleForCleanup !== eligibleDictionaries.length ||
                retainedWhenCleanupRuns !== totalBound - eligibleForCleanup
            ) {
                throw new Error('Inconsistent dictionary cleanup preview');
            }

            setDeleteTarget({
                id: project.id,
                name: project.name ?? '',
                dictionaryCleanup: {
                    totalBound,
                    eligibleForCleanup,
                    retainedWhenCleanupRuns,
                    dictionaries: eligibleDictionaries,
                },
            });
        } catch (error) {
            logger.error('获取词典信息失败:', error);
            // 无法确认词典状态时，保守地仅删除项目，避免误删自动生成的词典。
            setDeleteTarget({
                id: project.id,
                name: project.name ?? '',
                dictionaryCleanupUnavailable: true,
            });
        }
    };

    const handleProjectDeletion = async (deleteEligibleDictionaries: boolean) => {
        if (!deleteTarget) return;

        const projectId = deleteTarget.id;
        toast.loading(
            deleteEligibleDictionaries
                ? t('deletingWithEligibleDictionaries')
                : t('deletingProjectOnly'),
            { id: 'delete-project' }
        );

        try {
            const result = await deleteProject(projectId, deleteEligibleDictionaries);
            toast.success(t('projectDeleted'), {
                id: 'delete-project',
                description: t('deleteResultSummary', {
                    deleted: result.dictionaries.deleted,
                    retained: result.dictionaries.retained,
                    total: result.dictionaries.totalBound,
                }),
            });
            setDeleteTarget(null);
            onDeleted?.(projectId);
        } catch {
            toast.error(t('deleteFailed'), { id: 'delete-project' });
        }
    };

    const handleSaveProjectName = async () => {
        if (!editTarget || isSavingProject) return;

        const name = editName.trim();
        if (!name) {
            toast.error(t('nameRequired'));
            return;
        }

        setIsSavingProject(true);
        toast.loading(t('saving'), { id: 'edit-project' });

        try {
            const updatedProject = await updateProjectInfoAction(editTarget.id, { name });
            if (!updatedProject) {
                throw new Error('Project update returned no result');
            }

            onUpdated?.({ id: updatedProject.id, name: updatedProject.name ?? name });
            toast.success(t('projectUpdated'), { id: 'edit-project' });
            setEditTarget(null);
        } catch {
            toast.error(t('updateFailed'), { id: 'edit-project' });
        } finally {
            setIsSavingProject(false);
        }
    };
    const getProjectStatusLabel = (statusKey: ProjectDashboardStatusKey) => {
        switch (statusKey) {
            case 'waiting':
                return t('status.waiting');
            case 'parsing':
                return t('status.parsing');
            case 'segmenting':
                return t('status.segmenting');
            case 'termsExtracting':
                return t('status.termsExtracting');
            case 'preprocessed':
                return t('status.preprocessed');
            case 'translating':
                return t('status.translating');
            case 'completed':
                return t('status.completed');
            case 'error':
                return t('status.error');
            case 'unknown':
            default:
                return t('status.unknown');
        }
    };

    const getProjectActionLabel = (
        actionKey: ReturnType<typeof getProjectDashboardHandoff>['actionKey']
    ) => {
        switch (actionKey) {
            case 'continueSetup':
                return t('nextAction.continueSetup');
            case 'repairSetup':
                return t('nextAction.repairSetup');
            case 'startTranslation':
                return t('nextAction.startTranslation');
            case 'resumeTranslation':
                return t('nextAction.resumeTranslation');
            case 'contactOwner':
                return t('nextAction.contactOwner');
            case 'openWorkspace':
            default:
                return t('nextAction.openWorkspace');
        }
    };

    const formatProjectDate = (date: string | Date) => {
        try {
            return formatDistanceToNow(new Date(date), {
                addSuffix: true,
                locale: locale.startsWith('zh') ? zhCN : enUS,
            });
        } catch {
            return t('unknownDate');
        }
    };
    return (
        <>
            <div className="flex flex-col gap-2 pt-4" role="list" aria-label={t('projectList')}>
                {projects.map((project, index) => {
                    const projectName = project.name?.trim() || t('unnamedProject');
                    const entry = getProjectDashboardHandoff(
                        project.id,
                        project.documents?.[0]?.status,
                        project.canWrite
                    );
                    const statusLabel = getProjectStatusLabel(entry.statusKey);
                    const nextActionLabel = getProjectActionLabel(entry.actionKey);
                    const projectCard = (
                        <>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-700 text-xs font-semibold text-white shadow-sm">
                                {getProjectIconText(project.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <h3 className="truncate text-sm font-semibold text-foreground">
                                        {projectName}
                                    </h3>
                                    {!project.canWrite && (
                                        <span
                                            className="inline-flex shrink-0 items-center text-amber-700 dark:text-amber-300"
                                            title={t('risk.readOnly')}
                                            aria-label={t('readOnlyLabel')}
                                        >
                                            <Lock className="size-3.5" aria-hidden="true" />
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                    <span className="whitespace-nowrap">
                                        {project.sourceLanguage || '—'} →{' '}
                                        {project.targetLanguage || '—'}
                                    </span>
                                    <span
                                        className="h-2 w-px bg-muted-foreground/50"
                                        aria-hidden="true"
                                    />
                                    <span className="whitespace-nowrap">
                                        {formatProjectDate(project.date)}
                                    </span>
                                    <span
                                        className="h-2 w-px bg-muted-foreground/50"
                                        aria-hidden="true"
                                    />
                                    <span
                                        className={`whitespace-nowrap font-medium ${getCompactStatusClasses(entry.statusKey)}`}
                                    >
                                        {statusLabel}
                                    </span>
                                </div>
                            </div>
                        </>
                    );

                    return (
                        <article
                            key={project.id}
                            role="listitem"
                            className="flex min-h-20 animate-slide-in-left items-center rounded-md border border-border bg-secondary px-3 py-3 text-left text-sm transition-[border-color,background-color,box-shadow] hover:border-primary hover:bg-secondary/60 hover:shadow-sm"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {entry.canOpen ? (
                                <Link
                                    href={entry.href}
                                    aria-label={t('openProject', {
                                        name: projectName,
                                        status: statusLabel,
                                        action: nextActionLabel,
                                    })}
                                    className="flex min-w-0 flex-1 items-center gap-5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {projectCard}
                                </Link>
                            ) : (
                                <div
                                    className="flex min-w-0 flex-1 items-center gap-5"
                                    aria-label={t('openProject', {
                                        name: projectName,
                                        status: statusLabel,
                                        action: nextActionLabel,
                                    })}
                                >
                                    {projectCard}
                                </div>
                            )}

                            <div
                                className="ml-auto flex shrink-0 items-center gap-1 pl-3"
                                role="group"
                                aria-label={t('projectActions', { name: projectName })}
                            >
                                {project.canWrite && (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            title={t('configureDictionaries')}
                                            aria-label={t('configureDictionaries')}
                                            onClick={() => setDictDialog(project.id)}
                                        >
                                            <BookMarked size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            title={t('configureMemories')}
                                            aria-label={t('configureMemories')}
                                            onClick={() => setMemDialog(project.id)}
                                        >
                                            <Library size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            title={t('editProject')}
                                            aria-label={t('editProject')}
                                            onClick={() => {
                                                setEditTarget({
                                                    id: project.id,
                                                    name: project.name ?? '',
                                                });
                                                setEditName(project.name ?? '');
                                                toast.info(t('editingProjectName'), {
                                                    description: project.name ?? '',
                                                });
                                            }}
                                        >
                                            <Edit2 size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded p-2 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                            title={t('deleteProject')}
                                            aria-label={t('deleteProject')}
                                            onClick={() => void handleDeleteClick(project)}
                                        >
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    </>
                                )}
                                {entry.canOpen ? (
                                    <Link
                                        href={entry.href}
                                        className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={t('openProject', {
                                            name: projectName,
                                            status: statusLabel,
                                            action: nextActionLabel,
                                        })}
                                    >
                                        <ChevronRight size={16} aria-hidden="true" />
                                    </Link>
                                ) : (
                                    <span
                                        className="p-2 text-muted-foreground/45"
                                        aria-hidden="true"
                                    >
                                        <ChevronRight size={16} />
                                    </span>
                                )}
                            </div>
                        </article>
                    );
                })}
                {/* 编辑项目名称 Modal */}
                <Dialog
                    open={!!editTarget}
                    onOpenChange={open => {
                        if (!open && !isSavingProject) setEditTarget(null);
                    }}
                >
                    <DialogContent onClick={e => e.stopPropagation()}>
                        <DialogHeader>
                            <DialogTitle>{t('editProjectName')}</DialogTitle>
                            <DialogDescription>{t('editProjectDesc')}</DialogDescription>
                        </DialogHeader>
                        <div className="py-2">
                            <Input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder={t('enterProjectName')}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                disabled={isSavingProject}
                                onClick={e => {
                                    e.stopPropagation();
                                    setEditTarget(null);
                                    toast.info(t('editCancelled'));
                                }}
                            >
                                {t('cancel')}
                            </Button>
                            <Button
                                disabled={isSavingProject}
                                onClick={e => {
                                    e.stopPropagation();
                                    void handleSaveProjectName();
                                }}
                            >
                                {isSavingProject ? t('saving') : t('save')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={!!deleteTarget}
                    onOpenChange={open => {
                        if (!open) {
                            setDeleteTarget(null);
                        }
                    }}
                >
                    <DialogContent onClick={e => e.stopPropagation()}>
                        <DialogHeader>
                            <DialogTitle>{t('deleteProject')}</DialogTitle>
                            <DialogDescription>
                                {t('deleteConfirm', { name: deleteTarget?.name || '' })}
                            </DialogDescription>
                        </DialogHeader>

                        {deleteTarget?.dictionaryCleanup && (
                            <div className="space-y-3 py-4">
                                <div className="text-sm font-medium">
                                    {t('eligibleDictionaryCleanup')}
                                </div>

                                {deleteTarget.dictionaryCleanup.eligibleForCleanup > 0 ? (
                                    <>
                                        <p className="text-sm text-muted-foreground">
                                            {t('eligibleDictionaryCleanupDescription', {
                                                count: deleteTarget.dictionaryCleanup
                                                    .eligibleForCleanup,
                                            })}
                                        </p>
                                        <ul className="space-y-2">
                                            {deleteTarget.dictionaryCleanup.dictionaries.map(
                                                dict => (
                                                    <li
                                                        key={dict.id}
                                                        className="rounded-lg border bg-muted/30 p-3 text-sm"
                                                    >
                                                        <div className="font-medium">
                                                            {dict.name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {dict.entryCount > 0
                                                                ? `${t('dictEntryCount')}: ${dict.entryCount}`
                                                                : t('emptyDictionary')}
                                                        </div>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {t('noEligibleDictionaryCleanup')}
                                    </p>
                                )}

                                {deleteTarget.dictionaryCleanup.retainedWhenCleanupRuns > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('retainedDictionaryInfo', {
                                            count: deleteTarget.dictionaryCleanup
                                                .retainedWhenCleanupRuns,
                                        })}
                                    </p>
                                )}
                            </div>
                        )}

                        {deleteTarget?.dictionaryCleanupUnavailable && (
                            <p className="py-4 text-sm text-muted-foreground">
                                {t('dictionaryCleanupPreviewUnavailable')}
                            </p>
                        )}

                        <DialogFooter className="flex-col gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDeleteTarget(null);
                                    toast.info(t('deleteCancelled'));
                                }}
                                className="w-full sm:w-auto"
                            >
                                {t('cancel')}
                            </Button>

                            <div className="flex w-full gap-2 sm:w-auto">
                                {deleteTarget?.dictionaryCleanup?.eligibleForCleanup ? (
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => void handleProjectDeletion(false)}
                                    >
                                        {t('deleteProjectOnlyAndKeepDictionaries')}
                                    </Button>
                                ) : null}

                                <Button
                                    className={`flex-1 ${
                                        deleteTarget?.dictionaryCleanup?.eligibleForCleanup
                                            ? 'bg-red-600 hover:bg-red-700'
                                            : ''
                                    }`}
                                    onClick={() =>
                                        void handleProjectDeletion(
                                            Boolean(
                                                deleteTarget?.dictionaryCleanup?.eligibleForCleanup
                                            )
                                        )
                                    }
                                >
                                    {deleteTarget?.dictionaryCleanup?.eligibleForCleanup
                                        ? t('deleteProjectAndEligibleDictionaries', {
                                              count: deleteTarget.dictionaryCleanup
                                                  .eligibleForCleanup,
                                          })
                                        : t('deleteProjectOnlyAndKeepDictionaries')}
                                </Button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                {dictDialog && (
                    <ProjectDictionariesDialog
                        projectId={dictDialog}
                        open={!!dictDialog}
                        onOpenChange={v => !v && setDictDialog(null)}
                    />
                )}
                {memDialog && (
                    <ProjectMemoriesDialog
                        projectId={memDialog}
                        open={!!memDialog}
                        onOpenChange={v => !v && setMemDialog(null)}
                    />
                )}
            </div>
        </>
    );
}
