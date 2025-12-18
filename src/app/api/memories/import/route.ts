import { NextRequest, NextResponse } from 'next/server';
import { getQueue } from '@/worker/queue';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
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
        const tenantId = (payload.tenantId && String(payload.tenantId)) || undefined;
        const userId = (payload.userId && String(payload.userId)) || undefined;
        if (!fileKey)
            return NextResponse.json({ success: false, error: 'missing fileKey' }, { status: 400 });

        // ensure memory exists
        let memoryId = memoryIdFromReq;
        if (!memoryId) {
            const mem = await (prisma as any).translationMemory.upsert({
                where: { id: 'global-memory' },
                update: {},
                create: {
                    id: 'global-memory',
                    name: '全局记忆库',
                    description: '默认导入',
                    tenantId: tenantId || null,
                    userId: userId || null,
                },
            });
            memoryId = mem.id;
        }

        const queue = getQueue('memory-import');
        const job = await queue.add('import', {
            fileKey,
            fileType,
            memoryId,
            sourceLang,
            targetLang,
            tenantId,
            userId,
        });
        return NextResponse.json({
            success: true,
            data: { jobId: job.id, queue: 'memory-import', memoryId },
        });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
        );
    }
}
