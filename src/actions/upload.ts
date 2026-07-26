'use server';

import { createLogger } from '@/lib/logger';
import { requireUser, requireWritableProject } from '@/lib/guards';
import { getStorageService } from '@/lib/storage/service';
import { assertUploadFileSize } from '@/lib/upload-limits';
import {
    UPLOAD_ERROR_CODES,
    uploadFailure,
    uploadFailureFromError,
} from '@/lib/upload-errors';
import { resolveUploadContentType } from '@/lib/upload-validation';
import { getReadableUploadedObjectUrlForOwner } from '@/server/uploaded-object';
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

function isUploadFile(value: FormDataEntryValue | null): value is File {
    return Boolean(
        value &&
            typeof value !== 'string' &&
            typeof (value as Partial<File>).name === 'string' &&
            typeof (value as Partial<File>).type === 'string' &&
            typeof (value as Partial<File>).size === 'number' &&
            typeof (value as Partial<File>).arrayBuffer === 'function'
    );
}

async function resolveUploadNamespace(scope?: UploadScope) {
    const authCtx = await requireUser();
    if (scope?.projectId) {
        const project = await requireWritableProject(scope.projectId, authCtx);
        return { authCtx, namespace: `projects/${project.id}` };
    }
    return { authCtx, namespace: `users/${authCtx.userId}/uploads` };
}

// 通过 Server Action 接收文件并由服务端完成上传，避免浏览器直传的 CORS/内网不可达问题
export async function uploadFileAction(formData: FormData) {
    try {
        const file = formData.get('file');
        const projectId = String(formData.get('projectId') || '').trim() || undefined;

        if (!isUploadFile(file)) {
            return uploadFailure(UPLOAD_ERROR_CODES.FILE_REQUIRED);
        }

        const contentType = resolveUploadContentType(file.name, file.type);
        if (!contentType) {
            return uploadFailure(UPLOAD_ERROR_CODES.FILE_TYPE_UNSUPPORTED);
        }

        try {
            assertUploadFileSize(file.size);
        } catch {
            return uploadFailure(UPLOAD_ERROR_CODES.FILE_TOO_LARGE);
        }

        const { namespace } = await resolveUploadNamespace({ projectId });

        // Validate the actual payload length too. A client-controlled File
        // metadata object is not a reliable storage boundary on its own.
        const arrayBuffer = await file.arrayBuffer();
        try {
            assertUploadFileSize(arrayBuffer.byteLength);
        } catch {
            return uploadFailure(UPLOAD_ERROR_CODES.FILE_TOO_LARGE);
        }

        const result = await getStorageService().getUploadUrl(
            file.name,
            contentType,
            namespace
        );

        await getStorageService().putObject({
            fileName: result.fileName,
            body: Buffer.from(arrayBuffer),
            contentType,
        });

        return {
            success: true,
            data: {
                fileName: result.fileName,
                originalName: result.originalName,
                fileUrl: result.fileUrl,
                contentType,
                size: arrayBuffer.byteLength,
            },
        };
    } catch (error) {
        const failure = uploadFailureFromError(error);
        // Keep actionable state in the response, but do not serialise storage
        // endpoints, provider errors or project identifiers to the browser.
        logger.error({
            message: 'Upload action failed',
            errorName: error instanceof Error ? error.name : typeof error,
            errorCode: failure.errorCode,
        });
        return failure;
    }
}

// 获取已存在对象的临时访问 URL（用于读取）
export async function getFileUrlAction(fileName: string) {
    try {
        const normalizedFileName = String(fileName || '').trim();
        if (!normalizedFileName) return uploadFailure(UPLOAD_ERROR_CODES.FILE_REQUIRED);
        // Keep an explicit guard at this exported action boundary as well as
        // the ownership check in the shared object helper.
        const authCtx = await requireUser();
        const url = await getReadableUploadedObjectUrlForOwner(normalizedFileName, authCtx);
        return { success: true, data: { fileUrl: url } };
    } catch (error) {
        const failure = uploadFailureFromError(error);
        logger.error({
            message: 'Get uploaded file URL failed',
            errorName: error instanceof Error ? error.name : typeof error,
            errorCode: failure.errorCode,
        });
        return failure;
    }
}
