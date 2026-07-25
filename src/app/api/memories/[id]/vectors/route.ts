import { NextRequest, NextResponse } from 'next/server';
import {
    GuardError,
    guardMessage,
    guardStatus,
    requireOwnedMemory,
    requireUser,
} from '@/lib/guards';
import { defaultJobOpts, getQueue } from '@/worker/queue';

const queueName = 'memory-vector-backfill';

function jobIdForMemory(memoryId: string) {
    return `memory-vector-backfill-${memoryId}`;
}

function safeFailureReason(reason: unknown) {
    return String(reason || '向量回填失败')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
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
            { success: false, error: guardMessage(error) },
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
        const job = await getQueue(queueName).getJob(jobId);
        if (!job || job.data?.userId !== authCtx.userId) {
            throw new GuardError(404, '向量回填任务不存在');
        }

        const state = await job.getState();
        return NextResponse.json({
            success: true,
            data: {
                jobId,
                state,
                progress: job.progress,
                result: state === 'completed' ? job.returnvalue : null,
                error: state === 'failed' ? safeFailureReason(job.failedReason) : null,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: guardMessage(error) },
            { status: guardStatus(error) }
        );
    }
}
