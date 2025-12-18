'use server';

import { createStorageService } from '@/lib/storage/factory';

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

export async function getUploadUrlAction(
    fileName: string,
    contentType: string,
    projectName: string
) {
    try {
        console.log('开始获取上传 URL:', { fileName, contentType, projectName });

        if (!fileName || !contentType || !projectName) {
            console.error('参数缺失:', { fileName, contentType, projectName });
            throw new Error('缺少必要参数');
        }

        // 获取上传 URL
        const result = await storageService.getUploadUrl(fileName, contentType, projectName);
        console.log('获取上传 URL 成功:', result);

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error('获取上传 URL 失败:', error);
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
        const projectName = String(formData.get('projectName') || '').trim();

        if (!file) {
            return { success: false, error: '缺少文件' };
        }
        if (!projectName) {
            return { success: false, error: '缺少项目名称' };
        }

        const result = await storageService.getUploadUrl(
            file.name,
            (file as any).type || 'application/octet-stream',
            projectName
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
            } catch {}
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
        if (!fileName) return { success: false, error: '缺少文件名' };
        const url = await storageService.getFileUrl(fileName);
        return { success: true, data: { fileUrl: url } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : '获取文件地址失败',
        };
    }
}
