import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/guards';
import { GuardError, requireWritableDocumentItem, requireUser } from '@/lib/guards';
import { isBatchQAReviewReady } from '@/lib/batch-qa-stage-eligibility';
import { requestBatchQACancelWithRedis } from '@/lib/batch-qa-cancellation';
import { TTL_BATCH } from '@/lib/redis-ttl';
import { sourceRevision } from '@/lib/source-revision';
import { normalizeSyntaxQualityResult } from '@/lib/syntax-quality';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// 延迟导入队列相关，避免在客户端构建时解析到 Node-only 依赖

const PERSIST_LOCK_TTL_SECONDS = Math.max(60, TTL_BATCH);
const BATCH_QA_CANCELED_MESSAGE = '批量质检已取消，结果不会保存';

// Cancel and persist must have one linearized winner. If cancellation wins,
// no persist call can acquire the lock; if persistence wins, cancellation is
// explicitly rejected instead of claiming a result was discarded.
const ACQUIRE_BATCH_QA_PERSIST_LOCK_SCRIPT = `
    -- batch-qa-acquire-persist-lock
    if redis.call('get', KEYS[1]) == '1' then
        return 'CANCELED'
    end
    if redis.call('set', KEYS[2], ARGV[1], 'EX', ARGV[2], 'NX') then
        return 'ACQUIRED'
    end
    return 'LOCKED'
`;

type BatchQAResult = {
    id: string;
    qualityAssureBiTerm?: any;
    qualityAssureSyntax?: any;
    qualityAssureSyntaxEmbedded?: any;
};

type BatchQACurrentItem = {
    id: string;
    sourceText: string | null;
    targetText: string | null;
    status?: string | null;
};

type PersistBatchQADeps = {
    connection: any;
    authCtx: AuthContext;
    requireWritableDocumentItem: (id: string, authCtx: AuthContext) => Promise<BatchQACurrentItem>;
    persistItemAtomically: (
        data: BatchQAResult,
        currentItem: BatchQACurrentItem,
        authCtx: AuthContext
    ) => Promise<boolean>;
    lockToken?: string;
};

export type BatchQAPromptSnapshot = {
    syntaxEvaluatePrompt?: string;
};

type ResolveBatchQAPrompt = (
    authCtx: AuthContext,
    nodeKey: 'syntax-evaluate'
) => Promise<string | undefined>;

/**
 * Batch work is asynchronous, so take a user-owned prompt snapshot at enqueue
 * time instead of letting a worker observe a later prompt configuration.
 */
export async function resolveBatchQAPromptSnapshot(
    authCtx: AuthContext,
    resolvePrompt: ResolveBatchQAPrompt = resolveWorkflowPrompt
): Promise<BatchQAPromptSnapshot> {
    return { syntaxEvaluatePrompt: await resolvePrompt(authCtx, 'syntax-evaluate') };
}

export function isBatchQAEligibleStatus(status: unknown): boolean {
    return isBatchQAReviewReady(status);
}

export function isBatchQATerminal(total: number, done: number, failed: number): boolean {
    return total > 0 && done >= 0 && failed >= 0 && done + failed === total;
}

export function createBatchQAId(now = Date.now(), suffix: string = randomUUID()): string {
    return `qa.${now}.${suffix}`;
}

export function getBatchQAStaleReason(
    data: BatchQAResult,
    currentItem: BatchQACurrentItem
): string | undefined {
    if (!isBatchQAEligibleStatus(currentItem.status)) return 'STATUS_CHANGED';
    const syntax = normalizeSyntaxQualityResult(data.qualityAssureSyntax);
    if (syntax.status !== 'complete' || syntax.legacy) return 'INVALID_QA_RESULT';
    const evaluation = syntax.evaluation;
    if (!evaluation) return 'INVALID_QA_RESULT';
    if (evaluation.sourceRevision !== sourceRevision(currentItem.sourceText)) {
        return 'SOURCE_CHANGED';
    }
    if (evaluation.targetRevision !== sourceRevision(currentItem.targetText)) {
        return 'TARGET_CHANGED';
    }
    return undefined;
}

async function requireBatchOwner(connection: any, batchId: string) {
    const authCtx = await requireUser();
    const ownerId = await connection.get(`qa.${batchId}.userId`);
    if (!ownerId || ownerId !== authCtx.userId) throw new GuardError(401, '未授权');
    return authCtx;
}

