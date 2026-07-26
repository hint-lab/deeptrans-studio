import { NextRequest, NextResponse } from 'next/server';
import {
    GuardError,
    guardStatus,
    requireOwnedMemory,
    requireUser,
} from '@/lib/guards';
import {
    MEMORY_IMPORT_UNAVAILABLE_MESSAGE,
    memoryImportJobFailureMessage,
} from '@/lib/memory-import-errors';
import { prisma } from '@/lib/db';
import {
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
    releaseMemoryImportReservationForCurrentOwner,
    resolveMemoryImportAsUnconfirmedForCurrentOwner,
} from '@/lib/memory-import-owner-lock';
import {
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
} from '@/lib/memory-import-ambiguity';
import { usesMemoryImportReceiptProtocol } from '@/lib/memory-import-job';
import { readWorkerReadiness } from '@/server/worker-readiness';
import { getQueue, getQueueConnection } from '@/worker/queue';

// A reservation is written immediately before `queue.add`. Give that small
// hand-off a bounded grace period so a browser polling a few milliseconds
// early cannot manufacture a false legacy gate. After this window, a missing
// job is evidence of an interrupted submission and is deliberately fail-closed.
const RESERVATION_QUEUE_GRACE_MS = 60_000;

function completedReceiptResponse(jobId: string, receipt: any) {
    return NextResponse.json({
        success: true,
        data: {
            jobId: receipt.jobId || jobId,
            memoryId: receipt.memoryId,
            state: 'completed',
            progress: {
                stage: 'complete',
                currentBatch: 1,
                totalBatches: 1,
                progress: 100,
            },
            result: {
                total: receipt.total,
                indexed: receipt.indexed,
                memoryId: receipt.memoryId,
            },
            error: null,
            worker: { status: null, action: null },
            durable: true,
        },
    });
}

function acknowledgedAmbiguityResponse(jobId: string, ambiguity: any) {
    return NextResponse.json({
        success: true,
        data: {
            jobId: ambiguity.jobId || jobId,
            memoryId: ambiguity.memoryId,
            state: 'acknowledged',
            progress: null,
            result: null,
            error: null,
            durable: false,
            worker: { status: null, action: null },
        },
    });
}

function unconfirmedAmbiguityResponse(jobId: string, ambiguity: any) {
    if (ambiguity.acknowledgedAt) return acknowledgedAmbiguityResponse(jobId, ambiguity);
    return NextResponse.json(
        {
            success: false,
            error: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
            code: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
            data: {
                jobId: ambiguity.jobId || jobId,
                memoryId: ambiguity.memoryId,
                state: 'unconfirmed',
            },
        },
        { status: 409 }
    );
}

function reservationGraceResponse(jobId: string, reservation: any) {
    return NextResponse.json({
        success: true,
        data: {
            jobId,
            memoryId: reservation.memoryId,
            state: 'waiting',
            progress: null,
            result: null,
            error: null,
            durable: false,
            reservationPending: true,
            worker: { status: null, action: null },
        },
    });
}

async function receiptForCurrentOwner(jobId: string, authCtx: Awaited<ReturnType<typeof requireUser>>) {
    const receipt = await (prisma as any).translationMemoryImportReceipt.findFirst({
        where: { jobId },
    });
    if (!receipt) return null;
    await requireOwnedMemory(receipt.memoryId, authCtx);
    await Promise.all([
        (prisma as any).translationMemoryImportAmbiguity.deleteMany({
            where: { jobId, memoryId: receipt.memoryId },
        }),
        (prisma as any).translationMemoryImportReservation.deleteMany({
            where: { jobId, memoryId: receipt.memoryId },
        }),
    ]);
    return receipt;
}

async function resolveKnownUnconfirmed(input: {
    jobId: string;
    memoryId: string;
    userId: string;
}) {
    const resolved = await resolveMemoryImportAsUnconfirmedForCurrentOwner(prisma, input);
    if (resolved.status === 'receipt') return completedReceiptResponse(input.jobId, resolved.receipt);
    return unconfirmedAmbiguityResponse(input.jobId, resolved.ambiguity);
}

