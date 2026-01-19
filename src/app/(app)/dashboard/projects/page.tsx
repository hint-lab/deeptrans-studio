'use client';
import { fetchUserProjectsAction } from '@/actions/project';
import { Button } from '@/components/ui/button';
import type { Project } from '@prisma/client';
import { ChevronLeft, ChevronRight, FolderIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CreateProjectDialog } from '../components/create-project-dialog';
import ProjectList from '../components/project-list';

const PAGE_SIZE = 10;

const ProjectListPage = () => {
    // 状态定义
    const [projects, setProjects] = useState<Project[]>([]);
    const [totalCount, setTotalCount] = useState(0); // 新增：总条数
    const [currentPage, setCurrentPage] = useState(1);

    const t = useTranslations('Projects');

    // 计算总页数
    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

    // 加载数据的核心函数
    const loadProjects = async () => {
        // 传入 currentPage 和 PAGE_SIZE
        const { data, total } = await fetchUserProjectsAction(currentPage, PAGE_SIZE);
        setProjects(data as any);
        setTotalCount(total);
    };

    useEffect(() => {
        let mounted = true;

        // 初始加载
        loadProjects();

        // 轮询 (注意：轮询应该请求当前所在的页码)
        const timer = setInterval(() => {
            if (mounted) loadProjects();
        }, 5000);

        return () => {
            mounted = false;
            clearInterval(timer);
        };
        // 依赖项加入 currentPage，当页码改变时，自动触发重新加载
    }, [currentPage]);

    // 翻页处理
    const handlePrevPage = () => setCurrentPage(p => Math.max(1, p - 1));
    const handleNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));

    return (
        <>
            <div className="ml-2 flex items-center justify-between">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {t('title')}
                </h2>
                <div className="text-light flex items-center gap-2 text-xs text-muted-foreground">
                    <FolderIcon size="16" />
                    {/* 显示当前页范围 / 总数 */}
                    <p className="text-light flex items-center">
                        {totalCount > 0
                            ? `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount}`
                            : '0 of 0'
                        }
                    </p>
                    <div className="w-26">
                        <CreateProjectDialog
                            onCreated={() => {
                                // 创建成功后：
                                // 1. 如果不在第一页，跳转回第一页查看最新项目
                                // 2. 重新加载数据
                                if (currentPage !== 1) {
                                    setCurrentPage(1);
                                } else {
                                    loadProjects();
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {/* 直接传递后端返回的数据，不需要前端切片 */}
                <ProjectList
                    projects={projects}
                    onDeleted={async (id) => {
                        // 乐观更新：先在界面移除，提升体验
                        setProjects(prev => prev.filter(p => p.id !== id));
                        setTotalCount(prev => Math.max(0, prev - 1));

                        // 可选：删除后重新 fetch 以确保分页数据正确（例如从第二页补位数据上来）
                        //await loadProjects();
                    }}
                />

                {/* 分页条 */}
                {totalCount > 0 && (
                    <div className="flex items-center justify-end gap-2 px-2 py-4">
                        <div className="text-sm text-muted-foreground mr-2">
                            Page {currentPage} of {totalPages}
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