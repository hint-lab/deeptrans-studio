'use server';

import { createLogger } from '@/lib/logger';
import { requireOwnedProject, requireUser, requireWritableProject } from '@/lib/guards';
import { createStorageService } from '@/lib/storage/factory';
const logger = createLogger({
    type: 'actions:upload',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
// 存储服务配置
const storageConfig = {
    type: (process.env.STORAGE_TYPE || 'minio') as 'minio' | 'cos',
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost',
    port: parseInt(process.env.STORAGE_PORT || '9000'),
    useSSL: process.env.STORAGE_USE_SSL === 'true',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.STORAGE_BUCKET || 'deeptrans',
    region: process.env.STORAGE_REGION, // 腾讯云 COS 需要
};

// 创建存储服务实例
const storageService = createStorageService(storageConfig);

type UploadScope = {
    projectId?: string;
};

async function resolveUploadNamespace(scope?: UploadScope) {
    const authCtx = await requireUser();
    if (scope?.projectId) {
        const project = await requireWritableProject(scope.projectId, authCtx);
        return { authCtx, namespace: `projects/${project.id}` };
    }
    return { authCtx, namespace: `users/${authCtx.userId}/uploads` };
}

async function assertReadableObject(fileName: string) {
    const authCtx = await requireUser();
    if (fileName.startsWith(`users/${authCtx.userId}/uploads/`)) return;

    const match = /^projects\/([^/]+)\//.exec(fileName);
    if (match?.[1]) {
        await requireOwnedProject(match[1], authCtx);
        return;
    }

    throw new Error('无权访问文件');
}

export async function getUploadUrlAction(
    fileName: string,
    contentType: string,
    scope?: UploadScope
) {
    try {
        const { namespace } = await resolveUploadNamespace(scope);
        logger.debug('开始获取上传 URL:', { fileName, contentType, namespace });

        if (!fileName || !contentType) {
            logger.error('参数缺失:', { fileName, contentType });
            throw new Error('缺少必要参数');
        }

        // 获取上传 URL
        const result = await storageService.getUploadUrl(fileName, contentType, namespace);
        logger.debug('获取上传 URL 成功:', result);

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        logger.error('获取上传 URL 失败:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '获取上传 URL 失败',
        };
    }
}

// 通过 Server Action 接收文件并由服务端完成上传，避免浏览器直传的 CORS/内网不可达问题
export async function uploadFileAction(formData: FormData) {
    try {
        const file = formData.get('file') as unknown as File | null;
        const projectId = String(formData.get('projectId') || '').trim() || undefined;
        const { namespace } = await resolveUploadNamespace({ projectId });

        if (!file) {
            return { success: false, error: '缺少文件' };
        }

        const result = await storageService.getUploadUrl(
            file.name,
            (file as any).type || 'application/octet-stream',
            namespace
        );

        const arrayBuffer = await file.arrayBuffer();
        const putRes = await fetch(result.uploadUrl, {
            method: 'PUT',
            body: Buffer.from(arrayBuffer),
            headers: {
                'Content-Type': (file as any).type || 'application/octet-stream',
            },
        });
        if (!putRes.ok) {
            let text = '';
            try {
                text = await putRes.text();
            } catch { }
            return {
                success: false,
                error: `上传失败: ${putRes.status} ${putRes.statusText} ${text}`,
            };
        }

        return {
            success: true,
            data: {
                fileName: result.fileName,
                originalName: result.originalName,
                fileUrl: result.fileUrl,
                contentType: (file as any).type || 'application/octet-stream',
                size: arrayBuffer.byteLength,
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : '上传失败' };
    }
}

// 获取已存在对象的临时访问 URL（用于读取）
export async function getFileUrlAction(fileName: string) {
    try {
        await requireUser();
        if (!fileName) return { success: false, error: '缺少文件名' };
        await assertReadableObject(fileName);
        const url = await storageService.getFileUrl(fileName);
        return { success: true, data: { fileUrl: url } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : '获取文件地址失败',
        };
    }
}
