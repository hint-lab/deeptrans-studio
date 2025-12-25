'use server';

import { startJob, cancelJob, isJobCanceled, clearJob } from '@/lib/jobCancel';

export async function startJobAction(jobId: string) {
    try {
        startJob(jobId);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function cancelJobAction(jobId: string) {
    try {
        cancelJob(jobId);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function isJobCanceledAction(jobId: string) {
    try {
        return { ok: true, canceled: isJobCanceled(jobId) };
    } catch (e) {
        return { ok: false, error: String(e), canceled: false };
    }
}

export async function clearJobAction(jobId: string) {
    try {
        clearJob(jobId);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
