import { prisma } from "@/lib/db";
import { type Project, type Prisma, type Document } from "@prisma/client";
import { dbTry } from "./utils";

// 创建新项目
export const createProjectDB = async (data: Prisma.ProjectCreateInput): Promise<Project & { documents: Document[] } | null> => {
    return dbTry(() => prisma.project.create({ data, include: { documents: true } }));
};

// 按用户查找项目列表
export const findProjectsByUserIdDB = async (userId: string): Promise<(Project & { documents: { id: string; status?: string; processStatus?: string }[] })[] | null> => {
    return dbTry(() => prisma.project.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        include: { documents: { orderBy: { uploadedAt: 'desc' }, take: 1 } },
    }));
};

// 查找所有项目
export const findAllProjectsDB = async (): Promise<Project[] | null> => {
    return dbTry(() => prisma.project.findMany({ orderBy: { date: 'desc' } }));
};

// 按ID查找单个项目
export const findProjectByIdDB = async (id: string): Promise<Project & { documents: Document[] } | null> => {
    return dbTry(() => prisma.project.findUnique({ where: { id }, include: { documents: true } }));
};

// 更新项目
export const updateProjectByIdDB = async (
    id: string,
    data: Partial<Omit<Project, "id">>
): Promise<Project | null> => {
    return dbTry(() => prisma.project.update({ where: { id }, data }));
};

// 删除项目
export const deleteProjectByIdDB = async (id: string): Promise<Project | null> => {
    return dbTry(() => prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 不再在 Dictionary 上维护 projectId，改由绑定表；删除时清理绑定
        await tx.projectDictionary.deleteMany({ where: { projectId: id } });
        await tx.projectMemory.deleteMany({ where: { projectId: id } });
        return tx.project.delete({ where: { id } });
    }));
};

