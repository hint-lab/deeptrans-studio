import { NextRequest, NextResponse } from 'next/server';
import { createStorageService } from '@/lib/storage/factory';

const storageConfig = {
    type: (process.env.STORAGE_TYPE || 'minio') as 'minio' | 'cos',
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost',
    port: process.env.STORAGE_PORT ? parseInt(process.env.STORAGE_PORT) : undefined,
    useSSL: process.env.STORAGE_USE_SSL === 'true',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.STORAGE_BUCKET || 'deeptrans',
    region: process.env.STORAGE_REGION,
};

const storageService = createStorageService(storageConfig);

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get('content-type') || '';
        if (!contentType.includes('multipart/form-data')) {
            return NextResponse.json(
                { success: false, error: 'Content-Type 必须为 multipart/form-data' },
                { status: 400 }
            );
        }

        const form = await req.formData();
        const file = form.get('file') as File | null;
        const projectName = String(form.get('projectName') || '').trim();

        if (!file) {
            return NextResponse.json({ success: false, error: '缺少文件' }, { status: 400 });
        }
        if (!projectName) {
            return NextResponse.json({ success: false, error: '缺少项目名称' }, { status: 400 });
        }

        const getUrl = await storageService.getUploadUrl(
            file.name,
            file.type || 'application/octet-stream',
            projectName
        );

        const arrayBuffer = await file.arrayBuffer();
        const putRes = await fetch(getUrl.uploadUrl, {
            method: 'PUT',
            // Node fetch，无 CORS 限制
            body: Buffer.from(arrayBuffer),
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
        });

        if (!putRes.ok) {
            const text = await safeReadText(putRes);
            return NextResponse.json(
                {
                    success: false,
                    error: `上传失败: ${putRes.status} ${putRes.statusText} ${text}`,
                },
                { status: 502 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                fileName: getUrl.fileName,
                originalName: getUrl.originalName,
                fileUrl: getUrl.fileUrl,
                contentType: file.type || 'application/octet-stream',
                size: arrayBuffer.byteLength,
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: e?.message || '上传代理失败' },
            { status: 500 }
        );
    }
}

async function safeReadText(res: Response) {
    try {
        return await res.text();
    } catch {
        return '';
    }
}
