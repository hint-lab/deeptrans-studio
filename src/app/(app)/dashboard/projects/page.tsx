"use client";
import { FolderIcon } from "lucide-react";
import { CreateProjectDialog } from "../components/create-project-dialog";
import ProjectList from "../components/project-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchUserProjectsAction } from "@/actions/project";
import type { Project } from "@prisma/client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";


const ProjectListPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const t = useTranslations("Projects");

  useEffect(() => {
    let mounted = true;
    const loadProjects = async () => {
      const data = await fetchUserProjectsAction();
      if (mounted) setProjects(data as any);
    };
    loadProjects();
    const timer = setInterval(loadProjects, 5000); // 5s 轮询状态
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  return (
    <>
      <div className="ml-2 flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h2>
        <div className="text-light flex items-center gap-2 text-xs text-muted-foreground">
          <FolderIcon size="16" />
          <p className="text-light flex items-center">
            {projects.length}/10
          </p>
          <div className="w-26">
            <CreateProjectDialog onCreated={(p) => {
              setProjects((prev) => {
                const map = new Map<string, Project>();
                for (const item of prev as any) map.set((item as any).id, item as any);
                map.set((p as any).id, p as any);
                const arr = Array.from(map.values());
                // 按创建时间倒序，若无 date 则保持现有顺序
                arr.sort((a: any, b: any) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
                return arr as any;
              });
            }} />
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <ProjectList
          projects={projects}
          onDeleted={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
        />
      </div>
    </>
  );
};

export default ProjectListPage;
