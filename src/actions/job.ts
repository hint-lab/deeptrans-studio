'use server';

import { startJob, cancelJob, isJobCanceled, clearJob } from '@/lib/jobCancel';
import { publicActionErrorMessage } from '@/lib/action-error-boundary';
import { GuardError, requireUser } from '@/lib/guards';

export const JOB_ACTION_UNAVAILABLE_MESSAGE = '任务状态暂不可用，请稍后重试';

function normalizeJobId(jobId: unknown) {
    const normalized = typeof jobId === 'string' ? jobId.trim() : '';
    if (!normalized || normalized.length > 191) throw new GuardError(400, '任务标识无效');
    return normalized;
}

function jobActionErrorMessage(error: unknown) {
    return publicActionErrorMessage(error, JOB_ACTION_UNAVAILABLE_MESSAGE);
}

function scopedJobId(userId: string, jobId: string) {
    return `${userId}:${jobId}`;
}

export async function startJobAction(jobId: unknown) {
    try {
        const authCtx = await requireUser();
        startJob(scopedJobId(authCtx.userId, normalizeJobId(jobId)));
        return { ok: true };
    } catch (error) {
        return { ok: false, error: jobActionErrorMessage(error) };
    }
}

export async function cancelJobAction(jobId: unknown) {
    try {
        const authCtx = await requireUser();
        cancelJob(scopedJobId(authCtx.userId, normalizeJobId(jobId)));
        return { ok: true };
    } catch (error) {
        return { ok: false, error: jobActionErrorMessage(error) };
    }
}

export async function isJobCanceledAction(jobId: unknown) {
    try {
        const authCtx = await requireUser();
        return {
            ok: true,
            canceled: isJobCanceled(scopedJobId(authCtx.userId, normalizeJobId(jobId))),
        };
    } catch (error) {
        return { ok: false, error: jobActionErrorMessage(error), canceled: false };
    }
}

export async function clearJobAction(jobId: unknown) {
    try {
        const authCtx = await requireUser();
        clearJob(scopedJobId(authCtx.userId, normalizeJobId(jobId)));
        return { ok: true };
    } catch (error) {
        return { ok: false, error: jobActionErrorMessage(error) };
    }
}
