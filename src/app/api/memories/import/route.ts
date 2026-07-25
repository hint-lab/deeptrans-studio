import { NextRequest, NextResponse } from 'next/server';
import {
    GuardError,
    guardMessage,
    guardStatus,
    requireOwnedMemory,
    requireUser,
} from '@/lib/guards';
import { defaultJobOpts, getQueue } from '@/worker/queue';

function assertUserUploadObject(fileKey: string, userId: string) {
    if (fileKey.startsWith(`users/${userId}/uploads/`)) return;
    throw new GuardError(403, '无权访问文件');
}

export async function POST(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const contentType = req.headers.get('content-type') || '';
        let payload: any = {};
        if (contentType.includes('application/json')) {
            payload = await req.json();
        } else if (contentType.includes('multipart/form-data')) {
            const form = await req.formData();
            payload = Object.fromEntries(
                Array.from(form.entries()).map(([k, v]) => [
                    k,
                    typeof v === 'string' ? v : (v as any),
                ])
            );
        } else {
            payload = await req.json().catch(() => ({}));
        }

        const fileKey = String(payload.fileKey || '').trim();
        const fileType = String(payload.fileType || payload.ext || '').trim();
        const memoryId = String(payload.memoryId || '').trim() || undefined;
        const sourceLang = (payload.sourceLang && String(payload.sourceLang)) || undefined;
        const targetLang = (payload.targetLang && String(payload.targetLang)) || undefined;
        const sourceKey = (payload.sourceKey && String(payload.sourceKey)) || undefined;
        const targetKey = (payload.targetKey && String(payload.targetKey)) || undefined;
        const notesKey = (payload.notesKey && String(payload.notesKey)) || undefined;
        if (!fileKey)
            return NextResponse.json({ success: false, error: 'missing fileKey' }, { status: 400 });
        if (!fileType)
            return NextResponse.json(
                { success: false, error: 'missing fileType' },
                { status: 400 }
            );
        assertUserUploadObject(fileKey, authCtx.userId);

        if (!memoryId) throw new GuardError(400, '请选择目标记忆库');
        const memory = await requireOwnedMemory(memoryId, authCtx);

        const queue = getQueue('memory-import');
        const job = await queue.add(
            'import',
            {
                fileKey,
                fileType,
                memoryId: memory.id,
                sourceLang,
                targetLang,
                sourceKey,
                targetKey,
                notesKey,
                tenantId: authCtx.tenantId || null,
                userId: authCtx.userId,
            },
            defaultJobOpts
        );
        return NextResponse.json({
            success: true,
            data: { jobId: job.id, queue: 'memory-import', memoryId: memory.id },
        });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: guardMessage(e) || String(e) },
            { status: guardStatus(e) }
        );
    }
}
