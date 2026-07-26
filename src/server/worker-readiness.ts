import {
    WORKER_HEARTBEAT_EXPIRES_SECONDS,
    WORKER_HEARTBEAT_INTERVAL_MS,
    WORKER_HEARTBEAT_KEY,
    createWorkerHeartbeat,
    deriveWorkerReadiness,
    staleWorkerHeartbeatIds,
    type WorkerReadiness,
} from '@/lib/worker-readiness';

type WorkerReadinessRedis = {
    hgetall(key: string): Promise<Record<string, string>>;
    hset(key: string, field: string, value: string): Promise<unknown>;
    hdel(key: string, ...fields: string[]): Promise<unknown>;
    expire(key: string, seconds: number): Promise<unknown>;
};

export type WorkerHeartbeatController = {
    stop(): Promise<void>;
};

export async function readWorkerReadiness(
    redis: Pick<WorkerReadinessRedis, 'hgetall'>,
    queue: string,
    now = Date.now()
): Promise<WorkerReadiness> {
    try {
        return deriveWorkerReadiness(await redis.hgetall(WORKER_HEARTBEAT_KEY), { queue, now });
    } catch {
        // Redis availability is itself a prerequisite for a queued worker. Do
        // not leak transport details through the import-status endpoint.
        return deriveWorkerReadiness({}, { queue, now });
    }
}

/**
 * Start publishing one worker's liveness only after its queue connection has
 * emitted `ready`. A graceful stop removes only this worker's field, allowing
 * multiple workers to coexist safely in the same heartbeat hash.
 */
export async function startWorkerHeartbeat(
    redis: WorkerReadinessRedis,
    options: {
        workerId: string;
        queues: readonly string[];
        now?: () => number;
        intervalMs?: number;
    }
): Promise<WorkerHeartbeatController> {
    const now = options.now || (() => Date.now());
    const readyAt = now();
    const intervalMs = options.intervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS;
    let stopped = false;

    const publish = async () => {
        if (stopped) return;
        const heartbeat = createWorkerHeartbeat(options.queues, readyAt, now());
        await redis.hset(WORKER_HEARTBEAT_KEY, options.workerId, JSON.stringify(heartbeat));
        // HSET must finish before EXPIRE; issuing both in parallel can leave a
        // newly-created hash without a TTL.
        await redis.expire(WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_EXPIRES_SECONDS);
        try {
            const staleWorkerIds = staleWorkerHeartbeatIds(
                await redis.hgetall(WORKER_HEARTBEAT_KEY),
                { now: now() }
            );
            if (staleWorkerIds.length) {
                await redis.hdel(WORKER_HEARTBEAT_KEY, ...staleWorkerIds);
            }
        } catch {
            // Heartbeat publication already succeeded. Cleanup is best effort
            // and must not make a live worker look unavailable.
        }
    };

    await publish();
    const timer = setInterval(() => {
        void publish().catch(() => {
            // The existing `connection.on('error')` path owns transport logs.
            // The absent/stale heartbeat is the client-facing signal.
        });
    }, intervalMs);
    timer.unref?.();

    return {
        async stop() {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            try {
                await redis.hdel(WORKER_HEARTBEAT_KEY, options.workerId);
            } catch {
                // Let the expiry contract mark an ungraceful shutdown stale.
            }
        },
    };
}
