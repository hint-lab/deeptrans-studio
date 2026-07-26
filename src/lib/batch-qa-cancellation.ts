export type BatchQAProgressSnapshot = {
    terminal?: boolean;
    canceled?: boolean;
};

/**
 * `requested` means the user canceled before the client had a batch id to
 * send to the server. `requesting` means the cancel API call is in flight.
 * Neither is proof that cancellation won the server-side persist race.
 */
export type BatchQACancelState = 'idle' | 'requested' | 'requesting' | 'confirmed';

export type BatchQAModelOutcome<Result> = { canceled: true } | { canceled: false; result: Result };

export type BatchQAResultCommit = {
    canceled: boolean;
    committed: boolean;
    count: number;
};

type BatchQARedisConnection = {
    eval: (...args: any[]) => Promise<unknown>;
};

export type BatchQACancelRequestResult =
    | { canceled: true }
    | { canceled: false; reason: 'persisting' };

const REQUEST_BATCH_QA_CANCEL_SCRIPT = `
    -- batch-qa-request-cancel
    if redis.call('exists', KEYS[1]) == 1 then
        return 'PERSISTING'
    end
    redis.call('set', KEYS[2], '1', 'EX', ARGV[1])
    return 'CANCELED'
`;

type BatchQAModelCancellationDeps<Result> = {
    isCancellationRequested: () => Promise<boolean>;
    runModel: () => Promise<Result>;
};

/**
 * Starts a cancellation intent without treating it as a confirmed cancel.
 * When the batch id becomes available, call this again with `hasBatchId` to
 * transition a queued request into the server-requesting state.
 */
export function beginBatchQACancel(
    state: BatchQACancelState,
    hasBatchId: boolean
): BatchQACancelState {
    if (state === 'confirmed' || state === 'requesting') return state;
    return hasBatchId ? 'requesting' : 'requested';
}

/**
 * Resolves the server's cancel-vs-persist decision. A rejected request (for
 * example, persist already holds its lock) returns to `idle`; it must never
 * be presented to the user as a completed cancellation.
 */
export function resolveBatchQACancelAttempt(
    state: BatchQACancelState,
    accepted: boolean
): BatchQACancelState {
    if (state !== 'requesting') return state;
    return accepted ? 'confirmed' : 'idle';
}

export function isBatchQACancelConfirmed(state: BatchQACancelState): boolean {
    return state === 'confirmed';
}

/**
 * Redis-only half of the cancel-vs-persist race.  It deliberately carries no
 * session lookup: server actions must authorize the batch owner before calling
 * it, while this isolated boundary remains directly testable with a fake Redis
 * connection.
 */
export async function requestBatchQACancelWithRedis(
    batchId: string,
    connection: BatchQARedisConnection,
    ttlSeconds: number
): Promise<BatchQACancelRequestResult> {
    const outcome = String(
        await connection.eval(
            REQUEST_BATCH_QA_CANCEL_SCRIPT,
            2,
            `qa.${batchId}.persist.lock`,
            `qa.${batchId}.cancel`,
            String(ttlSeconds)
        )
    ).toUpperCase();

    return outcome === 'CANCELED' ? { canceled: true } : { canceled: false, reason: 'persisting' };
}

/**
 * Runs the long-lived model phase with an explicit fence after it completes.
 * The worker then sends a successful result to its atomic Redis commit point;
 * a cancellation that arrives while the model is running never reaches that
 * commit point at all.
 */
export async function runBatchQAModelWithCancellation<Result>(
    deps: BatchQAModelCancellationDeps<Result>
): Promise<BatchQAModelOutcome<Result>> {
    if (await deps.isCancellationRequested()) return { canceled: true };

    const result = await deps.runModel();

    // This is deliberately separate from the pre-model check: model calls can
    // take seconds or minutes, and the cancel request can arrive in between.
    if (await deps.isCancellationRequested()) return { canceled: true };

    return { canceled: false, result };
}