async function persistBatchQAItemAtomically(
    data: BatchQAResult,
    currentItem: BatchQACurrentItem,
    authCtx: AuthContext
): Promise<boolean> {
    const result = await prisma.documentItem.updateMany({
        where: {
            id: data.id,
            status: 'MT_REVIEW',
            sourceText: currentItem.sourceText || '',
            targetText: currentItem.targetText ?? null,
            document: { project: { userId: authCtx.userId } },
        },
        data: {
            qualityAssureBiTerm: data.qualityAssureBiTerm as any,
            qualityAssureSyntax: data.qualityAssureSyntax as any,
            qualityAssureSyntaxEmbedded:
                data.qualityAssureSyntaxEmbedded == null
                    ? (Prisma.DbNull as any)
                    : (data.qualityAssureSyntaxEmbedded as any),
            status: 'QA_REVIEW',
        },
    });
    return result.count === 1;
}

async function releasePersistLock(connection: any, lockKey: string, lockToken: string) {
    await connection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken
    );
}

async function acquireBatchQAPersistLock(
    connection: any,
    batchId: string,
    lockToken: string
): Promise<'acquired' | 'canceled' | 'locked'> {
    const outcome = String(
        await connection.eval(
            ACQUIRE_BATCH_QA_PERSIST_LOCK_SCRIPT,
            2,
            `qa.${batchId}.cancel`,
            `qa.${batchId}.persist.lock`,
            lockToken,
            String(PERSIST_LOCK_TTL_SECONDS)
        )
    ).toUpperCase();

    if (outcome === 'CANCELED') return 'canceled';
    if (outcome === 'ACQUIRED') return 'acquired';
    return 'locked';
}

/**
 * The cancel action authorizes ownership before entering the same Redis
 * serialization point used by persistence. A persist lease is a deliberate
 * conflict: the client must not report cancellation after durable writes have
 * begun.
 */
async function requestAuthorizedBatchQACancel(batchId: string, connection: any) {
    const result = await requestBatchQACancelWithRedis(batchId, connection, TTL_BATCH);
    if (!result.canceled) {
        throw new GuardError(409, '批量质检结果正在保存，无法取消');
    }
    return { ok: true, canceled: true } as const;
}

/**
 * Persists completed batch results while preserving transient failures for a retry.
 * Exported with injected dependencies so terminal, stale and cleanup semantics can
 * be covered without Redis or a database.
 * @internal
 */
