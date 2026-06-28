'use server';
import { findProjectDictionaryAction } from '@/actions/dictionary';
import { updateProjectDictionaryBindingsAction } from '@/actions/project-bindings';
import {
    createProjectDB,
    deleteProjectByIdDB,
    updateProjectByIdDB,
} from '@/db/project';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { requireOwnedProject, requireUser, requireWritableProject } from '@/lib/guards';
import { unstable_noStore as noStore } from 'next/cache';
const logger = createLogger({
    type: 'actions:project',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export interface CreateProjectData {
    name: string;
    domain: string;
    sourceLanguage: string;
    targetLanguage: string;
    fileInfo: {
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    };
}

export async function fetchUserProjectsAction(page: number = 1, pageSize: number = 10) {
    noStore();
    const authCtx = await requireUser();
    const take = Math.max(1, Math.min(100, pageSize));
    const skip = Math.max(0, (page - 1) * take);
    const where = {
        OR: [
            { userId: authCtx.userId },
            ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
        ],
    };
    const [data, total] = await prisma.$transaction([
        prisma.project.findMany({
            where,
            orderBy: { date: 'desc' },
            include: { documents: { orderBy: { uploadedAt: 'desc' }, take: 1 } },
            skip,
            take,
        }),
        prisma.project.count({ where }),
    ]);
    return { data, total };
}

export async function createNewProjectAction(data: CreateProjectData) {
    const authCtx = await requireUser();

    logger.debug('创建项目:', data);

    const project = await createProjectDB({
        name: data.name,
        domain: data.domain,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        date: new Date(),
        user: { connect: { id: authCtx.userId } },
        ...(authCtx.tenantId ? { tenant: { connect: { id: authCtx.tenantId } } } : {}),
        documents: {
            create: {
                name: data.fileInfo.fileName,
                originalName: data.fileInfo.originalName,
                url: data.fileInfo.fileUrl,
                mimeType: data.fileInfo.contentType,
                size: data.fileInfo.size,
                status: 'WAITING',
                user: { connect: { id: authCtx.userId } },
            },
        },
    } as any);

    // 自动创建并绑定项目词典
    try {
        const projectId = (project as any)?.id;
        if (projectId) {
            // 创建项目词典
            const dictResult = await findProjectDictionaryAction(projectId);
            if (dictResult.success && dictResult.data) {
                // 自动绑定项目词典到项目
                await updateProjectDictionaryBindingsAction(projectId, [dictResult.data.id]);
                logger.debug('项目词典已自动创建并绑定:', dictResult.data.id);
            }
        }
    } catch (error) {
        logger.error('自动创建项目词典失败:', error);
        // 不抛出错误，项目创建仍然成功
    }

    return project as any;
}

export interface UpdateProjectData {
    name?: string;
    domain?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
}

export async function updateProjectInfoAction(id: string, data: UpdateProjectData) {
    await requireWritableProject(id);

    return updateProjectByIdDB(id, data as any);
}

export async function removeProjectAction(id: string) {
    await requireWritableProject(id);

    return deleteProjectByIdDB(id as any);
}

// 其他操作...

// 获取单个项目（用于 IDE 读取语言等只读信息）
export async function fetchProjectByIdAction(projectId: string) {
    return requireOwnedProject(projectId);
}