/**
 * Atomically fences one finished model result against cancellation. The
 * Redis script is the publication point: cancel, cache, terminal marker, and
 * done counter cannot interleave into a partially visible QA result.
 */
export async function commitBatchQAResultIfActive(
    connection: { eval: (...args: any[]) => Promise<unknown> },
    batchId: string,
    itemId: string,
    result: Record<string, unknown>,
    ttlSeconds: number
): Promise<BatchQAResultCommit> {
    const committed = (await connection.eval(
        `
        -- batch-qa-commit-result
        if redis.call('get', KEYS[1]) == '1' then
            return {0, tonumber(redis.call('get', KEYS[4]) or '0')}
        end
        local terminal = redis.call('set', KEYS[2], 'done', 'EX', ARGV[2], 'NX')
        if not terminal then
            return {2, tonumber(redis.call('get', KEYS[4]) or '0')}
        end
        redis.call('set', KEYS[3], ARGV[1], 'EX', ARGV[2])
        local count = redis.call('incr', KEYS[4])
        return {1, count}
        `,
        4,
        `qa.${batchId}.cancel`,
        `qa.${batchId}.terminal.${itemId}`,
        `qa.${batchId}.item.${itemId}`,
        `qa.${batchId}.done`,
        JSON.stringify(result),
        String(ttlSeconds)
    )) as [number | string, number | string];
    const state = Number(committed?.[0]);
    return {
        canceled: state === 0,
        committed: state === 1,
        count: Number(committed?.[1] || 0),
    };
}

/**
 * Atomically publishes a final worker failure.  The failure detail must be
 * visible before the `failed` counter can make the batch terminal; otherwise
 * a concurrent persist can observe a terminal batch, miss the failed item,
 * and clean the namespace before the separate failure write arrives.
 *
 * Cancellation gets the same precedence as a successful model result.  A
 * failure that reaches this point after a confirmed cancel is intentionally
 * not converted into a retryable/failed item for a batch that will never be
 * persisted.
 */
export async function commitBatchQAFailureIfActive(
    connection: { eval: (...args: any[]) => Promise<unknown> },
    batchId: string,
    itemId: string,
    errorMessage: string,
    ttlSeconds: number
): Promise<BatchQAResultCommit> {
    const committed = (await connection.eval(
        `
        -- batch-qa-commit-failure
        if redis.call('get', KEYS[1]) == '1' then
            return {0, tonumber(redis.call('get', KEYS[4]) or '0')}
        end
        local terminal = redis.call('set', KEYS[2], 'failed', 'EX', ARGV[2], 'NX')
        if not terminal then
            return {2, tonumber(redis.call('get', KEYS[4]) or '0')}
        end
        redis.call('set', KEYS[3], ARGV[1], 'EX', ARGV[2])
        local count = redis.call('incr', KEYS[4])
        return {1, count}
        `,
        4,
        `qa.${batchId}.cancel`,
        `qa.${batchId}.terminal.${itemId}`,
        `qa.${batchId}.fail.${itemId}`,
        `qa.${batchId}.failed`,
        errorMessage,
        String(ttlSeconds)
    )) as [number | string, number | string];
    const state = Number(committed?.[0]);
    return {
        canceled: state === 0,
        committed: state === 1,
        count: Number(committed?.[1] || 0),
    };
}

/**
 * A terminal progress response is not authorization to persist by itself.
 * The client must also verify that neither its local cancel action nor the
 * authoritative server progress state marks the batch as canceled.
 */
export function canPersistBatchQAResults(
    progress: BatchQAProgressSnapshot | undefined,
    cancellationState: BatchQACancelState
): boolean {
    // A request that is queued or still in flight must fence persistence until
    // Redis has authoritatively accepted or rejected it.
    return Boolean(progress?.terminal && !progress.canceled && cancellationState === 'idle');
}
