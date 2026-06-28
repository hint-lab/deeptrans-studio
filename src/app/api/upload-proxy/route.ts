import { NextRequest, NextResponse } from 'next/server';
import { guardMessage, guardStatus, requireUser, requireWritableProject } from '@/lib/guards';
import { getStorageService } from '@/lib/storage/service';
import { assertUploadFileSize } from '@/lib/upload-limits';

export async function POST(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const contentType = req.headers.get('content-type') || '';
        if (!contentType.includes('multipart/form-data')) {
            return NextResponse.json(
                { success: false, error: 'Content-Type 必须为 multipart/form-data' },
                { status: 400 }
            );
        }

        const form = await req.formData();
        const file = form.get('file') as File | null;
        const projectId = String(form.get('projectId') || '').trim();

        if (!file) {
            return NextResponse.json({ success: false, error: '缺少文件' }, { status: 400 });
        }
        assertUploadFileSize(file.size || 0);
        const namespace = projectId
            ? `projects/${(await requireWritableProject(projectId, authCtx)).id}`
            : `users/${authCtx.userId}/uploads`;

        const getUrl = await getStorageService().getUploadUrl(
            file.name,
            file.type || 'application/octet-stream',
            namespace
        );

        const arrayBuffer = await file.arrayBuffer();
        assertUploadFileSize(arrayBuffer.byteLength);
        await getStorageService().putObject({
            fileName: getUrl.fileName,
            body: Buffer.from(arrayBuffer),
            contentType: file.type || 'application/octet-stream',
        });

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
            { success: false, error: guardMessage(e) || '上传代理失败' },
            { status: guardStatus(e) }
        );
    }
}
