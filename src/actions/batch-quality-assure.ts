import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/guards';
import { GuardError, requireWritableDocumentItem, requireUser } from '@/lib/guards';
import { TTL_BATCH } from '@/lib/redis-ttl';
import { sourceRevision } from '@/lib/source-revision';
import { normalizeSyntaxQualityResult } from '@/lib/syntax-quality';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// 延迟导入队列相关，避免在客户端构建时解析到 Node-only 依赖

const BATCH_QA_ELIGIBLE_STATUSES = new Set(['MT', 'MT_REVIEW']);
const PERSIST_LOCK_TTL_SECONDS = Math.max(60, TTL_BATCH);

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
    loadWritableItem: (id: string, authCtx: AuthContext) => Promise<BatchQACurrentItem>;
    persistItemAtomically: (
        data: BatchQAResult,
        currentItem: BatchQACurrentItem,
        authCtx: AuthContext
    ) => Promise<boolean>;
    lockToken?: string;
};

export function isBatchQAEligibleStatus(status: unknown): boolean {
    return BATCH_QA_ELIGIBLE_STATUSES.has(String(status || ''));
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
            status: { in: ['MT', 'MT_REVIEW'] },
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

/**
 * Persists completed batch results while preserving transient failures for a retry.
 * Exported with injected dependencies so terminal, stale and cleanup semantics can
 * be covered without Redis or a database.
 * @internal
 */
export async function persistBatchQAResultsWithDeps(batchId: string, deps: PersistBatchQADeps) {
    const { connection, authCtx, loadWritableItem, persistItemAtomically } = deps;
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`qa.${batchId}.failed`)) || 0;
    if (!isBatchQATerminal(total, done, failed)) {
        throw new GuardError(409, '批量质检尚未结束，暂不能保存结果');
    }

    const lockKey = `qa.${batchId}.persist.lock`;
    const lockToken = deps.lockToken || randomUUID();
    const acquired = await connection.set(lockKey, lockToken, 'EX', PERSIST_LOCK_TTL_SECONDS, 'NX');
    if (acquired !== 'OK') throw new GuardError(409, '批量质检结果正在保存，请稍后重试');

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
                currentItem = await loadWritableItem(itemId, authCtx);
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
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`qa.${batchId}.failed`)) || 0;
    const percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;
    return { total, done, failed, percent };
}

export async function cancelBatchQAAction(batchId: string) {
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await requireBatchOwner(connection, batchId);
    await connection.set(`qa.${batchId}.cancel`, '1', 'EX', TTL_BATCH);
    return { ok: true };
}

// 在批处理完成后，将 Redis 中的 QA 结果一次性落库；瞬时失败保留供重试。
export async function persistBatchQAResultsAction(batchId: string) {
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const authCtx = await requireBatchOwner(connection, batchId);
    return persistBatchQAResultsWithDeps(batchId, {
        connection,
        authCtx,
        loadWritableItem: requireWritableDocumentItem as any,
        persistItemAtomically: persistBatchQAItemAtomically,
    });
}
