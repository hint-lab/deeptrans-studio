'use server';

import { startJob, cancelJob, isJobCanceled, clearJob } from '@/lib/jobCancel';
import { requireUser } from '@/lib/guards';

function scopedJobId(userId: string, jobId: string) {
    return `${userId}:${jobId}`;
}

export async function startJobAction(jobId: string) {
    try {
        const authCtx = await requireUser();
        startJob(scopedJobId(authCtx.userId, jobId));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function cancelJobAction(jobId: string) {
    try {
        const authCtx = await requireUser();
        cancelJob(scopedJobId(authCtx.userId, jobId));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function isJobCanceledAction(jobId: string) {
    try {
        const authCtx = await requireUser();
        return { ok: true, canceled: isJobCanceled(scopedJobId(authCtx.userId, jobId)) };
    } catch (e) {
        return { ok: false, error: String(e), canceled: false };
    }
}

export async function clearJobAction(jobId: string) {
    try {
        const authCtx = await requireUser();
        clearJob(scopedJobId(authCtx.userId, jobId));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
