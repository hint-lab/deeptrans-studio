const cancelRegistry: Map<string, { canceled: boolean; createdAt: number }> = new Map();

export function startJob(jobId: string) {
    if (!jobId) return;
    cancelRegistry.set(jobId, { canceled: false, createdAt: Date.now() });
}

export function cancelJob(jobId: string) {
    const entry = cancelRegistry.get(jobId);
    if (entry) entry.canceled = true;
}

export function isJobCanceled(jobId: string): boolean {
    const entry = cancelRegistry.get(jobId);
    return !!entry?.canceled;
}

export function clearJob(jobId: string) {
    cancelRegistry.delete(jobId);
}

export function purgeOldJobs(maxAgeMs = 1000 * 60 * 60) {
    const now = Date.now();
    for (const [id, v] of cancelRegistry) {
        if (now - v.createdAt > maxAgeMs) cancelRegistry.delete(id);
    }
}