export async function GET(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const jobId = String(req.nextUrl.searchParams.get('jobId') || '').trim();
        if (!jobId) throw new GuardError(400, '缺少 jobId');

        // Receipt is read before Redis and is retained with the memory, not
        // merely the initiator. That lets a current owner resolve a completed
        // import after a legitimate ownership transfer.
        const receipt = await receiptForCurrentOwner(jobId, authCtx);
        if (receipt) return completedReceiptResponse(jobId, receipt);

        const storedAmbiguity = await (prisma as any).translationMemoryImportAmbiguity.findFirst({
            where: { jobId },
        });
        if (storedAmbiguity) {
            await requireOwnedMemory(storedAmbiguity.memoryId, authCtx);
            return unconfirmedAmbiguityResponse(jobId, storedAmbiguity);
        }

        const reservation = await (prisma as any).translationMemoryImportReservation.findFirst({
            where: { jobId },
        });
        if (reservation) await requireOwnedMemory(reservation.memoryId, authCtx);

        const queue = getQueue('memory-import');
        const job = await queue.getJob(jobId);
        if (!job) {
            // Only an attempt that the server itself persisted can graduate
            // into an ambiguity gate. An arbitrary localStorage pointer or a
            // guessed ID is an ordinary 404 and causes no DB mutation.
            if (!reservation) throw new GuardError(404, '导入任务不存在或无权访问');
            const createdAt = new Date(reservation.createdAt).getTime();
            if (
                Number.isFinite(createdAt) &&
                Date.now() - createdAt >= 0 &&
                Date.now() - createdAt < RESERVATION_QUEUE_GRACE_MS
            ) {
                return reservationGraceResponse(jobId, reservation);
            }
            return resolveKnownUnconfirmed({
                jobId,
                memoryId: reservation.memoryId,
                userId: authCtx.userId,
            });
        }

        const memoryId = String(job.data?.memoryId || '').trim();
        if (!memoryId) throw new GuardError(404, '导入任务不存在或无权访问');
        await requireOwnedMemory(memoryId, authCtx);
        if (reservation && reservation.memoryId !== memoryId) {
            throw new GuardError(404, '导入任务不存在或无权访问');
        }

        const state = await job.getState();
        if (state === 'completed') {
            const completedReceipt = await receiptForCurrentOwner(jobId, authCtx);
            if (completedReceipt) return completedReceiptResponse(jobId, completedReceipt);
            // A terminal queue record is observed server evidence, so an old
            // completion without a receipt is allowed to create a gate.
            return resolveKnownUnconfirmed({ jobId, memoryId, userId: authCtx.userId });
        }

        if (state === 'failed' && !usesMemoryImportReceiptProtocol(job.data)) {
            // Legacy workers could write rows, then fail while handling
            // vectors/cleanup. Treat their failed state as uncertain too.
            return resolveKnownUnconfirmed({ jobId, memoryId, userId: authCtx.userId });
        }

        if (state === 'failed' && reservation) {
            // A v1 worker performs all writes atomically with the receipt.
            // Its terminal failure therefore has no partial rows to protect,
            // and current memory ownership is enough to release the attempt.
            await releaseMemoryImportReservationForCurrentOwner(prisma, {
                jobId,
                memoryId,
                userId: authCtx.userId,
                fileKey: reservation.fileKey,
                inputFingerprint: reservation.inputFingerprint,
            });
        }

        const worker = await readWorkerReadiness(getQueueConnection(), 'memory-import');
        return NextResponse.json({
            success: true,
            data: {
                jobId,
                memoryId,
                state,
                progress: job.progress,
                result: null,
                error:
                    state === 'failed' ? memoryImportJobFailureMessage(job.failedReason) : null,
                worker: {
                    status: worker.status,
                    action: worker.status === 'ready' ? null : 'start-worker',
                },
            },
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR
        ) {
            return NextResponse.json(
                { success: false, error: '导入任务不存在或无权访问' },
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
