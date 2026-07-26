/**
 * A vector-backfill job is allowed to return only aggregate coverage.  Keep
 * the parser shared by the route and dashboard so a malformed database or
 * queue value can never become a misleading "0 entries" state in the UI.
 */
export type MemoryVectorCoverage = {
    total: number;
    indexed: number;
    remaining: number;
};

function nonNegativeSafeInteger(value: unknown) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }

    if (typeof value === 'bigint') {
        if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        return Number(value);
    }

    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!/^\d+$/.test(normalized)) return null;
        const parsed = Number(normalized);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    return null;
}

/**
 * Count aggregates arrive as bigint from Postgres and may be serialized as
 * strings by a queue adapter.  The arithmetic invariant is important: do not
 * turn a malformed response into a false claim that all entries are indexed.
 */
export function normalizeMemoryVectorCoverage(value: unknown): MemoryVectorCoverage | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const total = nonNegativeSafeInteger(record.total);
    const indexed = nonNegativeSafeInteger(record.indexed);
    const remaining = nonNegativeSafeInteger(record.remaining);
    if (total === null || indexed === null || remaining === null) return null;
    if (indexed + remaining !== total) return null;
    return { total, indexed, remaining };
}

export function isMemoryVectorBackfillPendingState(state: unknown) {
    return state === 'waiting' || state === 'active' || state === 'delayed';
}

export function isMemoryVectorBackfillWorkerProblem(workerStatus: unknown) {
    return workerStatus === 'unavailable' || workerStatus === 'stale' ? workerStatus : null;
}
