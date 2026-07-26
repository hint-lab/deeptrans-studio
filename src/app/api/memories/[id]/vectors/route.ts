import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { GuardError, guardStatus, requireOwnedMemory, requireUser } from '@/lib/guards';
import {
    MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE,
    MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE,
    memoryImportJobFailureMessage,
} from '@/lib/memory-import-errors';
import { normalizeMemoryVectorCoverage } from '@/lib/memory-vector-backfill';
import { readWorkerReadiness } from '@/server/worker-readiness';
import { defaultJobOpts, getQueue, getQueueConnection } from '@/worker/queue';

const queueName = 'memory-vector-backfill';

function jobIdForMemory(memoryId: string) {
    return `memory-vector-backfill-${memoryId}`;
}

async function coverageForMemory(memoryId: string) {
    const rows = await (prisma as any).$queryRaw`
        SELECT
            COUNT(*) AS "total",
            COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS "indexed",
            COUNT(*) FILTER (WHERE embedding IS NULL) AS "remaining"
        FROM "TranslationMemoryEntry"
        WHERE "memoryId" = ${memoryId}
    `;
    const coverage = normalizeMemoryVectorCoverage(Array.isArray(rows) ? rows[0] : null);
    // A malformed aggregate is not evidence that this memory is empty or
    // already indexed. Keep the existing bounded unavailable response instead.
    if (!coverage) throw new Error('INVALID_MEMORY_VECTOR_COVERAGE');
    return coverage;
}

/**
 * BullMQ return values are persisted queue data. Even though the current
 * worker produces this shape, the API must not turn a historical or malformed
 * return value into an arbitrary browser payload.
 */
function completedVectorBackfillResult(value: unknown, memoryId: string) {
    const coverage = normalizeMemoryVectorCoverage(value);
    return coverage ? { memoryId, ...coverage } : null;
}

async function workerStatus() {
    const worker = await readWorkerReadiness(getQueueConnection(), queueName);
    return {
        status: worker.status,
        action: worker.status === 'ready' ? null : 'start-worker',
    };
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const authCtx = await requireUser();
        const { id } = await context.params;
        const memory = await requireOwnedMemory(id, authCtx);
        const queue = getQueue(queueName);
        const jobId = jobIdForMemory(memory.id);
        const existing = await queue.getJob(jobId);
        if (existing) {
            const state = await existing.getState();
            if (state === 'waiting' || state === 'active' || state === 'delayed') {
                return NextResponse.json({ success: true, data: { jobId, state, reused: true } });
            }
            await existing.remove();
        }

        const job = await queue.add(
            'backfill',
            {
                memoryId: memory.id,
                tenantId: authCtx.tenantId || null,
                userId: authCtx.userId,
                batchSize: 100,
            },
            { ...defaultJobOpts, jobId }
        );
        return NextResponse.json({
            success: true,
            data: { jobId: job.id, state: 'waiting', reused: false },
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof GuardError
                        ? error.message
                        : MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE,
            },
            { status: guardStatus(error) }
        );
    }
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const authCtx = await requireUser();
        const { id } = await context.params;
        const memory = await requireOwnedMemory(id, authCtx);
        const jobId = jobIdForMemory(memory.id);
        const coverage = await coverageForMemory(memory.id);
        const job = await getQueue(queueName).getJob(jobId);
        if (!job) {
            // A memory can contain imported legacy entries before a vector job
            // has ever been queued. Surface that owned coverage as an idle
            // state so the dashboard can offer one explicit, deduplicated
            // backfill action rather than calling it a missing task.
            return NextResponse.json({
                success: true,
                data: {
                    jobId,
                    state: 'idle',
                    progress: null,
                    result: null,
                    error: null,
                    coverage,
                    worker: await workerStatus(),
                },
            });
        }
        if (job.data?.userId !== authCtx.userId) {
            throw new GuardError(404, '向量回填任务不存在');
        }

        const state = await job.getState();
        const worker =
            state === 'completed' || state === 'failed'
                ? { status: null, action: null }
                : await workerStatus();
        return NextResponse.json({
            success: true,
            data: {
                jobId,
                state,
                progress: job.progress,
                result:
                    state === 'completed'
                        ? completedVectorBackfillResult(job.returnvalue, memory.id)
                        : null,
                error:
                    state === 'failed'
                        ? memoryImportJobFailureMessage(
                              job.failedReason,
                              MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE
                          )
                        : null,
                coverage,
                worker,
            },
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof GuardError
                        ? error.message
                        : MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE,
            },
            { status: guardStatus(error) }
        );
    }
}
