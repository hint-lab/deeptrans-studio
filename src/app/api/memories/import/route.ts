import { NextRequest, NextResponse } from 'next/server';
import { GuardError, guardStatus, requireOwnedMemory, requireUser } from '@/lib/guards';
import { MEMORY_IMPORT_UNAVAILABLE_MESSAGE } from '@/lib/memory-import-errors';
import { prisma } from '@/lib/db';
import {
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
    MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR,
    MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR,
    releaseMemoryImportReservationForCurrentOwner,
    reserveMemoryImportForCurrentOwner,
    resolveMemoryImportAsUnconfirmedForCurrentOwner,
} from '@/lib/memory-import-owner-lock';
import {
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
} from '@/lib/memory-import-ambiguity';
import {
    isSameMemoryImportJob,
    legacyMemoryImportJobId,
    memoryImportInputFingerprint,
    memoryImportJobId,
    MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION,
    usesMemoryImportReceiptProtocol,
} from '@/lib/memory-import-job';
import { resolveMemoryImportFormat } from '@/lib/memory-import-format';
import { defaultJobOpts, getQueue } from '@/worker/queue';

function assertUserUploadObject(fileKey: string, userId: string) {
    if (fileKey.startsWith(`users/${userId}/uploads/`)) return;
    throw new GuardError(403, '无权访问文件');
}

function completedImportResponse(input: {
    jobId: string;
    memoryId: string;
    recoveryScope: string;
    reused: boolean;
}) {
    return NextResponse.json({
        success: true,
        data: {
            ...input,
            queue: 'memory-import',
            state: 'completed',
            durable: true,
        },
    });
}

function queuedImportResponse(input: {
    jobId: string;
    memoryId: string;
    state: string;
    recoveryScope: string;
    reused: boolean;
}) {
    return NextResponse.json({
        success: true,
        data: { ...input, queue: 'memory-import' },
    });
}

function unconfirmedImportResponse() {
    return NextResponse.json(
        {
            success: false,
            error: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
            code: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
        },
        { status: 409 }
    );
}

async function resolveTerminalImportAsUnconfirmed(input: {
    jobId: string;
    memoryId: string;
    userId: string;
    recoveryScope: string;
}) {
    const resolved = await resolveMemoryImportAsUnconfirmedForCurrentOwner(prisma, input);
    if (resolved.status === 'receipt') {
        return completedImportResponse({
            jobId: resolved.receipt.jobId,
            memoryId: resolved.receipt.memoryId,
            recoveryScope: input.recoveryScope,
            reused: true,
        });
    }
    if (!resolved.ambiguity.acknowledgedAt) return unconfirmedImportResponse();
    throw new GuardError(409, '该旧导入任务已被解除限制；请重新上传文件后再导入');
}

/**
 * The browser receives this only after authentication and uses it to select
 * its own local recovery namespace. The recovery records remain attached to
 * the memory (rather than the historical user) so ownership transfers cannot
 * bypass an unresolved outcome.
 */
