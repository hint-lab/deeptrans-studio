'use client';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { enUS, zhCN } from 'date-fns/locale';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    Edit2,
    FileText,
    Library,
    Lock,
    Trash2,
} from 'lucide-react';
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
    type ProjectDashboardRiskKey,
    type ProjectDashboardStatusKey,
    type ProjectDashboardStatusTone,
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

function getProjectStatusToneClasses(tone: ProjectDashboardStatusTone): string {
    switch (tone) {
        case 'active':
            return 'border-l-blue-500 bg-blue-500/5 text-blue-700 dark:border-l-blue-400 dark:text-blue-300';
        case 'ready':
            return 'border-l-emerald-500 bg-emerald-500/5 text-emerald-700 dark:border-l-emerald-400 dark:text-emerald-300';
        case 'danger':
            return 'border-l-red-500 bg-red-500/5 text-red-700 dark:border-l-red-400 dark:text-red-300';
        case 'attention':
            return 'border-l-amber-500 bg-amber-500/5 text-amber-800 dark:border-l-amber-400 dark:text-amber-200';
        case 'neutral':
        default:
            return 'border-l-slate-400 bg-slate-500/5 text-slate-700 dark:border-l-slate-500 dark:text-slate-300';
    }
}

function getProjectActionToneClasses(tone: ProjectDashboardStatusTone): string {
    switch (tone) {
        case 'active':
            return 'border-blue-300/80 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/45 dark:text-blue-100 dark:hover:bg-blue-950/70';
        case 'ready':
            return 'border-emerald-300/80 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100 dark:hover:bg-emerald-950/70';
        case 'danger':
            return 'border-red-300/80 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/45 dark:text-red-100 dark:hover:bg-red-950/70';
        case 'attention':
            return 'border-amber-300/80 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-950/70';
        case 'neutral':
        default:
            return 'border-slate-300/80 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900';
    }
}

function getProjectRiskToneClasses(riskKey: ProjectDashboardRiskKey): string {
    switch (riskKey) {
        case 'error':
            return 'border-red-300/80 bg-red-50/80 text-red-900 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-100';
        case 'unknown':
            return 'border-amber-300/80 bg-amber-50/80 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-100';
        case 'readOnly':
        default:
            return 'border-slate-300/80 bg-slate-50/80 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100';
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

    const getProjectRiskLabel = (riskKey: ProjectDashboardRiskKey) => {
        switch (riskKey) {
            case 'error':
                return t('risk.error');
            case 'unknown':
                return t('risk.unknown');
            case 'readOnly':
            default:
                return t('risk.readOnly');
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
            <div className="flex flex-col gap-3 pt-4" role="list" aria-label={t('projectList')}>
                {projects.map((project, index) => {
                    const projectName = project.name?.trim() || t('unnamedProject');
                    const entry = getProjectDashboardHandoff(
                        project.id,
                        project.documents?.[0]?.status,
                        project.canWrite
                    );
                    const statusLabel = getProjectStatusLabel(entry.statusKey);
                    const nextActionLabel = getProjectActionLabel(entry.actionKey);
                    const riskIds = entry.riskKeys.map(
                        riskKey => `project-${index}-risk-${riskKey}`
                    );

                    return (
                        <article
                            key={project.id}
                            role="listitem"
                            className={`flex animate-slide-in-left flex-col overflow-hidden rounded-lg border border-l-[3px] bg-card shadow-sm transition-[border-color,background-color,box-shadow] hover:border-muted-foreground/35 hover:shadow-md sm:flex-row ${getProjectStatusToneClasses(entry.statusTone)}`}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background/75 text-primary shadow-sm">
                                            <FileText className="h-4 w-4" aria-hidden="true" />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">
                                                    {projectName}
                                                </h3>
                                                {!project.canWrite && (
                                                    <span
                                                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                                        aria-label={t('risk.readOnly')}
                                                    >
                                                        <Lock
                                                            className="size-3"
                                                            aria-hidden="true"
                                                        />
                                                        {t('readOnlyLabel')}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                                                <span className="max-w-[9rem] truncate rounded-sm border bg-background/70 px-1.5 py-0.5 font-medium text-foreground/85">
                                                    {project.sourceLanguage || '—'}
                                                </span>
                                                <ArrowRight
                                                    className="h-3.5 w-3.5 shrink-0 text-primary"
                                                    aria-hidden="true"
                                                />
                                                <span className="max-w-[9rem] truncate rounded-sm border bg-background/70 px-1.5 py-0.5 font-medium text-foreground/85">
                                                    {project.targetLanguage || '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="shrink-0 text-xs text-muted-foreground">
                                        {t('updated', { time: formatProjectDate(project.date) })}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 border-t border-foreground/10 pt-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="inline-flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            {t('currentStage')}
                                        </span>
                                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                                            {statusLabel}
                                        </span>
                                    </div>
                                    {entry.canOpen ? (
                                        <Link
                                            href={entry.href}
                                            aria-label={t('openProject', {
                                                name: projectName,
                                                status: statusLabel,
                                                action: nextActionLabel,
                                            })}
                                            aria-describedby={
                                                riskIds.length > 0 ? riskIds.join(' ') : undefined
                                            }
                                            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${getProjectActionToneClasses(entry.statusTone)}`}
                                        >
                                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">
                                                {t('nextAction.label')}
                                            </span>
                                            <span>{nextActionLabel}</span>
                                            <ArrowRight
                                                className="size-4 shrink-0"
                                                aria-hidden="true"
                                            />
                                        </Link>
                                    ) : (
                                        <div
                                            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300/80 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                                            aria-describedby={riskIds.join(' ')}
                                        >
                                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">
                                                {t('nextAction.label')}
                                            </span>
                                            <span>{nextActionLabel}</span>
                                        </div>
                                    )}
                                </div>

                                {entry.riskKeys.length > 0 && (
                                    <div className="space-y-1.5">
                                        {entry.riskKeys.map((riskKey, riskIndex) => (
                                            <p
                                                key={riskKey}
                                                id={riskIds[riskIndex]}
                                                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5 ${getProjectRiskToneClasses(riskKey)}`}
                                            >
                                                <AlertTriangle
                                                    className="mt-0.5 size-3.5 shrink-0"
                                                    aria-hidden="true"
                                                />
                                                <span>
                                                    <span className="mr-1 font-semibold">
                                                        {t('risk.label')}
                                                    </span>
                                                    {getProjectRiskLabel(riskKey)}
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {project.canWrite && (
                                <div
                                    className="flex shrink-0 items-center justify-end gap-0.5 border-t bg-card/75 p-1.5 sm:border-l sm:border-t-0"
                                    role="group"
                                    aria-label={t('projectActions', { name: projectName })}
                                >
                                    <button
                                        type="button"
                                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        title={t('configureDictionaries')}
                                        aria-label={t('configureDictionaries')}
                                        onClick={() => setDictDialog(project.id)}
                                    >
                                        <BookMarked size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        title={t('configureMemories')}
                                        aria-label={t('configureMemories')}
                                        onClick={() => setMemDialog(project.id)}
                                    >
                                        <Library size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                                        className="rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                        title={t('deleteProject')}
                                        aria-label={t('deleteProject')}
                                        onClick={() => void handleDeleteClick(project)}
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            )}
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
