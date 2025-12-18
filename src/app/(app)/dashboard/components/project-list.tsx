'use client';
import { type ComponentProps } from 'react';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { type Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// import Image from "next/image"; // 替换为文本 SVG 图标
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Edit2, Trash2, BookMarked, Library } from 'lucide-react';
import { ProjectDictionariesDialog } from './project-resource-dialogs';
import { ProjectMemoriesDialog } from './project-resource-dialogs';
import { Checkbox } from '@/components/ui/checkbox';

import { removeProjectAction, updateProjectInfoAction } from '@/actions/project';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
// Avoid importing Prisma types in client components
type Project = {
    id: string;
    name: string | null;
    date: string | Date;
    sourceLanguage: string;
    targetLanguage: string;
};
// 添加全局加载遮罩组件
const GlobalLoadingOverlay = ({ isLoading }: { isLoading: boolean }) => {
    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-6 shadow-lg">
                <div className="h-16 w-16 animate-spin rounded-full border-[3px] border-primary border-t-transparent"></div>
                <div className="text-xl font-semibold text-foreground">
                    正在跳转到项目IDE窗口...
                </div>
                <div className="text-center text-sm text-muted-foreground">
                    请稍候，正在加载项目数据
                    <br />
                    <span className="text-xs opacity-70">这可能需要几秒钟时间</span>
                </div>
            </div>
        </div>
    );
};
type ProjectWithDoc = Project & { documents?: { id: string; status?: string }[] };
export default function ProjectList({
    projects,
    onDeleted,
}: {
    projects: ProjectWithDoc[];
    onDeleted?: (id: string) => void;
}) {
    const t = useTranslations('Dashboard.ProjectList');
    const router = useRouter();
    const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
    const [editName, setEditName] = useState<string>('');
    const [dictDialog, setDictDialog] = useState<string | null>(null);
    const [memDialog, setMemDialog] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<{
        id: string;
        name: string;
        dictionaries?: Array<{ id: string; name: string; entryCount: number; isShared?: boolean }>;
    } | null>(null);

    const [deleteWithDictionary, setDeleteWithDictionary] = useState(true);
    const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
    const handleProjectClick = async (project: ProjectWithDoc) => {
        const st = (project as ProjectWithDoc).documents?.[0]?.status;
        setShowLoadingOverlay(true);
        setLoadingProjectId(project.id);
        try {
            if (st && st !== 'PREPROCESSED' && st !== 'TRANSLATING' && st !== 'COMPLETED') {
                await router.push(`/dashboard/projects/${project.id}/init`);
            } else {
                await router.push(`/ide/${project.id}`);
            }
        } catch (error) {
            console.error('Navigation error:', error);
            setLoadingProjectId(null);
            setShowLoadingOverlay(false);
        }
    };

    // 点击删除按钮时获取词典信息
    const handleDeleteClick = async (project: ProjectWithDoc) => {
        try {
            // 获取项目关联的词典
            const response = await fetch(`/api/projects/${project.id}/dictionaries`);
            const dicts = await response.json();
            console.log('API 响应数据:', dicts); // 添加调试日志
            console.log('过滤前词典数量:', dicts.length);

            const filteredDicts = dicts.filter((d: any) => {
                console.log(
                    '检查词典:',
                    d.name,
                    'visibility:',
                    d.visibility,
                    '包含术语清单:',
                    d.name.includes('术语清单')
                );
                return d.visibility === 'PROJECT' && d.name.includes('术语清单');
            });

            console.log('过滤后词典数量:', filteredDicts.length);

            setDeleteTarget({
                id: project.id,
                name: project.name ?? '',
                dictionaries: dicts.filter(
                    (d: any) => d.visibility === 'PROJECT' && d.name.includes('术语清单')
                ),
            });
            setDeleteWithDictionary(true); // 默认选中
        } catch (error) {
            console.error('获取词典信息失败:', error);
            // 回退到简单模式
            setDeleteTarget({ id: project.id, name: project.name ?? '' });
        }
    };
    const getProjectIconText = (name?: string | null) => {
        if (!name) return '?';
        const trimmed = name.trim();
        if (!trimmed) return '?';
        const firstChar = trimmed.charAt(0);
        const isCJK = /[\u4E00-\u9FFF]/.test(firstChar);
        if (isCJK) return firstChar; // 中文等 CJK 取第一个字
        const firstWord = trimmed.split(/[\s-_]+/)[0] ?? '';
        return firstWord.slice(0, 2).toUpperCase(); // 拉丁字母取前两个字母
    };
    return (
        <>
            <GlobalLoadingOverlay isLoading={showLoadingOverlay} />
            <div className="flex flex-col gap-2 pt-4">
                {projects.map((project, index) => (
                    <div
                        key={index}
                        className={`flex h-[80px] animate-slide-in-left cursor-pointer justify-between rounded-md border border-gray-200 bg-secondary p-3 py-4 text-left text-sm hover:border-2 hover:border-primary hover:bg-secondary/50 ${
                            loadingProjectId === project.id ? 'pointer-events-none opacity-30' : ''
                        }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleProjectClick(project)}
                    >
                        <div className="flex w-full flex-col gap-2">
                            <div className="flex w-full items-center gap-5">
                                <div className="flex-none items-center justify-center">
                                    <svg
                                        width="32"
                                        height="32"
                                        viewBox="0 0 32 32"
                                        className="rounded-md"
                                    >
                                        <rect
                                            x="0"
                                            y="0"
                                            width="32"
                                            height="32"
                                            rx="6"
                                            fill="#6D28D9"
                                        />
                                        <text
                                            x="50%"
                                            y="50%"
                                            dominantBaseline="middle"
                                            textAnchor="middle"
                                            fontSize="12"
                                            fill="#FFFFFF"
                                            fontWeight="600"
                                        >
                                            {getProjectIconText(project.name)}
                                        </text>
                                    </svg>
                                </div>
                                <div className="w-[480px] flex-grow flex-col justify-between space-y-[4px]">
                                    <div className="text-md flex items-center gap-2 font-semibold text-foreground">
                                        {project.name}
                                        {loadingProjectId === project.id && (
                                            <div className="ml-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center text-xs font-light text-muted-foreground">
                                        {project.sourceLanguage}
                                        {'->'}
                                        {project.targetLanguage}
                                        <div className="mx-2 h-2 w-[1px] bg-muted-foreground" />
                                        {formatDistanceToNow(new Date(project.date), {
                                            addSuffix: true,
                                        })}
                                        {(project as ProjectWithDoc).documents &&
                                            (project as ProjectWithDoc).documents!.length > 0 && (
                                                <>
                                                    <div className="mx-2 h-2 w-[1px] bg-muted-foreground" />
                                                    <span
                                                        className={
                                                            (project as ProjectWithDoc)
                                                                .documents?.[0]?.status ===
                                                            'COMPLETED'
                                                                ? 'text-green-600'
                                                                : (project as ProjectWithDoc)
                                                                        .documents?.[0]?.status ===
                                                                    'PREPROCESSED'
                                                                  ? 'text-purple-600'
                                                                  : (project as ProjectWithDoc)
                                                                          .documents?.[0]
                                                                          ?.status === 'TRANSLATING'
                                                                    ? 'text-blue-600'
                                                                    : (project as ProjectWithDoc)
                                                                            .documents?.[0]
                                                                            ?.status ===
                                                                            'PARSING' ||
                                                                        (project as ProjectWithDoc)
                                                                            .documents?.[0]
                                                                            ?.status ===
                                                                            'SEGMENTING' ||
                                                                        (project as ProjectWithDoc)
                                                                            .documents?.[0]
                                                                            ?.status ===
                                                                            'TERMS_EXTRACTING'
                                                                      ? 'text-amber-600'
                                                                      : (project as ProjectWithDoc)
                                                                              .documents?.[0]
                                                                              ?.status === 'ERROR'
                                                                        ? 'text-red-600'
                                                                        : 'text-muted-foreground'
                                                        }
                                                    >
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'COMPLETED' &&
                                                            t('status.completed')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'PARSING' &&
                                                            t('status.parsing')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'SEGMENTING' &&
                                                            t('status.segmenting')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'TERMS_EXTRACTING' &&
                                                            t('status.termsExtracting')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'WAITING' &&
                                                            t('status.waiting')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'PREPROCESSED' &&
                                                            t('status.preprocessed')}
                                                        {(project as ProjectWithDoc).documents?.[0]
                                                            ?.status === 'ERROR' &&
                                                            t('status.error')}
                                                    </span>
                                                </>
                                            )}
                                    </div>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                    <button
                                        className="rounded p-2 hover:bg-muted"
                                        title={t('configureDictionaries')}
                                        onClick={e => {
                                            e.stopPropagation();
                                            setDictDialog(project.id);
                                        }}
                                    >
                                        <BookMarked size={16} />
                                    </button>
                                    <button
                                        className="rounded p-2 hover:bg-muted"
                                        title={t('configureMemories')}
                                        onClick={e => {
                                            e.stopPropagation();
                                            setMemDialog(project.id);
                                        }}
                                    >
                                        <Library size={16} />
                                    </button>
                                    <button
                                        className="rounded p-2 hover:bg-muted"
                                        title={t('editProject')}
                                        onClick={e => {
                                            e.stopPropagation();
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
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        className="rounded p-2 text-red-600 hover:bg-red-50"
                                        title={t('deleteProject')}
                                        onClick={async e => {
                                            e.stopPropagation();
                                            await handleDeleteClick(project);
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <ChevronRight size="16" className="flex-none text-foreground" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {/* 编辑项目名称 Modal */}
                <Dialog
                    open={!!editTarget}
                    onOpenChange={open => {
                        if (!open) setEditTarget(null);
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
                                onClick={e => {
                                    e.stopPropagation();
                                    setEditTarget(null);
                                    toast.info(t('editCancelled'));
                                }}
                            >
                                {t('cancel')}
                            </Button>
                            <Button
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!editTarget) return;
                                    const name = editName.trim();
                                    if (!name) {
                                        toast.error(t('nameRequired'));
                                        return;
                                    }
                                    toast.loading(t('saving'), { id: 'edit-project' });
                                    void updateProjectInfoAction(editTarget.id, { name })
                                        .then(() => {
                                            toast.success(t('projectUpdated'), {
                                                id: 'edit-project',
                                            });
                                            setEditTarget(null);
                                        })
                                        .catch(() =>
                                            toast.error(t('updateFailed'), { id: 'edit-project' })
                                        );
                                }}
                            >
                                {t('save')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={!!deleteTarget}
                    onOpenChange={open => {
                        if (!open) {
                            setDeleteTarget(null);
                            setDeleteWithDictionary(true);
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

                        {/* 新增：删除选项 */}
                        {deleteTarget?.dictionaries && deleteTarget.dictionaries.length > 0 && (
                            <div className="space-y-3 py-4">
                                <div className="text-sm font-medium">{t('deleteOptions')}</div>

                                <div className="space-y-2">
                                    {deleteTarget.dictionaries.map((dict, index) => (
                                        <div
                                            key={index}
                                            className="flex items-start space-x-2 rounded-lg border p-3"
                                        >
                                            <Checkbox
                                                id={`dict-${dict.id}`}
                                                checked={deleteWithDictionary}
                                                onCheckedChange={checked =>
                                                    setDeleteWithDictionary(checked as boolean)
                                                }
                                                disabled={dict.isShared} // 共享词典不可选
                                            />
                                            <div className="flex-1">
                                                <Label
                                                    htmlFor={`dict-${dict.id}`}
                                                    className="font-medium"
                                                >
                                                    {dict.name}
                                                </Label>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {dict.entryCount > 0
                                                        ? t('dictEntryCount', {
                                                              count: dict.entryCount,
                                                          })
                                                        : t('emptyDictionary')}
                                                    {dict.isShared && ` · ${t('sharedDictionary')}`}
                                                </div>
                                                {dict.isShared && (
                                                    <div className="mt-1 text-xs text-amber-600">
                                                        {t('sharedWarning')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    {deleteWithDictionary ? t('deleteDictHint') : t('keepDictHint')}
                                </div>
                            </div>
                        )}

                        <DialogFooter className="flex-col gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setDeleteWithDictionary(true);
                                    toast.info(t('deleteCancelled'));
                                }}
                                className="w-full sm:w-auto"
                            >
                                {t('cancel')}
                            </Button>

                            {/* 两个删除按钮 */}
                            <div className="flex w-full gap-2 sm:w-auto">
                                {deleteTarget?.dictionaries &&
                                    deleteTarget.dictionaries.length > 0 && (
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            onClick={async () => {
                                                if (!deleteTarget) return;
                                                toast.loading(t('deletingProjectOnly'), {
                                                    id: 'delete-project',
                                                });
                                                try {
                                                    // 调用不删除词典的API
                                                    await fetch(
                                                        `/api/projects/${deleteTarget.id}/delete`,
                                                        {
                                                            method: 'DELETE',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                            },
                                                            body: JSON.stringify({
                                                                deleteDictionaries: false,
                                                            }),
                                                        }
                                                    );

                                                    toast.success(t('projectDeletedOnly'), {
                                                        id: 'delete-project',
                                                    });
                                                    setDeleteTarget(null);
                                                    onDeleted && onDeleted(deleteTarget.id);
                                                } catch {
                                                    toast.error(t('deleteFailed'), {
                                                        id: 'delete-project',
                                                    });
                                                }
                                            }}
                                        >
                                            {t('deleteProjectOnly')}
                                        </Button>
                                    )}

                                <Button
                                    className={`flex-1 ${deleteTarget?.dictionaries?.length ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                    onClick={async () => {
                                        if (!deleteTarget) return;
                                        toast.loading(
                                            deleteWithDictionary
                                                ? t('deletingWithDict')
                                                : t('deleting'),
                                            { id: 'delete-project' }
                                        );

                                        try {
                                            // 调用删除API，传递选项
                                            await fetch(`/api/projects/${deleteTarget.id}/delete`, {
                                                method: 'DELETE',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    deleteDictionaries: deleteWithDictionary,
                                                }),
                                            });

                                            toast.success(
                                                deleteWithDictionary
                                                    ? t('projectAndDictDeleted')
                                                    : t('projectDeleted'),
                                                { id: 'delete-project' }
                                            );
                                            setDeleteTarget(null);
                                            setDeleteWithDictionary(true);
                                            onDeleted && onDeleted(deleteTarget.id);
                                        } catch {
                                            toast.error(t('deleteFailed'), {
                                                id: 'delete-project',
                                            });
                                        }
                                    }}
                                >
                                    {deleteTarget?.dictionaries &&
                                    deleteTarget.dictionaries.length > 0
                                        ? deleteWithDictionary
                                            ? t('deleteProjectAndDict')
                                            : t('deleteProject')
                                        : t('confirmDelete')}
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
