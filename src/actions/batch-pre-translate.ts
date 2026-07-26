import { prisma } from '@/lib/db';
import { requestBatchPreTranslateCancelWithRedis } from '@/lib/batch-pre-translate-cancellation';
import type { AuthContext } from '@/lib/guards';
import { GuardError, requireWritableDocumentItem, requireUser } from '@/lib/guards';
import { TTL_BATCH } from '@/lib/redis-ttl';
import { sourceRevision, withSourceRevisions } from '@/lib/source-revision';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';
import { randomUUID } from 'node:crypto';

const BATCH_PRE_TRANSLATE_ELIGIBLE_STATUSES = new Set(['NOT_STARTED']);
const PERSIST_LOCK_TTL_SECONDS = Math.max(60, TTL_BATCH);
const BATCH_PRE_TRANSLATE_CANCELED_MESSAGE = '批量预译已取消，结果不会保存';

// Cancel and persistence share this Redis serialization point. A confirmed
// cancel wins before any database writes begin; once this lease is acquired,
// cancel is explicitly rejected rather than being falsely reported as done.
const ACQUIRE_BATCH_PRE_TRANSLATE_PERSIST_LOCK_SCRIPT = `
    -- batch-pre-translate-acquire-persist-lock
    if redis.call('get', KEYS[1]) == '1' then
        return 'CANCELED'
    end
    if redis.call('get', KEYS[3]) == '1' then
        return 'COMMITTED'
    end
    if redis.call('set', KEYS[2], ARGV[1], 'EX', ARGV[2], 'NX') then
        return 'ACQUIRED'
    end
    return 'LOCKED'
`;

type BatchPreTranslateResult = {
    id: string;
    sourceText: string;
    targetText: string | null;
    sourceRevision: string;
    translation: string;
    terms?: unknown;
    dict?: unknown;
};

type BatchPreTranslateCurrentItem = {
    id: string;
    sourceText: string | null;
    targetText: string | null;
    status?: string | null;
    metadata?: unknown;
    updatedAt?: Date;
};

type PersistBatchPreTranslateDeps = {
    connection: any;
    authCtx: AuthContext;
    requireWritableDocumentItem: (
        id: string,
        authCtx: AuthContext
    ) => Promise<BatchPreTranslateCurrentItem>;
    persistItemAtomically: (
        data: BatchPreTranslateResult,
        currentItem: BatchPreTranslateCurrentItem,
        authCtx: AuthContext
    ) => Promise<boolean>;
    lockToken?: string;
};

export type BatchPreTranslatePromptSnapshot = {
    termExtractPrompt?: string;
    termEmbedPrompt?: string;
};

type ResolveBatchPreTranslatePrompt = (
    authCtx: AuthContext,
    nodeKey: 'mono-term-extract' | 'term-embed-trans'
) => Promise<string | undefined>;

/**
 * Resolve prompts exactly once when the batch is enqueued. Queue workers must
 * use this snapshot rather than querying the user's mutable prompt settings.
 */
