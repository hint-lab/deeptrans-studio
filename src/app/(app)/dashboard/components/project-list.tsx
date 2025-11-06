"use client";
import { type ComponentProps } from "react";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { type Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// import Image from "next/image"; // 替换为文本 SVG 图标
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Edit2, Trash2, BookMarked, Library } from "lucide-react";
import { ProjectDictionariesDialog } from "./project-resource-dialogs";
import { ProjectMemoriesDialog } from "./project-resource-dialogs";
// Avoid importing Prisma types in client components
type Project = {
  id: string;
  name: string | null;
  date: string | Date;
  sourceLanguage: string;
  targetLanguage: string;
};
import { removeProjectAction, updateProjectInfoAction } from "@/actions/project";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

type ProjectWithDoc = Project & { documents?: { id: string; status?: string }[] };
export default function ProjectList({ projects, onDeleted }: { projects: ProjectWithDoc[]; onDeleted?: (id: string) => void }) {
  const t = useTranslations('Dashboard.ProjectList');
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [dictDialog, setDictDialog] = useState<string | null>(null)
  const [memDialog, setMemDialog] = useState<string | null>(null)

  const getProjectIconText = (name?: string | null) => {
    if (!name) return "?";
    const trimmed = name.trim();
    if (!trimmed) return "?";
    const firstChar = trimmed.charAt(0);
    const isCJK = /[\u4E00-\u9FFF]/.test(firstChar);
    if (isCJK) return firstChar; // 中文等 CJK 取第一个字
    const firstWord = trimmed.split(/[\s-_]+/)[0] ?? "";
    return firstWord.slice(0, 2).toUpperCase(); // 拉丁字母取前两个字母
  };
  return (
    <div className="flex flex-col gap-2 pt-4">
      {projects.map((project, index) => (
        <div
          key={index}
          className="flex h-[80px] animate-slide-in-left cursor-pointer bg-secondary justify-between rounded-md border border-gray-200 p-3 py-4 text-left text-sm hover:border-2 hover:border-primary hover:bg-secondary/50"
          style={{ animationDelay: `${index * 50}ms` }}
          onClick={() => {
            const st = (project as ProjectWithDoc).documents?.[0]?.status;
            if (st && (st !== 'PREPROCESSED' && st !== 'TRANSLATING' && st !== 'COMPLETED')) {
              router.push(`/dashboard/projects/${project.id}/init`);
              return;
            }
            router.push(`/ide/${project.id}`);
          }}
        >
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center gap-5">
              <div className="flex-none items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 32 32" className="rounded-md">
                  <rect x="0" y="0" width="32" height="32" rx="6" fill="#6D28D9" />
                  <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="12" fill="#FFFFFF" fontWeight="600">
                    {getProjectIconText(project.name)}
                  </text>
                </svg>
              </div>
              <div className="w-[480px] flex-grow flex-col justify-between space-y-[4px]">
                <div className="text-md font-semibold text-foreground">
                  {project.name}
                </div>
                <div className="flex items-center text-xs font-light text-muted-foreground">
                  {project.sourceLanguage}{"->"}{project.targetLanguage}
                  <div className="mx-2 h-2 w-[1px] bg-muted-foreground" />
                  {formatDistanceToNow(new Date(project.date), {
                    addSuffix: true,
                  })}
                  {(project as ProjectWithDoc).documents && (project as ProjectWithDoc).documents!.length > 0 && (
                    <>
                      <div className="mx-2 h-2 w-[1px] bg-muted-foreground" />
                      <span className={
                        (project as ProjectWithDoc).documents?.[0]?.status === 'COMPLETED' ? 'text-green-600' :
                          (project as ProjectWithDoc).documents?.[0]?.status === 'PREPROCESSED' ? 'text-purple-600' :
                            (project as ProjectWithDoc).documents?.[0]?.status === 'TRANSLATING' ? 'text-blue-600' :
                              (project as ProjectWithDoc).documents?.[0]?.status === 'PARSING' || (project as ProjectWithDoc).documents?.[0]?.status === 'SEGMENTING' || (project as ProjectWithDoc).documents?.[0]?.status === 'TERMS_EXTRACTING' ? 'text-amber-600' :
                                (project as ProjectWithDoc).documents?.[0]?.status === 'ERROR' ? 'text-red-600' : 'text-muted-foreground'
                      }>
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'COMPLETED' && t('status.completed')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'PARSING' && t('status.parsing')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'SEGMENTING' && t('status.segmenting')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'TERMS_EXTRACTING' && t('status.termsExtracting')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'WAITING' && t('status.waiting')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'PREPROCESSED' && t('status.preprocessed')}
                        {(project as ProjectWithDoc).documents?.[0]?.status === 'ERROR' && t('status.error')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  className="p-2 rounded hover:bg-muted"
                  title={t('configureDictionaries')}
                  onClick={(e) => { e.stopPropagation(); setDictDialog(project.id); }}
                >
                  <BookMarked size={16} />
                </button>
                <button
                  className="p-2 rounded hover:bg-muted"
                  title={t('configureMemories')}
                  onClick={(e) => { e.stopPropagation(); setMemDialog(project.id); }}
                >
                  <Library size={16} />
                </button>
                <button
                  className="p-2 rounded hover:bg-muted"
                  title={t('editProject')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTarget({ id: project.id, name: project.name ?? "" });
                    setEditName(project.name ?? "");
                    toast.info(t('editingProjectName'), { description: project.name ?? "" });
                  }}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className="p-2 rounded hover:bg-red-50 text-red-600"
                  title={t('deleteProject')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: project.id, name: project.name ?? "" });
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
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('editProjectName')}</DialogTitle>
            <DialogDescription>{t('editProjectDesc')}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('enterProjectName')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={(e) => { e.stopPropagation(); setEditTarget(null); toast.info(t('editCancelled')); }}>{t('cancel')}</Button>
            <Button onClick={(e) => {
              e.stopPropagation();
              if (!editTarget) return;
              const name = editName.trim();
              if (!name) { toast.error(t('nameRequired')); return; }
              toast.loading(t('saving'), { id: "edit-project" });
              void updateProjectInfoAction(editTarget.id, { name })
                .then(() => { toast.success(t('projectUpdated'), { id: "edit-project" }); setEditTarget(null); })
                .catch(() => toast.error(t('updateFailed'), { id: "edit-project" }));
            }}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('deleteProject')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirm', { name: deleteTarget?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={(e) => { e.stopPropagation(); setDeleteTarget(null); toast.info(t('deleteCancelled')); }}>{t('cancel')}</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={(e) => {
              e.stopPropagation();
              if (!deleteTarget) return;
              toast.loading(t('deleting'), { id: "delete-project" });
              void removeProjectAction(deleteTarget.id)
                .then(() => { toast.success(t('projectDeleted'), { id: "delete-project" }); setDeleteTarget(null); onDeleted && onDeleted(deleteTarget.id); })
                .catch(() => toast.error(t('deleteFailed'), { id: "delete-project" }));
            }}>{t('confirmDelete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dictDialog && (
        <ProjectDictionariesDialog projectId={dictDialog} open={!!dictDialog} onOpenChange={(v) => !v && setDictDialog(null)} />
      )}
      {memDialog && (
        <ProjectMemoriesDialog projectId={memDialog} open={!!memDialog} onOpenChange={(v) => !v && setMemDialog(null)} />
      )}
    </div>
  );
}