export async function GET() {
    try {
        const authCtx = await requireUser();
        const openAmbiguities = await (prisma as any).translationMemoryImportAmbiguity.findMany({
            where: {
                acknowledgedAt: null,
                memory: { is: { userId: authCtx.userId } },
            },
            select: {
                jobId: true,
                memoryId: true,
                detectedAt: true,
                memory: { select: { name: true } },
            },
            orderBy: { detectedAt: 'desc' },
        });

        // A receipt is authoritative even if the stale gate was created by a
        // different historical owner. Reconcile it before returning cards to
        // the UI, so a completed import never remains visually blocked.
        const ambiguityJobIds = openAmbiguities.map((item: { jobId: string }) => item.jobId);
        const receipts = ambiguityJobIds.length
            ? await (prisma as any).translationMemoryImportReceipt.findMany({
                  where: { jobId: { in: ambiguityJobIds } },
                  select: { jobId: true, memoryId: true },
              })
            : [];
        if (ambiguityJobIds.length) {
            if (receipts.length) {
                await (prisma as any).translationMemoryImportAmbiguity.deleteMany({
                    where: {
                        OR: receipts.map((item: { jobId: string; memoryId: string }) => ({
                            jobId: item.jobId,
                            memoryId: item.memoryId,
                        })),
                    },
                });
            }
        }
        const resolvedJobIds = new Set(receipts.map((item: { jobId: string }) => item.jobId));
        const unconfirmedImports = openAmbiguities
            .filter((item: { jobId: string }) => !resolvedJobIds.has(item.jobId))
            .map(
                (item: {
                    jobId: string;
                    memoryId: string;
                    detectedAt: Date;
                    memory?: { name?: string };
                }) => ({
                    jobId: item.jobId,
                    memoryId: item.memoryId,
                    memoryName: item.memory?.name || null,
                    detectedAt: item.detectedAt,
                })
            );

        // Reservations are returned separately from ambiguity gates: they
        // represent a pending job, not a claim that an import may have
        // already written rows. The status endpoint can safely turn an old,
        // vanished reservation into a gate after its short enqueue grace.
        const reservedImports = await (prisma as any).translationMemoryImportReservation.findMany({
            where: { memory: { is: { userId: authCtx.userId } } },
            select: {
                jobId: true,
                memoryId: true,
                createdAt: true,
                memory: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({
            success: true,
            data: {
                recoveryScope: authCtx.userId,
                unconfirmedImports,
                reservedImports: reservedImports.map(
                    (item: {
                        jobId: string;
                        memoryId: string;
                        createdAt: Date;
                        memory?: { name?: string };
                    }) => ({
                        jobId: item.jobId,
                        memoryId: item.memoryId,
                        memoryName: item.memory?.name || null,
                        createdAt: item.createdAt,
                    })
                ),
            },
        });
    } catch (e: unknown) {
        return NextResponse.json(
            {
                success: false,
                error: e instanceof GuardError ? e.message : MEMORY_IMPORT_UNAVAILABLE_MESSAGE,
            },
            { status: guardStatus(e) }
        );
    }
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
            return NextResponse.json(
                { success: false, error: '缺少上传文件标识' },
                { status: 400 }
            );
        if (!fileType)
            return NextResponse.json(
                { success: false, error: '缺少导入文件类型' },
                { status: 400 }
            );
        if (!resolveMemoryImportFormat(fileType)) {
            return NextResponse.json(
                { success: false, error: '仅支持 TMX/CSV/TSV/XLSX/XLS' },
                { status: 400 }
            );
        }
        assertUserUploadObject(fileKey, authCtx.userId);

        if (!memoryId) throw new GuardError(400, '请选择目标记忆库');
        const memory = await requireOwnedMemory(memoryId, authCtx);
        const identity = {
            userId: authCtx.userId,
            memoryId: memory.id,
            fileKey,
            fileType,
            sourceLang,
            targetLang,
            sourceKey,
            targetKey,
            notesKey,
            tenantId: authCtx.tenantId || null,
        };
        const inputFingerprint = memoryImportInputFingerprint(identity);
        const jobId = memoryImportJobId(identity);
        const queue = getQueue('memory-import');

        // Observe an existing current/legacy job before creating the
        // reservation so an old active worker receives a reservation matching
        // its own ID. The later locked reservation re-check remains the
        // authoritative serialization point.
        const existing = await queue.getJob(jobId);
        const legacyJobId = legacyMemoryImportJobId(identity);
        const legacy = legacyJobId === jobId || existing ? null : await queue.getJob(legacyJobId);
        const reusableJob = existing || legacy;
        if (reusableJob && !isSameMemoryImportJob(reusableJob.data, identity)) {
            throw new GuardError(409, '导入任务冲突，请重新上传文件后重试');
        }
        const reservedJobId = String(reusableJob?.id || jobId).trim();
        if (!reservedJobId) throw new GuardError(503, '无法确认导入任务标识，请稍后重试');
        const reservationInput = {
            jobId: reservedJobId,
            memoryId: memory.id,
            userId: authCtx.userId,
            fileKey,
            inputFingerprint,
        };
        const reservation = await reserveMemoryImportForCurrentOwner(prisma, reservationInput);
        if (reservation.status === 'already-committed') {
            return completedImportResponse({
                jobId: reservation.receipt.jobId,
                memoryId: reservation.receipt.memoryId,
                recoveryScope: authCtx.userId,
                reused: true,
            });
        }

        if (reusableJob) {
            const state = await reusableJob.getState();
            if (state === 'completed') {
                return resolveTerminalImportAsUnconfirmed({
                    jobId: reservedJobId,
                    memoryId: memory.id,
                    userId: authCtx.userId,
                    recoveryScope: authCtx.userId,
                });
            }
            if (state === 'failed') {
                if (usesMemoryImportReceiptProtocol(reusableJob.data)) {
                    await releaseMemoryImportReservationForCurrentOwner(prisma, reservationInput);
                    throw new GuardError(409, '该上传文件已有失败的导入任务，请重新上传文件后重试');
                }
                return resolveTerminalImportAsUnconfirmed({
                    jobId: reservedJobId,
                    memoryId: memory.id,
                    userId: authCtx.userId,
                    recoveryScope: authCtx.userId,
                });
            }
            return queuedImportResponse({
                jobId: reservedJobId,
                memoryId: memory.id,
                state,
                reused: true,
                recoveryScope: authCtx.userId,
            });
        }

        let job: any;
        try {
            job = await queue.add(
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
                    receiptProtocolVersion: MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION,
                },
                { ...defaultJobOpts, jobId }
            );
        } catch {
            // `add` can time out after Redis has accepted the command. Keep
            // the reservation rather than guessing; status recovery will
            // observe the job or eventually require explicit review.
            throw new GuardError(503, '导入任务提交状态暂不可确认，请稍后在此记忆库中恢复核查');
        }
        return queuedImportResponse({
            jobId: String(job.id || jobId),
            memoryId: memory.id,
            state: 'waiting',
            reused: reservation.status === 'existing-reservation',
            recoveryScope: authCtx.userId,
        });
    } catch (e: unknown) {
        // These are fixed protocol sentinels, not browser-visible provider
        // errors. Never stringify an unknown value here: all other failures
        // deliberately fall through to the generic import-service message.
        const protocolCode = e instanceof Error ? e.message : null;
        if (protocolCode === MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR)
            return unconfirmedImportResponse();
        if (
            protocolCode === MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR ||
            protocolCode === MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR
        ) {
            return NextResponse.json(
                { success: false, error: '该记忆库已有另一项导入待核查，请先恢复或明确解除限制' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            {
                success: false,
                error: e instanceof GuardError ? e.message : MEMORY_IMPORT_UNAVAILABLE_MESSAGE,
            },
            { status: guardStatus(e) }
        );
    }
}
