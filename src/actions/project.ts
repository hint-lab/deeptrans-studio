'use server';
import { findProjectDictionaryAction } from '@/actions/dictionary';
import { updateProjectDictionaryBindingsAction } from '@/actions/project-bindings';
import { createProjectDB, deleteProjectByIdDB, updateProjectByIdDB } from '@/db/project';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import {
    type ProjectWriteCapability,
    withProjectWriteCapability,
} from '@/lib/project-capabilities';
import { requireOwnedProject, requireUser, requireWritableProject } from '@/lib/guards';
import {
    getReadableUploadedObjectUrlForOwner,
    requireReadableUploadedObjectForOwner,
} from '@/server/uploaded-object';
import type { Document, Project } from '@prisma/client';
import { unstable_noStore as noStore } from 'next/cache';
const logger = createLogger(
    {
        type: 'actions:project',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export interface CreateProjectData {
    name: string;
    domain: string;
    sourceLanguage: string;
    targetLanguage: string;
    fileInfo: {
        fileName: string;
        originalName: string;
        /**
         * Returned by the upload UI for immediate preview only. The server
         * intentionally ignores it when it persists a project document.
         */
        fileUrl?: string;
        contentType: string;
        size: number;
    };
}

type DashboardProjectRecord = Project & {
    documents: Pick<Document, 'id' | 'status'>[];
};

export type DashboardProject = DashboardProjectRecord & ProjectWriteCapability;

function validateCreateProjectData(data: CreateProjectData) {
    const name = data.name?.trim();
    if (!name) throw new Error('项目名称不能为空');

    if (
        !data.sourceLanguage ||
        !data.targetLanguage ||
        data.sourceLanguage === data.targetLanguage
    ) {
        throw new Error('源语言和目标语言必须不同');
    }

    const fileInfo = data.fileInfo;
    if (
        !fileInfo?.fileName?.trim() ||
        !fileInfo.originalName?.trim() ||
        !fileInfo.contentType?.trim() ||
        !Number.isFinite(fileInfo.size) ||
        fileInfo.size < 0
    ) {
        throw new Error('上传文件信息无效');
    }

    return { ...data, name };
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
    const projects: DashboardProject[] = (data as DashboardProjectRecord[]).map(project =>
        withProjectWriteCapability(project, authCtx.userId)
    );

    return {
        // Tenant membership can make a project readable. Its write capability
        // remains creator-scoped and is derived here, on the server.
        data: projects,
        total,
    };
}

export async function createNewProjectAction(data: CreateProjectData) {
    const authCtx = await requireUser();
    const validData = validateCreateProjectData(data);
    // The browser may send a stale or forged signed URL. Persist only the
    // owner-scoped object key and a freshly generated URL from storage.
    const uploadedObject = await requireReadableUploadedObjectForOwner(
        validData.fileInfo.fileName,
        authCtx
    );
    const verifiedFileUrl = await getReadableUploadedObjectUrlForOwner(
        uploadedObject.fileName,
        authCtx
    );

    logger.debug('创建项目:', { ...validData, fileInfo: validData.fileInfo.fileName });

    const project = await createProjectDB({
        name: validData.name,
        domain: validData.domain,
        sourceLanguage: validData.sourceLanguage,
        targetLanguage: validData.targetLanguage,
        date: new Date(),
        user: { connect: { id: authCtx.userId } },
        ...(authCtx.tenantId ? { tenant: { connect: { id: authCtx.tenantId } } } : {}),
        documents: {
            create: {
                name: uploadedObject.fileName,
                originalName: validData.fileInfo.originalName,
                url: verifiedFileUrl,
                mimeType: validData.fileInfo.contentType,
                size: validData.fileInfo.size,
                status: 'WAITING',
                user: { connect: { id: authCtx.userId } },
            },
        },
    } as any);

    if (!project) {
        throw new Error('项目创建失败，请稍后重试');
    }

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
