'use server';

import { createLogger } from '@/lib/logger';
import { requireOwnedProject, requireUser, requireWritableProject } from '@/lib/guards';
import { getStorageService } from '@/lib/storage/service';
import { assertUploadFileSize } from '@/lib/upload-limits';
const logger = createLogger(
    {
        type: 'actions:upload',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
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

// 通过 Server Action 接收文件并由服务端完成上传，避免浏览器直传的 CORS/内网不可达问题
export async function uploadFileAction(formData: FormData) {
    try {
        const file = formData.get('file') as unknown as File | null;
        const projectId = String(formData.get('projectId') || '').trim() || undefined;
        const { namespace } = await resolveUploadNamespace({ projectId });

        if (!file) {
            return { success: false, error: '缺少文件' };
        }
        assertUploadFileSize((file as any).size || 0);

        const result = await getStorageService().getUploadUrl(
            file.name,
            (file as any).type || 'application/octet-stream',
            namespace
        );

        const arrayBuffer = await file.arrayBuffer();
        assertUploadFileSize(arrayBuffer.byteLength);
        await getStorageService().putObject({
            fileName: result.fileName,
            body: Buffer.from(arrayBuffer),
            contentType: (file as any).type || 'application/octet-stream',
        });

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
        const url = await getStorageService().getFileUrl(fileName);
        return { success: true, data: { fileUrl: url } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : '获取文件地址失败',
        };
    }
}