export async function persistBatchQAResultsWithDeps(batchId: string, deps: PersistBatchQADeps) {
    const { connection, authCtx, requireWritableDocumentItem, persistItemAtomically } = deps;
    if ((await connection.get(`qa.${batchId}.cancel`)) === '1') {
        throw new GuardError(409, BATCH_QA_CANCELED_MESSAGE);
    }
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`qa.${batchId}.failed`)) || 0;
    if ((await connection.get(`qa.${batchId}.cancel`)) === '1') {
        throw new GuardError(409, BATCH_QA_CANCELED_MESSAGE);
    }
    if (!isBatchQATerminal(total, done, failed)) {
        throw new GuardError(409, '批量质检尚未结束，暂不能保存结果');
    }

    const lockKey = `qa.${batchId}.persist.lock`;
    const lockToken = deps.lockToken || randomUUID();
    const lockState = await acquireBatchQAPersistLock(connection, batchId, lockToken);
    if (lockState === 'canceled') throw new GuardError(409, BATCH_QA_CANCELED_MESSAGE);
    if (lockState !== 'acquired') {
        throw new GuardError(409, '批量质检结果正在保存，请稍后重试');
    }

    try {
        const keys = await connection.keys(`qa.${batchId}.item.*`);
        const failureKeys: string[] = await connection.keys(`qa.${batchId}.fail.*`);
        const terminalKeys = await connection.keys(`qa.${batchId}.terminal.*`);
        const updatedIds: string[] = [];
        const staleIds: string[] = [];
        const retryableIds: string[] = [];

        for (const key of keys) {
            let data: BatchQAResult;
            try {
                const raw = await connection.get(key);
                data = raw ? (JSON.parse(raw) as BatchQAResult) : ({ id: '' } as BatchQAResult);
            } catch {
                // A malformed cached result can never succeed on retry.
                await connection.del(key);
                continue;
            }

            const itemId = String(data?.id || '');
            if (!itemId) {
                await connection.del(key);
                continue;
            }
            data.id = itemId;

            let currentItem: BatchQACurrentItem;
            try {
                currentItem = await requireWritableDocumentItem(itemId, authCtx);
            } catch {
                retryableIds.push(itemId);
                continue;
            }

            const staleReason = getBatchQAStaleReason(data, currentItem);
            if (staleReason) {
                staleIds.push(itemId);
                await connection.del(key);
                continue;
            }

            try {
                const persisted = await persistItemAtomically(data, currentItem, authCtx);
                if (!persisted) {
                    // Status or text changed between validation and the conditional update.
                    staleIds.push(itemId);
                    await connection.del(key);
                    continue;
                }
                updatedIds.push(itemId);
                await connection.del(key);
            } catch {
                // Keep the result and batch owner/counters so this item can be retried.
                retryableIds.push(itemId);
            }
        }

        const uniqueRetryableIds = [...new Set(retryableIds)];
        const uniqueStaleIds = [...new Set(staleIds)];
        const failureKeyPrefix = `qa.${batchId}.fail.`;
        const workerFailedIds = failureKeys
            .map(key => String(key).slice(failureKeyPrefix.length))
            .filter(Boolean);
        const failedIds = [
            ...new Set([...workerFailedIds, ...uniqueRetryableIds, ...uniqueStaleIds]),
        ];
        const complete = uniqueRetryableIds.length === 0;

        if (complete) {
            await connection.del(
                `qa.${batchId}.total`,
                `qa.${batchId}.done`,
                `qa.${batchId}.failed`,
                `qa.${batchId}.cancel`,
                `qa.${batchId}.userId`
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

export async function startBatchQAAction(
    itemIds: string[],
    opts: { targetLanguage?: string; domain?: string }
) {
    'use server';
    const authCtx = await requireUser();
    if (!Array.isArray(itemIds) || !itemIds.length) return { batchId: undefined, total: 0 };

    const uniqueItemIds = [...new Set(itemIds.map(String).filter(Boolean))];
    const rows = await Promise.all(
        uniqueItemIds.map(id => requireWritableDocumentItem(id, authCtx))
    );
    const items = rows.filter(
        item =>
            isBatchQAEligibleStatus((item as any).status) &&
            String((item as any).sourceText || '').trim().length > 0 &&
            String((item as any).targetText || '').trim().length > 0
    );
    const total = items.length;
    if (!total) return { batchId: undefined, total: 0 };

    const promptSnapshot = await resolveBatchQAPromptSnapshot(authCtx);

    const { getQueue, defaultJobOpts } = await import('@/worker/queue');
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const batchId = createBatchQAId();
    const batchKeys = {
        total: `qa.${batchId}.total`,
        done: `qa.${batchId}.done`,
        failed: `qa.${batchId}.failed`,
        cancel: `qa.${batchId}.cancel`,
        userId: `qa.${batchId}.userId`,
    };

    try {
        await Promise.all([
            connection.set(batchKeys.total, String(total), 'EX', TTL_BATCH),
            connection.set(batchKeys.done, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.failed, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.cancel, '0', 'EX', TTL_BATCH),
            connection.set(batchKeys.userId, authCtx.userId, 'EX', TTL_BATCH),
        ]);
        const queue = getQueue('qa');
        await queue.addBulk(
            items.map(item => ({
                name: item.id,
                data: {
                    batchId,
                    id: item.id,
                    sourceText: item.sourceText || '',
                    targetText: item.targetText || '',
                    targetLanguage: opts.targetLanguage,
                    domain: opts.domain,
                    userId: authCtx.userId,
                    tenantId: authCtx.tenantId || undefined,
                    syntaxEvaluatePrompt: promptSnapshot.syntaxEvaluatePrompt,
                },
                opts: defaultJobOpts,
            }))
        );
    } catch (error) {
        await connection.del(...Object.values(batchKeys)).catch(() => {});
        throw error;
    }
    return { batchId, total };
}

export async function getBatchQAProgressAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`qa.${batchId}.failed`)) || 0;
    const percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;
    const canceled = (await connection.get(`qa.${batchId}.cancel`)) === '1';
    return {
        total,
        done,
        failed,
        percent,
        terminal: isBatchQATerminal(total, done, failed),
        canceled,
    };
}

export async function cancelBatchQAAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    return requestAuthorizedBatchQACancel(batchId, connection);
}

// 在批处理完成后，将 Redis 中的 QA 结果一次性落库；瞬时失败保留供重试。
export async function persistBatchQAResultsAction(batchId: string) {
    'use server';
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const authCtx = await requireBatchOwner(connection, batchId);
    return persistBatchQAResultsWithDeps(batchId, {
        connection,
        authCtx,
        requireWritableDocumentItem: requireWritableDocumentItem as any,
        persistItemAtomically: persistBatchQAItemAtomically,
    });
}
