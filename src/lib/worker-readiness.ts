/**
 * A small Redis-backed liveness contract shared by workers and the web app.
 *
 * A queue accepting a job does not prove that a worker is present to consume
 * it.  Keep this module runtime-neutral so both the server route and the
 * browser can reason about the same safe status vocabulary.
 */
export const WORKER_HEARTBEAT_KEY = 'deeptrans:worker:heartbeats:v1';
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_HEARTBEAT_STALE_AFTER_MS = 45_000;
export const WORKER_HEARTBEAT_EXPIRES_SECONDS = 180;

export type WorkerReadinessStatus = 'ready' | 'stale' | 'unavailable';

export type WorkerHeartbeat = {
    version: 1;
    queues: string[];
    readyAt: number;
    updatedAt: number;
};

export type WorkerReadiness = {
    status: WorkerReadinessStatus;
    freshWorkers: number;
    staleWorkers: number;
};

function normalizeQueues(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(
        new Set(
            value
                .filter((queue): queue is string => typeof queue === 'string')
                .map(queue => queue.trim())
                .filter(Boolean)
        )
    );
}

function isTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function createWorkerHeartbeat(
    queues: readonly string[],
    readyAt: number,
    updatedAt = Date.now()
): WorkerHeartbeat {
    return {
        version: 1,
        queues: normalizeQueues(queues),
        readyAt,
        updatedAt,
    };
}

export function parseWorkerHeartbeat(value: unknown): WorkerHeartbeat | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = JSON.parse(value) as Partial<WorkerHeartbeat>;
        const readyAt = parsed.readyAt;
        const updatedAt = parsed.updatedAt;
        if (parsed.version !== 1 || !isTimestamp(readyAt) || !isTimestamp(updatedAt)) {
            return null;
        }
        const queues = normalizeQueues(parsed.queues);
        if (!queues.length) return null;
        return {
            version: 1,
            queues,
            readyAt,
            updatedAt,
        };
    } catch {
        return null;
    }
}

/**
 * Reduces raw Redis hash values to the only states the client needs to know.
 * `stale` distinguishes a crashed/disconnected worker from a worker that has
 * never announced readiness; neither state reveals Redis or host details.
 */
export function deriveWorkerReadiness(
    heartbeats: Record<string, string> | null | undefined,
    options?: {
        queue?: string;
        now?: number;
        staleAfterMs?: number;
    }
): WorkerReadiness {
    const queue = String(options?.queue || '').trim();
    const now = options?.now ?? Date.now();
    const staleAfterMs = options?.staleAfterMs ?? WORKER_HEARTBEAT_STALE_AFTER_MS;
    let freshWorkers = 0;
    let staleWorkers = 0;

    for (const raw of Object.values(heartbeats || {})) {
        const heartbeat = parseWorkerHeartbeat(raw);
        if (!heartbeat || (queue && !heartbeat.queues.includes(queue))) continue;

        // A future timestamp can only be a clock/configuration anomaly. It
        // must not make a missing worker look healthy forever.
        const ageMs = now - heartbeat.updatedAt;
        if (ageMs >= 0 && ageMs <= staleAfterMs) freshWorkers += 1;
        else staleWorkers += 1;
    }

    if (freshWorkers > 0) return { status: 'ready', freshWorkers, staleWorkers };
    if (staleWorkers > 0) return { status: 'stale', freshWorkers, staleWorkers };
    return { status: 'unavailable', freshWorkers, staleWorkers };
}

/**
 * A live worker refreshes the shared hash TTL, so stale fields would otherwise
 * outlive crashed workers indefinitely. Return only stale, well-formed fields
 * for the publisher to prune; malformed values are left for key expiry rather
 * than letting one writer erase data it cannot understand.
 */
export function staleWorkerHeartbeatIds(
    heartbeats: Record<string, string> | null | undefined,
    options?: { now?: number; staleAfterMs?: number }
) {
    const now = options?.now ?? Date.now();
    const staleAfterMs = options?.staleAfterMs ?? WORKER_HEARTBEAT_STALE_AFTER_MS;
    return Object.entries(heartbeats || {}).flatMap(([workerId, raw]) => {
        const heartbeat = parseWorkerHeartbeat(raw);
        if (!heartbeat) return [];
        const ageMs = now - heartbeat.updatedAt;
        return ageMs < 0 || ageMs > staleAfterMs ? [workerId] : [];
    });
}

/**
 * A terminal job already has an authoritative outcome. Do not replace it with
 * a worker-health warning that may have happened after completion.
 */
export function memoryImportWorkerProblem(
    jobState: unknown,
    workerStatus: unknown
): Exclude<WorkerReadinessStatus, 'ready'> | null {
    if (jobState === 'completed' || jobState === 'failed') return null;
    if (workerStatus === 'unavailable' || workerStatus === 'stale') return workerStatus;
    return null;
}