export async function resolveBatchPreTranslatePromptSnapshot(
    authCtx: AuthContext,
    resolvePrompt: ResolveBatchPreTranslatePrompt = resolveWorkflowPrompt
): Promise<BatchPreTranslatePromptSnapshot> {
    const [termExtractPrompt, termEmbedPrompt] = await Promise.all([
        resolvePrompt(authCtx, 'mono-term-extract'),
        resolvePrompt(authCtx, 'term-embed-trans'),
    ]);
    return { termExtractPrompt, termEmbedPrompt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isBatchPreTranslateEligibleStatus(status: unknown): boolean {
    return BATCH_PRE_TRANSLATE_ELIGIBLE_STATUSES.has(String(status || ''));
}

export function isBatchPreTranslateTerminal(total: number, done: number, failed: number): boolean {
    return total > 0 && done >= 0 && failed >= 0 && done + failed === total;
}

export function createBatchPreTranslateId(now = Date.now(), suffix: string = randomUUID()): string {
    return `bt.${now}.${suffix}`;
}

export function getBatchPreTranslateStaleReason(
    data: BatchPreTranslateResult,
    currentItem: BatchPreTranslateCurrentItem
): string | undefined {
    if (!isBatchPreTranslateEligibleStatus(currentItem.status)) return 'STATUS_CHANGED';
    if (data.sourceRevision !== sourceRevision(data.sourceText)) return 'INVALID_SOURCE_SNAPSHOT';
    if (String(currentItem.sourceText || '') !== data.sourceText) return 'SOURCE_CHANGED';
    if ((currentItem.targetText ?? null) !== (data.targetText ?? null)) return 'TARGET_CHANGED';
    return undefined;
}

async function requireBatchOwner(connection: any, batchId: string) {
    if (!String(batchId || '').startsWith('bt.')) throw new GuardError(400, '无效的批量预译任务');
    const authCtx = await requireUser();
    const ownerId = await connection.get(`batch.${batchId}.userId`);
    if (!ownerId || ownerId !== authCtx.userId) throw new GuardError(401, '未授权');
    return authCtx;
}

async function persistBatchPreTranslateItemAtomically(
    data: BatchPreTranslateResult,
    currentItem: BatchPreTranslateCurrentItem,
    authCtx: AuthContext
): Promise<boolean> {
    const metadata = withSourceRevisions(
        isRecord(currentItem.metadata) ? currentItem.metadata : {},
        currentItem.sourceText,
        { preTranslate: true, target: true }
    );
    const where: Record<string, unknown> = {
        id: data.id,
        status: 'NOT_STARTED',
        sourceText: currentItem.sourceText || '',
        targetText: currentItem.targetText ?? null,
        document: { project: { userId: authCtx.userId } },
    };
    if (currentItem.updatedAt) where.updatedAt = currentItem.updatedAt;

    const persisted = await prisma.documentItem.updateMany({
        where: where as any,
        data: {
            targetText: data.translation,
            preTranslateTerms: data.terms as any,
            preTranslateDict: data.dict as any,
            preTranslateEmbedded: data.translation as any,
            metadata,
            // The worker has completed a real translation result. Its next
            // state is human MT review, not a client-synthesized status jump.
            status: 'MT_REVIEW',
        } as any,
    });
    return persisted.count === 1;
}

async function releasePersistLock(connection: any, lockKey: string, lockToken: string) {
    await connection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken
    );
}

async function acquireBatchPreTranslatePersistLock(
    connection: any,
    batchId: string,
    lockToken: string
): Promise<'acquired' | 'canceled' | 'committed' | 'locked'> {
    const outcome = String(
        await connection.eval(
            ACQUIRE_BATCH_PRE_TRANSLATE_PERSIST_LOCK_SCRIPT,
            3,
            `batch.${batchId}.cancel`,
            `batch.${batchId}.persist.lock`,
            `batch.${batchId}.persist.completed`,
            lockToken,
            String(PERSIST_LOCK_TTL_SECONDS)
        )
    ).toUpperCase();

    if (outcome === 'CANCELED') return 'canceled';
    if (outcome === 'COMMITTED') return 'committed';
    if (outcome === 'ACQUIRED') return 'acquired';
    return 'locked';
}

async function requestAuthorizedBatchPreTranslateCancel(batchId: string, connection: any) {
    const result = await requestBatchPreTranslateCancelWithRedis(batchId, connection, TTL_BATCH);
    if (!result.canceled) {
        throw new GuardError(
            409,
            result.reason === 'committed'
                ? '批量预译结果已保存，无法取消'
                : '批量预译结果正在保存，无法取消'
        );
    }
    return { ok: true, canceled: true } as const;
}

/**
 * Persist only a terminal batch. Each result is re-authorized and conditionally
 * written against its source, target and updated-at snapshot, so a late worker
 * can never overwrite a segment that was edited or advanced meanwhile.
 * @internal
 */
export async function persistBatchPreTranslateResultsWithDeps(
    batchId: string,
    deps: PersistBatchPreTranslateDeps
) {
    const { connection, authCtx, requireWritableDocumentItem, persistItemAtomically } = deps;
    if ((await connection.get(`batch.${batchId}.cancel`)) === '1') {
        throw new GuardError(409, BATCH_PRE_TRANSLATE_CANCELED_MESSAGE);
    }
    const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`batch.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`batch.${batchId}.failed`)) || 0;
    if ((await connection.get(`batch.${batchId}.cancel`)) === '1') {
        throw new GuardError(409, BATCH_PRE_TRANSLATE_CANCELED_MESSAGE);
    }
    if (!isBatchPreTranslateTerminal(total, done, failed)) {
        throw new GuardError(409, '批量预译尚未结束，暂不能保存结果');
    }

    const lockKey = `batch.${batchId}.persist.lock`;
    const lockToken = deps.lockToken || randomUUID();
    const lockState = await acquireBatchPreTranslatePersistLock(connection, batchId, lockToken);
    if (lockState === 'canceled') {
        throw new GuardError(409, BATCH_PRE_TRANSLATE_CANCELED_MESSAGE);
    }
    if (lockState === 'committed') {
        throw new GuardError(409, '批量预译结果已保存，请刷新后确认分段状态');
    }
    if (lockState !== 'acquired') {
        throw new GuardError(409, '批量预译结果正在保存，请稍后重试');
    }

    try {
        const keys: string[] = await connection.keys(`batch.${batchId}.item.*`);
        const failureKeys: string[] = await connection.keys(`batch.${batchId}.fail.*`);
        const terminalKeys: string[] = await connection.keys(`batch.${batchId}.terminal.*`);
        const updatedIds: string[] = [];
        const staleIds: string[] = [];
        const retryableIds: string[] = [];

        for (const key of keys) {
            let data: BatchPreTranslateResult;
            try {
                const raw = await connection.get(key);
                data = raw
                    ? (JSON.parse(raw) as BatchPreTranslateResult)
                    : ({} as BatchPreTranslateResult);
            } catch {
                await connection.del(key);
                continue;
            }

            const itemId = String(data?.id || '');
            if (!itemId || !data.translation || !data.sourceText) {
                await connection.del(key);
                continue;
            }
            data.id = itemId;

            let currentItem: BatchPreTranslateCurrentItem;
            try {
                currentItem = await requireWritableDocumentItem(itemId, authCtx);
            } catch {
                retryableIds.push(itemId);
                continue;
            }

            if (getBatchPreTranslateStaleReason(data, currentItem)) {
                staleIds.push(itemId);
                await connection.del(key);
                continue;
            }

            try {
                const persisted = await persistItemAtomically(data, currentItem, authCtx);
                if (!persisted) {
                    staleIds.push(itemId);
                    await connection.del(key);
                    continue;
                }
                updatedIds.push(itemId);
                await connection.del(key);
            } catch {
                // Keep the cached result and counters for a safe retry.
                retryableIds.push(itemId);
            }
        }

        const uniqueRetryableIds = [...new Set(retryableIds)];
        const uniqueStaleIds = [...new Set(staleIds)];
        const failureKeyPrefix = `batch.${batchId}.fail.`;
        const workerFailedIds = failureKeys
            .map(key => String(key).slice(failureKeyPrefix.length))
            .filter(Boolean);
        const failedIds = [
            ...new Set([...workerFailedIds, ...uniqueRetryableIds, ...uniqueStaleIds]),
        ];
        const complete = uniqueRetryableIds.length === 0;

        if (complete) {
            // Keep a short completion fence after releasing the lease. A
            // cancel action may have passed its owner check just before this
            // cleanup; it must still lose once durable writes are complete.
            await connection.set(`batch.${batchId}.persist.completed`, '1', 'EX', TTL_BATCH);
            await connection.del(
                `batch.${batchId}.total`,
                `batch.${batchId}.done`,
                `batch.${batchId}.failed`,
                `batch.${batchId}.cancel`,
                `batch.${batchId}.userId`
            );
            if (failureKeys.length) await connection.del(...failureKeys);
            if (terminalKeys.length) await connection.del(...terminalKeys);
        }

        return {
            updated: updatedIds.length,
            updatedIds,
            failedIds,
            staleIds: uniqueStaleIds,
            retryableIds: uniqueRetryableIds,
            complete,
        };
    } finally {
        await releasePersistLock(connection, lockKey, lockToken).catch(() => {});
    }
}

export async function startBatchPreTranslateAction(
    itemIds: string[],
    opts: { sourceLanguage?: string; targetLanguage?: string }
) {
    'use server';
    const authCtx = await requireUser();
    if (!Array.isArray(itemIds) || itemIds.length === 0) return { batchId: undefined, total: 0 };

    const uniqueItemIds = [...new Set(itemIds.map(String).filter(Boolean))];
    const rows = await Promise.all(
        uniqueItemIds.map(id => requireWritableDocumentItem(id, authCtx))
    );
    const items = rows.filter(
        item =>
            isBatchPreTranslateEligibleStatus((item as any).status) &&
            String((item as any).sourceText || '').trim().length > 0
    );
    const total = items.length;
    if (!total) return { batchId: undefined, total: 0 };

    // Freeze the authenticated user's current workflow prompts before jobs are
    // visible to workers. A later settings edit should affect only later jobs.
    const promptSnapshot = await resolveBatchPreTranslatePromptSnapshot(authCtx);

    const { getQueue, defaultJobOpts } = await import('@/worker/queue');
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const batchId = createBatchPreTranslateId();
    const batchKeys = {
        total: `batch.${batchId}.total`,
        done: `batch.${batchId}.done`,
        failed: `batch.${batchId}.failed`,
        cancel: `batch.${batchId}.cancel`,
        userId: `batch.${batchId}.userId`,
    };

    try {
        await Promise.all([
            connection.set(batchKeys.total, String(total), 'EX', TTL_BATCH),
            connection.set(batchKeys.done, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.failed, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.cancel, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.userId, authCtx.userId, 'EX', TTL_BATCH),
        ]);
        const queue = getQueue('pretranslate');
        await queue.addBulk(
            items.map(item => {
                const sourceText = String((item as any).sourceText || '');
                return {
                    name: item.id,
                    data: {
                        batchId,
                        id: item.id,
                        text: sourceText,
                        sourceText,
                        targetText: (item as any).targetText ?? null,
                        sourceRevision: sourceRevision(sourceText),
                        sourceLanguage: opts.sourceLanguage,
                        targetLanguage: opts.targetLanguage,
                        userId: authCtx.userId,
                        tenantId: authCtx.tenantId || undefined,
                        termExtractPrompt: promptSnapshot.termExtractPrompt,
                        termEmbedPrompt: promptSnapshot.termEmbedPrompt,
                    },
                    opts: defaultJobOpts,
                };
            })
        );
    } catch (error) {
        await connection.del(...Object.values(batchKeys)).catch(() => {});
        throw error;
    }
    return { batchId, total };
}

export async function getBatchPreTranslateProgressAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`batch.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`batch.${batchId}.failed`)) || 0;
    const percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;
    const canceled = (await connection.get(`batch.${batchId}.cancel`)) === '1';
    return {
        total,
        done,
        failed,
        percent,
        terminal: isBatchPreTranslateTerminal(total, done, failed),
        canceled,
    };
}

export async function cancelBatchPreTranslateAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    return requestAuthorizedBatchPreTranslateCancel(batchId, connection);
}

export async function persistBatchPreTranslateResultsAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const authCtx = await requireBatchOwner(connection, batchId);
    return persistBatchPreTranslateResultsWithDeps(batchId, {
        connection,
        authCtx,
        requireWritableDocumentItem: requireWritableDocumentItem as any,
        persistItemAtomically: persistBatchPreTranslateItemAtomically,
    });
}
