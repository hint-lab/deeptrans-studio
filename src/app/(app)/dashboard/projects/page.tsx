'use client';
import { fetchUserProjectsAction, type DashboardProject } from '@/actions/project';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, FolderIcon, Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CreateProjectDialog } from '../components/create-project-dialog';
import ProjectList from '../components/project-list';

const PAGE_SIZE = 10;

const PROJECT_LIST_COPY = {
    zh: {
        loadingTitle: '正在读取项目',
        loadingDescription: '正在同步你的项目与最新处理状态。',
        errorTitle: '项目暂时无法显示',
        errorDescription: '请重新读取项目列表；已保存的数据不会因此丢失。',
        retry: '重新读取',
        emptyTitle: '还没有翻译项目',
        emptyDescription: '新建项目并上传文档后，处理进度和译文会在这里出现。',
        pageEmptyTitle: '这一页已经没有项目',
        pageEmptyDescription: '项目列表刚刚更新，返回上一页继续查看。',
        previousPage: '上一页',
        loadingCount: '正在读取项目…',
        page: '第 {current} / {total} 页',
        range: '{start}–{end} / {total}',
    },
    en: {
        loadingTitle: 'Loading projects',
        loadingDescription: 'Syncing your projects and their latest processing status.',
        errorTitle: 'Projects are temporarily unavailable',
        errorDescription: 'Read the project list again. Your saved data is not affected.',
        retry: 'Try again',
        emptyTitle: 'No translation projects yet',
        emptyDescription:
            'Create a project and upload a document to see its work and progress here.',
        pageEmptyTitle: 'There are no projects left on this page',
        pageEmptyDescription: 'The list has changed. Go back one page to continue.',
        previousPage: 'Previous page',
        loadingCount: 'Loading projects…',
        page: 'Page {current} of {total}',
        range: '{start}–{end} of {total}',
    },
} as const;

function formatProjectCopy(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replace(`{${key}}`, String(value)),
        template
    );
}

const ProjectListPage = () => {
    const [projects, setProjects] = useState<DashboardProject[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadError, setHasLoadError] = useState(false);

    const t = useTranslations('Projects');
    const locale = useLocale();
    const copy = locale.startsWith('zh') ? PROJECT_LIST_COPY.zh : PROJECT_LIST_COPY.en;

    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

    useEffect(() => {
        let active = true;

        const loadCurrentPage = async () => {
            setIsLoading(true);
            setHasLoadError(false);

            try {
                const { data, total } = await fetchUserProjectsAction(currentPage, PAGE_SIZE);
                if (!active) return;
                setProjects(data);
                setTotalCount(total);
            } catch {
                if (!active) return;
                setHasLoadError(true);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        void loadCurrentPage();

        return () => {
            active = false;
        };
    }, [currentPage, reloadNonce]);

    const handlePrevPage = () => setCurrentPage(p => Math.max(1, p - 1));
    const handleNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));
    const retryLoad = () => setReloadNonce(nonce => nonce + 1);
    const hasProjects = projects.length > 0;
    const countLabel = isLoading
        ? copy.loadingCount
        : hasLoadError
          ? copy.errorTitle
          : totalCount > 0
            ? formatProjectCopy(copy.range, {
                  start: (currentPage - 1) * PAGE_SIZE + 1,
                  end: Math.min(currentPage * PAGE_SIZE, totalCount),
                  total: totalCount,
              })
            : formatProjectCopy(copy.range, { start: 0, end: 0, total: 0 });

    return (
        <>
            <header className="ml-2 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {t('title')}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <p
                        className="flex items-center gap-2"
                        aria-live="polite"
                    >
                        <FolderIcon size="16" aria-hidden="true" />
                        {countLabel}
                    </p>
                    <div className="w-28">
                        <CreateProjectDialog
                            onCreated={() => {
                                if (currentPage !== 1) {
                                    setCurrentPage(1);
                                } else {
                                    retryLoad();
                                }
                            }}
                        />
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-4">
                {isLoading ? (
                    <div
                        className="mt-4 rounded-lg border border-dashed bg-card/50 p-5"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                            <Loader2
                                className="size-4 animate-spin text-primary"
                                aria-hidden="true"
                            />
                            {copy.loadingTitle}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {copy.loadingDescription}
                        </p>
                        <div className="mt-5 space-y-2" aria-hidden="true">
                            {[0, 1, 2].map(index => (
                                <div
                                    key={index}
                                    className="h-16 animate-pulse rounded-md bg-muted/70"
                                    style={{ animationDelay: `${index * 110}ms` }}
                                />
                            ))}
                        </div>
                    </div>
                ) : hasLoadError ? (
                    <div
                        className="mt-4 rounded-lg border border-amber-300/80 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20"
                        role="alert"
                    >
                        <div className="text-sm font-semibold text-foreground">
                            {copy.errorTitle}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {copy.errorDescription}
                        </p>
                        <Button className="mt-4" variant="outline" onClick={retryLoad}>
                            <RefreshCw className="size-4" aria-hidden="true" />
                            {copy.retry}
                        </Button>
                    </div>
                ) : hasProjects ? (
                    <ProjectList
                        projects={projects}
                        onDeleted={id => {
                            setProjects(prev => prev.filter(project => project.id !== id));
                            setTotalCount(prev => Math.max(0, prev - 1));
                            if (projects.length === 1 && currentPage > 1) {
                                setCurrentPage(page => page - 1);
                            } else {
                                retryLoad();
                            }
                        }}
                        onUpdated={({ id, name }) => {
                            setProjects(prev =>
                                prev.map(project =>
                                    project.id === id ? { ...project, name } : project
                                )
                            );
                        }}
                    />
                ) : totalCount === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center">
                        <FolderIcon className="mx-auto size-6 text-primary" aria-hidden="true" />
                        <h3 className="mt-4 text-base font-semibold text-foreground">
                            {copy.emptyTitle}
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            {copy.emptyDescription}
                        </p>
                        <div className="mx-auto mt-5 max-w-48">
                            <CreateProjectDialog triggerVariant="default" onCreated={retryLoad} />
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center">
                        <FolderIcon
                            className="mx-auto size-6 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <h3 className="mt-4 text-base font-semibold text-foreground">
                            {copy.pageEmptyTitle}
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            {copy.pageEmptyDescription}
                        </p>
                        <Button
                            className="mt-5"
                            variant="outline"
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="size-4" aria-hidden="true" />
                            {copy.previousPage}
                        </Button>
                    </div>
                )}

                {!isLoading && !hasLoadError && totalCount > 0 && (
                    <div className="flex items-center justify-end gap-2 px-2 py-4">
                        <div className="mr-2 text-sm text-muted-foreground">
                            {formatProjectCopy(copy.page, {
                                current: currentPage,
                                total: totalPages,
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
};

export default ProjectListPage;
