'use server';
import { findProjectDictionaryAction } from '@/actions/dictionary';
import { updateProjectDictionaryBindingsAction } from '@/actions/project-bindings';
import { auth } from '@/auth';
import {
    createProjectDB,
    deleteProjectByIdDB,
    findProjectByIdDB,
    findProjectsByUserIdDB,
    updateProjectByIdDB,
} from '@/db/project';
import { createLogger } from '@/lib/logger';
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
    const session = await auth();
    // 这里如果没登录，返回空结构而不是空数组，保持类型一致
    if (!session?.user?.id) return { data: [], total: 0 };

    const result = await findProjectsByUserIdDB(session.user.id, page, pageSize);
    return result || { data: [], total: 0 };
}

export async function createNewProjectAction(data: CreateProjectData) {
    const session = await auth();
    // 允许未登录创建（不绑定用户）；若已登录则绑定创建者
    const userId = session?.user?.id || undefined;

    logger.debug('创建项目:', data);

    const project = await createProjectDB({
        name: data.name,
        domain: data.domain,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        date: new Date(),
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        documents: {
            create: {
                name: data.fileInfo.fileName,
                originalName: data.fileInfo.originalName,
                url: data.fileInfo.fileUrl,
                mimeType: data.fileInfo.contentType,
                size: data.fileInfo.size,
                status: 'WAITING',
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
    const session = await auth();
    if (!session?.user?.id) throw new Error('未授权');

    return updateProjectByIdDB(id, data as any);
}

export async function removeProjectAction(id: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('未授权');

    return deleteProjectByIdDB(id as any);
}

// 其他操作...

// 获取单个项目（用于 IDE 读取语言等只读信息）
export async function fetchProjectByIdAction(projectId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('未授权');

    const project = await findProjectByIdDB(projectId as any);
    if (!project) return null;
    // 可选：校验归属
    if ((project as any).userId && (project as any).userId !== session.user.id) {
        throw new Error('无权访问该项目');
    }
    return project;
}
