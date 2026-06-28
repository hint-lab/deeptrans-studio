import { NextRequest, NextResponse } from 'next/server';
import { getQueue } from '@/worker/queue';
import { prisma } from '@/lib/db';
import { guardMessage, guardStatus, requireOwnedMemory, requireUser, userOwnedWhere } from '@/lib/guards';

function assertUserUploadObject(fileKey: string, userId: string) {
    if (fileKey.startsWith(`users/${userId}/uploads/`)) return;
    throw new Error('无权访问文件');
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
        const memoryIdFromReq = String(payload.memoryId || '').trim() || undefined;
        const sourceLang = (payload.sourceLang && String(payload.sourceLang)) || undefined;
        const targetLang = (payload.targetLang && String(payload.targetLang)) || undefined;
        if (!fileKey)
            return NextResponse.json({ success: false, error: 'missing fileKey' }, { status: 400 });
        assertUserUploadObject(fileKey, authCtx.userId);

        // ensure memory exists
        let memoryId = memoryIdFromReq;
        if (!memoryId) {
            const existing = await (prisma as any).translationMemory.findFirst({
                where: { name: '默认记忆库', ...userOwnedWhere(authCtx) },
                orderBy: { createdAt: 'asc' },
            });
            const mem =
                existing ??
                (await (prisma as any).translationMemory.create({
                    data: {
                        name: '默认记忆库',
                        description: '默认导入',
                        tenantId: authCtx.tenantId || null,
                        userId: authCtx.userId,
                    },
                }));
            memoryId = mem.id;
        } else {
            await requireOwnedMemory(memoryId, authCtx);
        }

        const queue = getQueue('memory-import');
        const job = await queue.add('import', {
            fileKey,
            fileType,
            memoryId,
            sourceLang,
            targetLang,
            tenantId: authCtx.tenantId || null,
            userId: authCtx.userId,
        });
        return NextResponse.json({
            success: true,
            data: { jobId: job.id, queue: 'memory-import', memoryId },
        });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: guardMessage(e) || String(e) },
            { status: guardStatus(e) }
        );
    }
}
