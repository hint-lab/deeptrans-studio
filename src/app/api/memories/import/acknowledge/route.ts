import { NextRequest, NextResponse } from 'next/server';
import {
    GuardError,
    guardStatus,
    requireOwnedMemory,
    requireUser,
} from '@/lib/guards';
import { MEMORY_IMPORT_UNAVAILABLE_MESSAGE } from '@/lib/memory-import-errors';
import { prisma } from '@/lib/db';
import {
    acknowledgeMemoryImportAmbiguityForCurrentOwner,
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
} from '@/lib/memory-import-owner-lock';
import { getQueue } from '@/worker/queue';

const RELEASE_ACKNOWLEDGEMENT = 'release-unconfirmed-import';

/**
 * Explicitly releases only a durable ambiguity gate. It never declares the
 * old import successful or removes any existing memory rows. The caller must
 * then make a new upload/import decision themselves.
 */
export async function POST(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const payload = await req.json().catch(() => ({}));
        const jobId = String(payload?.jobId || '').trim();
        const memoryId = String(payload?.memoryId || '').trim();
        if (!jobId || !memoryId) throw new GuardError(400, '缺少导入任务或记忆库');
        if (payload?.acknowledge !== RELEASE_ACKNOWLEDGEMENT) {
            throw new GuardError(400, '请明确确认解除未验证导入限制');
        }

        const memory = await requireOwnedMemory(memoryId, authCtx);
        const receipt = await (prisma as any).translationMemoryImportReceipt.findFirst({
            where: { jobId },
        });
        if (receipt) {
            if (receipt.memoryId !== memory.id) throw new GuardError(404, '未找到需要核查的导入任务');
            await (prisma as any).translationMemoryImportAmbiguity.deleteMany({
                where: { jobId, memoryId: memory.id },
            });
            await (prisma as any).translationMemoryImportReservation.deleteMany({
                where: { jobId, memoryId: memory.id },
            });
            return NextResponse.json({
                success: true,
                data: { jobId, memoryId: memory.id, acknowledged: false, durable: true },
            });
        }

        const ambiguity = await (prisma as any).translationMemoryImportAmbiguity.findFirst({
            where: { jobId, memoryId: memory.id },
        });
        if (!ambiguity) throw new GuardError(404, '未找到需要核查的导入任务');
        if (ambiguity.acknowledgedAt) {
            return NextResponse.json({
                success: true,
                data: { jobId, memoryId: memory.id, acknowledged: true, durable: false },
            });
        }

        // Do not let an acknowledgement detach a currently running import.
        // A Redis outage also fails closed here: the owner can retry once its
        // queue state is observable rather than risk releasing a live job.
        let job: any;
        try {
            job = await getQueue('memory-import').getJob(jobId);
        } catch {
            throw new GuardError(503, '暂时无法核查导入任务状态，请稍后重试');
        }
        if (job) {
            if (job.data?.memoryId !== memory.id) {
                throw new GuardError(404, '未找到需要核查的导入任务');
            }
            const state = await job.getState();
            if (state !== 'completed' && state !== 'failed') {
                throw new GuardError(409, '导入任务仍在处理中，暂不能解除限制');
            }
        }

        const acknowledged = await acknowledgeMemoryImportAmbiguityForCurrentOwner(prisma, {
            jobId,
            memoryId: memory.id,
            userId: authCtx.userId,
        });
        if (acknowledged.status === 'receipt') {
            return NextResponse.json({
                success: true,
                data: { jobId, memoryId: memory.id, acknowledged: false, durable: true },
            });
        }
        if (acknowledged.status === 'not-found') {
            throw new GuardError(409, '导入限制状态已变化，请刷新后重试');
        }

        return NextResponse.json({
            success: true,
            data: { jobId, memoryId: memory.id, acknowledged: true, durable: false },
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR
        ) {
            return NextResponse.json(
                { success: false, error: '未找到需要核查的导入任务' },
                { status: 404 }
            );
        }
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof GuardError ? error.message : MEMORY_IMPORT_UNAVAILABLE_MESSAGE,
            },
            { status: guardStatus(error) }
        );
    }
}
