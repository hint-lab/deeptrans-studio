export type BatchPreTranslateProgressSnapshot = {
    terminal?: boolean;
    canceled?: boolean;
};

/**
 * `requested` only records a click that raced with batch creation; it is not
 * a claim that the server stopped the batch. `requesting` likewise remains
 * non-terminal until Redis resolves the cancel-vs-persist race.
 */
export type BatchPreTranslateCancelState = 'idle' | 'requested' | 'requesting' | 'confirmed';

export type BatchPreTranslateModelOutcome<Result> =
    | { canceled: true }
    | { canceled: false; result: Result };

export type BatchPreTranslateResultCommit = {
    canceled: boolean;
    committed: boolean;
    count: number;
};

export type BatchPreTranslateCancelRequestResult =
    | { canceled: true }
    | { canceled: false; reason: 'persisting' | 'committed' };

type BatchPreTranslateRedisConnection = {
    eval: (...args: any[]) => Promise<unknown>;
};

/**
 * Queue a local cancel intent. A batch id is needed before that intent can be
 * sent to the server, so only `confirmed` is safe to present as canceled.
 */
export function beginBatchPreTranslateCancel(
    state: BatchPreTranslateCancelState,
    hasBatchId: boolean
): BatchPreTranslateCancelState {
    if (state === 'confirmed' || state === 'requesting') return state;
    return hasBatchId ? 'requesting' : 'requested';
}

/**
 * A rejected cancel means persistence already won. Return to idle so the UI
 * continues the real batch state instead of falsely announcing cancellation.
 */
export function resolveBatchPreTranslateCancelAttempt(
    state: BatchPreTranslateCancelState,
    accepted: boolean
): BatchPreTranslateCancelState {
    if (state !== 'requesting') return state;
    return accepted ? 'confirmed' : 'idle';
}

export function isBatchPreTranslateCancelConfirmed(state: BatchPreTranslateCancelState): boolean {
    return state === 'confirmed';
}

/**
 * This is the server-side half of the cancellation-versus-persist race. The
 * action authorizes the batch owner first; this helper then atomically either
 * installs the cancellation fence or reports that durable persistence owns
 * the batch already.
 */
export async function requestBatchPreTranslateCancelWithRedis(
    batchId: string,
    connection: BatchPreTranslateRedisConnection,
    ttlSeconds: number
): Promise<BatchPreTranslateCancelRequestResult> {
    const outcome = String(
        await connection.eval(
            `
            -- batch-pre-translate-request-cancel
            if redis.call('get', KEYS[2]) == '1' then
                return 'COMMITTED'
            end
            if redis.call('exists', KEYS[1]) == 1 then
                return 'PERSISTING'
            end
            redis.call('set', KEYS[3], '1', 'EX', ARGV[1])
            return 'CANCELED'
            `,
            3,
            `batch.${batchId}.persist.lock`,
            `batch.${batchId}.persist.completed`,
            `batch.${batchId}.cancel`,
            String(ttlSeconds)
        )
    ).toUpperCase();

    if (outcome === 'CANCELED') return { canceled: true };
    return { canceled: false, reason: outcome === 'COMMITTED' ? 'committed' : 'persisting' };
}

/**
 * A model call is not generally interruptible. Fence it both before and after
 * execution so an accepted cancellation never reaches result publication.
 */
export async function runBatchPreTranslateModelWithCancellation<Result>(deps: {
    isCancellationRequested: () => Promise<boolean>;
    runModel: () => Promise<Result>;
}): Promise<BatchPreTranslateModelOutcome<Result>> {
    if (await deps.isCancellationRequested()) return { canceled: true };

    const result = await deps.runModel();

    if (await deps.isCancellationRequested()) return { canceled: true };

    return { canceled: false, result };
}

/**
 * Atomically publishes a finished result only while the batch is still active.
 * The cancel marker wins over cache, terminal marker, and done-counter writes,
 * closing the post-model race that a pair of ordinary Redis commands cannot.
 */
export async function commitBatchPreTranslateResultIfActive(
    connection: BatchPreTranslateRedisConnection,
    batchId: string,
    itemId: string,
    result: Record<string, unknown>,
    ttlSeconds: number
): Promise<BatchPreTranslateResultCommit> {
    const outcome = (await connection.eval(
        `
        -- batch-pre-translate-commit-result
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
        `batch.${batchId}.cancel`,
        `batch.${batchId}.terminal.${itemId}`,
        `batch.${batchId}.item.${itemId}`,
        `batch.${batchId}.done`,
        JSON.stringify(result),
        String(ttlSeconds)
    )) as [number | string, number | string];
    const state = Number(outcome?.[0]);
    return {
        canceled: state === 0,
        committed: state === 1,
        count: Number(outcome?.[1] || 0),
    };
}

/**
 * Publishes a terminal model failure through the same cancellation fence as a
 * successful result. The failure detail is written before the counter becomes
 * terminal, so persistence cannot observe an incomplete failure record.
 */
export async function commitBatchPreTranslateFailureIfActive(
    connection: BatchPreTranslateRedisConnection,
    batchId: string,
    itemId: string,
    errorMessage: string,
    ttlSeconds: number
): Promise<BatchPreTranslateResultCommit> {
    const outcome = (await connection.eval(
        `
        -- batch-pre-translate-commit-failure
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
        `batch.${batchId}.cancel`,
        `batch.${batchId}.terminal.${itemId}`,
        `batch.${batchId}.fail.${itemId}`,
        `batch.${batchId}.failed`,
        errorMessage,
        String(ttlSeconds)
    )) as [number | string, number | string];
    const state = Number(outcome?.[0]);
    return {
        canceled: state === 0,
        committed: state === 1,
        count: Number(outcome?.[1] || 0),
    };
}

/**
 * A terminal progress sample is insufficient when a cancel request is queued
 * or pending. Persist only after both the client state and Redis state permit
 * it, so a local click cannot race a late persistence request.
 */
export function canPersistBatchPreTranslateResults(
    progress: BatchPreTranslateProgressSnapshot | undefined,
    cancellationState: BatchPreTranslateCancelState
): boolean {
    return Boolean(progress?.terminal && !progress.canceled && cancellationState === 'idle');
}
