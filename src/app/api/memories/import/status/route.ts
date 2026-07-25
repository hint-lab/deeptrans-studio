import { NextRequest, NextResponse } from 'next/server';
import { GuardError, guardMessage, guardStatus, requireUser } from '@/lib/guards';
import { getQueue } from '@/worker/queue';

function safeFailureReason(reason: unknown) {
    const message = String(reason || '导入失败')
        .replace(/\s+/g, ' ')
        .trim();
    return message.slice(0, 500);
}

export async function GET(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const jobId = String(req.nextUrl.searchParams.get('jobId') || '').trim();
        if (!jobId) throw new GuardError(400, '缺少 jobId');

        const job = await getQueue('memory-import').getJob(jobId);
        if (!job || job.data?.userId !== authCtx.userId) {
            throw new GuardError(404, '导入任务不存在或无权访问');
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
