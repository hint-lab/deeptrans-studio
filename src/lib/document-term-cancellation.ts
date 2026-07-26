export type DocumentTermsCancelState = 'idle' | 'requested' | 'requesting' | 'confirmed';

export type DocumentTermsModelOutcome<Result> =
    | { canceled: true }
    | { canceled: false; result: Result };

export type DocumentTermsResultCommit = {
    canceled: boolean;
    committed: boolean;
};

export type DocumentTermsCancelRequestResult =
    | { canceled: true }
    | { canceled: false; reason: 'completed' };

type DocumentTermsRedisConnection = {
    eval: (...args: any[]) => Promise<unknown>;
};

/**
 * `requested` represents a click that raced with the initial POST. It is not
 * shown as stopped until the server accepts the cancellation for a queued
 * batch. This mirrors the actual ordering boundary rather than the modal
 * close animation.
 */
export function beginDocumentTermsCancel(
    state: DocumentTermsCancelState,
    hasStartedBatch: boolean
): DocumentTermsCancelState {
    if (state === 'confirmed' || state === 'requesting') return state;
    return hasStartedBatch ? 'requesting' : 'requested';
}

export function resolveDocumentTermsCancelAttempt(
    state: DocumentTermsCancelState,
    accepted: boolean
): DocumentTermsCancelState {
    if (state !== 'requesting') return state;
    return accepted ? 'confirmed' : 'idle';
}

export function isDocumentTermsCancellationConfirmed(state: DocumentTermsCancelState): boolean {
    return state === 'confirmed';
}

/**
 * A retry must never reuse a canceled batch namespace: an in-flight model
 * call from the old batch can still finish after its cancellation fence. The
 * scoped batch id keeps its existing project prefix on the server.
 */
export function createDocumentTermsRetryBatchId(
    projectId: string,
    now = Date.now(),
    nonce = Math.random().toString(36).slice(2, 8)
): string {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) throw new Error('missing project id');
    return `${normalizedProjectId}.${Math.max(0, Math.floor(now))}.${nonce || 'retry'}`;
}

/**
 * Cancellation and result publication are serialized in Redis. If the result
 * terminal marker exists, the model result is already authoritative and this
 * request must be rejected rather than falsely reporting a successful stop.
 * If cancellation wins, an uncommitted/legacy cache entry is removed so it
 * can never be applied from a stale status response.
 */
export async function requestDocumentTermsCancelWithRedis(
    connection: DocumentTermsRedisConnection,
    batchId: string,
    ttlSeconds: number
): Promise<DocumentTermsCancelRequestResult> {
    const outcome = String(
        await connection.eval(
            `
            -- doc-terms-request-cancel
            if redis.call('exists', KEYS[1]) == 1 then
                return 'COMPLETED'
            end
            redis.call('set', KEYS[2], '1', 'EX', ARGV[1])
            redis.call('del', KEYS[3])
            redis.call('set', KEYS[4], '0', 'EX', ARGV[1])
            return 'CANCELED'
            `,
            4,
            `docTerms.${batchId}.terminal.terms.all`,
            `docTerms.${batchId}.cancel`,
            `docTerms.${batchId}.item.terms.all`,
            `docTerms.${batchId}.done`,
            String(ttlSeconds)
        )
    ).toUpperCase();

    return outcome === 'CANCELED' ? { canceled: true } : { canceled: false, reason: 'completed' };
}

/**
 * The model itself is not generally interruptible. These two fences make the
 * cancellation observable both before it starts and after it returns, before
 * any result reaches the cache/apply path.
 */
export async function runDocumentTermsModelWithCancellation<Result>(deps: {
    isCancellationRequested: () => Promise<boolean>;
    runModel: () => Promise<Result>;
}): Promise<DocumentTermsModelOutcome<Result>> {
    if (await deps.isCancellationRequested()) return { canceled: true };

    const result = await deps.runModel();

    if (await deps.isCancellationRequested()) return { canceled: true };

    return { canceled: false, result };
}

/**
 * The worker publishes the finished extraction through this one Redis script.
 * A cancel marker wins over the terminal/cache/done writes, so a late model
 * response cannot become visible or applyable after a confirmed stop.
 */
export async function commitDocumentTermsResultIfActive(
    connection: DocumentTermsRedisConnection,
    batchId: string,
    itemId: string,
    result: Record<string, unknown>,
    ttlSeconds: number
): Promise<DocumentTermsResultCommit> {
    const outcome = (await connection.eval(
        `
        -- doc-terms-commit-result
        if redis.call('get', KEYS[1]) == '1' then
            return 0
        end
        local terminal = redis.call('set', KEYS[2], 'done', 'EX', ARGV[2], 'NX')
        if not terminal then
            return 2
        end
            redis.call('set', KEYS[3], ARGV[1], 'EX', ARGV[2])
            redis.call('set', KEYS[4], '1', 'EX', ARGV[2])
            redis.call('set', KEYS[5], '1', 'EX', ARGV[2])
            return 1
            `,
        5,
        `docTerms.${batchId}.cancel`,
        `docTerms.${batchId}.terminal.${itemId}`,
        `docTerms.${batchId}.item.${itemId}`,
        `docTerms.${batchId}.done`,
        `docTerms.${batchId}.total`,
        JSON.stringify(result),
        String(ttlSeconds)
    )) as number | string;
    const state = Number(outcome);
    return { canceled: state === 0, committed: state === 1 };
}
