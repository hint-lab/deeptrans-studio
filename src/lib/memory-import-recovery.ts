import { memoryImportWorkerProblem, type WorkerReadinessStatus } from './worker-readiness';

/**
 * A queued import can outlive a browser tab. Keep only the opaque queue job
 * reference locally; the status endpoint remains the authority and verifies
 * the signed-in owner before returning anything about the job.
 */
export const MEMORY_IMPORT_RECOVERY_STORAGE_KEY = 'deeptrans:memory-import:recovery:v1';
export const MEMORY_IMPORT_POLL_INTERVAL_MS = 1_000;
export const MEMORY_IMPORT_POLL_LIMIT = 90;

export type MemoryImportRecoveryRecord = {
    version: 1;
    jobId: string;
    memoryId: string;
    /**
     * A display-only name returned for an owned memory. Job and memory IDs
     * remain the only values used for recovery/status requests.
     */
    memoryName?: string;
    createdAt: number;
    lastState?: string;
};

function text(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Browser storage is namespaced by the authenticated server-provided scope.
 * Never use a process-wide key: a later login on a shared browser must not
 * even see another account's opaque job references.
 */
export function memoryImportRecoveryStorageKey(scope: unknown) {
    const normalizedScope = text(scope, 200);
    return normalizedScope
        ? `${MEMORY_IMPORT_RECOVERY_STORAGE_KEY}:${encodeURIComponent(normalizedScope)}`
        : '';
}

function normalizeRecoveryRecord(value: unknown): MemoryImportRecoveryRecord | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<MemoryImportRecoveryRecord>;
    const jobId = text(record.jobId, 200);
    const memoryId = text(record.memoryId, 200);
    const memoryName = text(record.memoryName, 200);
    const createdAt = record.createdAt;
    if (
        record.version !== 1 ||
        !jobId ||
        !memoryId ||
        !Number.isFinite(createdAt) ||
        Number(createdAt) <= 0
    ) {
        return null;
    }
    const lastState = text(record.lastState, 40);
    return {
        version: 1,
        jobId,
        memoryId,
        ...(memoryName ? { memoryName } : {}),
        createdAt: Number(createdAt),
        ...(lastState ? { lastState } : {}),
    };
}

/** Parse untrusted browser storage without ever trusting it for authorization. */
export function parseMemoryImportRecoveryRecords(value: unknown): MemoryImportRecoveryRecord[] {
    let rawRecords: unknown = value;
    if (typeof value === 'string') {
        try {
            rawRecords = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(rawRecords)) return [];

    const byJobId = new Map<string, MemoryImportRecoveryRecord>();
    for (const rawRecord of rawRecords) {
        const record = normalizeRecoveryRecord(rawRecord);
        if (!record) continue;
        const prior = byJobId.get(record.jobId);
        if (!prior || record.createdAt >= prior.createdAt) byJobId.set(record.jobId, record);
    }
    return Array.from(byJobId.values()).sort((left, right) => right.createdAt - left.createdAt);
}

export function upsertMemoryImportRecoveryRecord(
    records: readonly MemoryImportRecoveryRecord[],
    next: MemoryImportRecoveryRecord
) {
    return parseMemoryImportRecoveryRecords([
        ...records.filter(record => record.jobId !== next.jobId),
        next,
    ]);
}

export function removeMemoryImportRecoveryRecord(
    records: readonly MemoryImportRecoveryRecord[],
    jobId: string
) {
    return parseMemoryImportRecoveryRecords(records.filter(record => record.jobId !== jobId));
}

/**
 * Never let an unconfirmed queued/active job be silently replaced by another
 * submission to the same target memory. Only a confirmed terminal failure is
 * released here; successful jobs are removed after their result is validated.
 * A failure is deliberately not retried here: the user must make a new,
 * explicit import decision.
 */
export function memoryImportBlocksNewSubmission(
    records: readonly MemoryImportRecoveryRecord[],
    memoryId: string
) {
    const normalizedMemoryId = text(memoryId, 200);
    if (!normalizedMemoryId) return false;
    return records.some(
        record => record.memoryId === normalizedMemoryId && record.lastState !== 'failed'
    );
}

export type MemoryImportTrackingDecision =
    | { kind: 'completed' }
    | { kind: 'acknowledged' }
    | { kind: 'failed' }
    | { kind: 'awaiting-worker'; problem: Exclude<WorkerReadinessStatus, 'ready'> }
    | { kind: 'background' }
    | { kind: 'continue' };

/**
 * Keep status polling bounded. Reaching the limit does not mean the job has
 * failed; it merely hands control back to the user with a durable resume path.
 */
export function decideMemoryImportTracking(input: {
    state: unknown;
    workerStatus: unknown;
    pollAttempt: number;
    pollLimit?: number;
}): MemoryImportTrackingDecision {
    if (input.state === 'completed') return { kind: 'completed' };
    if (input.state === 'acknowledged') return { kind: 'acknowledged' };
    if (input.state === 'failed') return { kind: 'failed' };

    const workerProblem = memoryImportWorkerProblem(input.state, input.workerStatus);
    if (workerProblem) return { kind: 'awaiting-worker', problem: workerProblem };

    const pollLimit = input.pollLimit ?? MEMORY_IMPORT_POLL_LIMIT;
    if (Number.isFinite(input.pollAttempt) && input.pollAttempt >= pollLimit) {
        return { kind: 'background' };
    }
    return { kind: 'continue' };
}
