"use client";
import { cn } from "src/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusIcon } from "lucide-react";
import { FileUpload } from "@/components/file-upload";
import { useEffect, useRef, useState } from "react";
import { createNewProjectAction } from "@/actions/project";
import { useRouter } from "next/navigation";
// Avoid importing Prisma types in client components
type CreatedProject = { id: string } & Record<string, any>
import { toast } from "sonner";
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useSidebar } from "@/hooks/useSidebar";
import { LANGUAGES, getTranslatedLanguages } from "@/constants/languages";
import { DOMAINS, getDomainOptions } from "@/constants/domains";
import { useTranslations } from "next-intl";

export function CreateProjectDialog({ onCreated, triggerVariant = 'default' }: { onCreated?: (project: CreatedProject) => void, triggerVariant?: 'default' | 'icon' | 'auto' }) {
  const t = useTranslations('Dashboard.CreateProject');
  const tDomains = useTranslations('Common.domains');
  const tLangs = useTranslations('Common.languages');
  const router = useRouter();
  const { isSidebarOpen } = useSidebar();
  const domainOptions = getDomainOptions(tDomains);
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    projectName: "",
    domain: "general",
    sourceLanguage: "zh",
    targetLanguage: "en",
  });
  const languages = getTranslatedLanguages(tLangs);

  const [uploadedFile, setUploadedFile] = useState<{
    fileName: string;
    originalName: string;
    fileUrl: string;
    contentType: string;
    size: number;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(10);
  const [progressPhase, setProgressPhase] = useState<string | undefined>(undefined);
  const [progressCounts, setProgressCounts] = useState<{ completed?: number; total?: number }>({ completed: 0, total: 3 });

  // 新增：初始化批次与双进度
  const [initBatchId, setInitBatchId] = useState<string>("");
  const [segPct, setSegPct] = useState<number>(0);
  const [termPct, setTermPct] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);



  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
    setUploadedFile(null);
  };

  const handleFileUpload = (fileInfo: {
    fileName: string;
    originalName: string;
    fileUrl: string;
    contentType: string;
    size: number;
  }) => {
    setUploadedFile(fileInfo);
  };

  async function startInitPipelines(projectId: string) {
    try {
      const batchId = `${projectId}:${Date.now()}`;
      setInitBatchId(batchId);
      setSegPct(0);
      setTermPct(0);
      setProgressOpen(true);
      setProgressPhase('INIT');
      setProgressValue(5);

      const res = await fetch(`/api/projects/${projectId}/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId })
      });
      if (!res.ok) throw new Error(t('initFailed'));

      setProgressPhase('RUNNING');
      setProgressCounts({ completed: 0, total: 2 });

      // 轮询状态
      if (pollRef.current) clearInterval(pollRef.current);
      currentProjectIdRef.current = projectId;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/projects/${projectId}/init?batchId=${encodeURIComponent(batchId)}`);
          if (!r.ok) return;
          const j = await r.json();
          const s = Math.max(0, Math.min(100, Number(j?.segProgress || 0)));
          const t = Math.max(0, Math.min(100, Number(j?.termsProgress || 0)));
          setSegPct(s);
          setTermPct(t);
          const avg = Math.round((s + t) / 2);
          setProgressValue(Math.max(10, avg));
          setProgressCounts({ completed: (s >= 100 ? 1 : 0) + (t >= 100 ? 1 : 0), total: 2 });
          if (s >= 100 && t >= 100) {
            setProgressPhase('DONE');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setTimeout(() => {
              if (currentProjectIdRef.current) router.push(`/ide/${currentProjectIdRef.current}`);
            }, 600);
          }
        } catch { }
      }, 3600);
    } catch (e: any) {
      toast.error((e as Error)?.message || t('initFailed'));
      setProgressOpen(false);
    }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSubmit = async () => {
    if (!uploadedFile || !dialogState.projectName) {
      toast.error(t('uploadFileAndName'));
      return;
    }

    setIsSubmitting(true);

    try {
      const project = await createNewProjectAction({
        name: dialogState.projectName,
        domain: dialogState.domain,
        sourceLanguage: dialogState.sourceLanguage,
        targetLanguage: dialogState.targetLanguage,
        fileInfo: uploadedFile,
      });

      const projectId = (project as any)?.id ?? '';
      if (projectId) {
        toast.success(t('projectCreated'));
        router.push(`/dashboard/projects/${projectId}/init`);
      }
      if (project && onCreated) onCreated(project as CreatedProject);
      handleClose();
    } catch (error) {
      console.error('创建项目失败:', error);
      toast.error(error instanceof Error ? error.message : t('createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={dialogState.isOpen}
        onOpenChange={(open) =>
          setDialogState((prev) => ({ ...prev, isOpen: open }))
        }
      >
        {(() => {
          const showDefault = triggerVariant === 'default' || (triggerVariant === 'auto' && isSidebarOpen);
          const showIcon = triggerVariant === 'icon' || (triggerVariant === 'auto' && !isSidebarOpen);
          return (
            <>
              {showDefault && (
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    className="h-10 w-full justify-center p-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <div className="text-md flex items-center">
                      <PlusIcon size="16" className="mr-2" />
                      <span>{t('newProject')}</span>
                    </div>
                  </Button>
                </DialogTrigger>
              )}
              {showIcon && (
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    className={"h-10 w-full justify-center p-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"}
                    title={t('newProject')}
                  >
                    <div className="text-md flex items-center"><PlusIcon size="16" /> </div>
                  </Button>
                </DialogTrigger>
              )}
            </>
          );
        })()}


        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {t('createNewProject')}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {t('uploadToStart')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('projectName')}
              </Label>
              <Input
                id="project-name"
                placeholder={t('enterProjectName')}
                value={dialogState.projectName}
                onChange={(e) => setDialogState(prev => ({ ...prev, projectName: e.target.value }))}
                className="border-gray-200 dark:border-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('domain')}
              </Label>
              <Select
                value={dialogState.domain}
                onValueChange={(value) => setDialogState(prev => ({ ...prev, domain: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectDomain')} />
                </SelectTrigger>
                <SelectContent>
                  {domainOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('sourceLanguage')}
              </Label>
              <Select
                value={dialogState.sourceLanguage}
                onValueChange={(value) => setDialogState(prev => ({ ...prev, sourceLanguage: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectSourceLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.key} value={lang.key}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('targetLanguage')}
              </Label>
              <Select
                value={dialogState.targetLanguage}
                onValueChange={(value) => setDialogState(prev => ({ ...prev, targetLanguage: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectTargetLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {languages
                    .filter((lang) => lang.key !== dialogState.sourceLanguage)
                    .map((lang) => (
                      <SelectItem key={lang.key} value={lang.key}>
                        {lang.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('uploadFile')}
              </Label>
              <FileUpload
                onUploadComplete={handleFileUpload}
                projectName={dialogState.projectName}
                elementName="FileUpload"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('supportedFormats')}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              disabled={!uploadedFile || !dialogState.projectName || isSubmitting}
            >
              {isSubmitting ? t('creating') : t('createProject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 初始化进度弹窗（保留在 Dashboard 内完成） */}
      <UiDialog open={progressOpen}>
        <UiDialogContent className="sm:max-w-[460px]">
          <UiDialogHeader>
            <UiDialogTitle>{t('projectInit')}</UiDialogTitle>
          </UiDialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{t('stage')}: {progressPhase ?? 'INIT'}</div>
            <Progress value={progressValue} />
            <div className="text-xs text-muted-foreground">{t('segmentation')}: {segPct}% · {t('terms')}: {termPct}%</div>
          </div>
        </UiDialogContent>
      </UiDialog>
    </>
  );
}
