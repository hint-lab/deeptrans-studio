import { findDocumentItemsLiteByIdsDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { auth } from '@/auth';
// 延迟导入队列相关，避免在客户端构建时解析到 Node-only 依赖

export async function startBatchQAAction(
    itemIds: string[],
    opts: { targetLanguage?: string; domain?: string; tenantId?: string }
) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('未授权');
    if (!Array.isArray(itemIds) || !itemIds.length) return { batchId: undefined, total: 0 };

    const { getQueue, defaultJobOpts } = await import('@/worker/queue');
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();

    const rows = await findDocumentItemsLiteByIdsDB(itemIds);
    const items = rows.filter(
        r =>
            (r.sourceText || '').trim().length > 0 ||
            ((r as any).targetText || '').trim().length > 0
    ) as Array<{ id: string; sourceText: string | null; targetText: string | null }>;
    const total = items.length;
    if (!total) return { batchId: undefined, total: 0 };

    // 常驻 Worker 在独立进程中启动
    const batchId = `qa.${Date.now()}`;
    await connection.set(`qa.${batchId}.total`, String(total));
    await connection.set(`qa.${batchId}.done`, '0');
    await connection.set(`qa.${batchId}.failed`, '0');
    await connection.set(`qa.${batchId}.cancel`, '0');
    const queue = getQueue('qa');
    await queue.addBulk(
        items.map(it => ({
            name: it.id,
            data: {
                batchId,
                id: it.id,
                sourceText: it.sourceText || '',
                targetText: it.targetText || '',
                targetLanguage: opts.targetLanguage,
                domain: opts.domain,
                tenantId: opts.tenantId,
            },
            opts: defaultJobOpts,
        }))
    );
    return { batchId, total };
}

export async function getBatchQAProgressAction(batchId: string) {
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
    const failed = Number(await connection.get(`qa.${batchId}.failed`)) || 0;
    const percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;
    return { total, done, failed, percent };
}

export async function cancelBatchQAAction(batchId: string) {
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    await connection.set(`qa.${batchId}.cancel`, '1');
    return { ok: true };
}

// 在批处理完成后，将 Redis 中的 QA 结果一次性落库，并清理缓存
export async function persistBatchQAResultsAction(batchId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('未授权');
    const { getRedis } = await import('@/lib/redis');
    const connection = await getRedis();
    const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
    if (!total) return { updated: 0 };

    const keys = await connection.keys(`qa.${batchId}.item.*`);
    let updated = 0;
    for (const key of keys) {
        try {
            const raw = await connection.get(key);
            if (!raw) continue;
            const data = JSON.parse(raw) as {
                id: string;
                qualityAssureBiTerm?: any;
                qualityAssureSyntax?: any;
                qualityAssureSyntaxEmbedded?: any;
            };
            if (!data?.id) continue;
            await updateDocumentItemByIdDB(data.id, {
                qualityAssureBiTerm: data.qualityAssureBiTerm as any,
                qualityAssureSyntax: data.qualityAssureSyntax as any,
                qualityAssureSyntaxEmbedded: data.qualityAssureSyntaxEmbedded as any,
                status: 'QA' as any,
            } as any);
            updated += 1;
        } catch {}
    }
    await connection.del(
        `qa.${batchId}.total`,
        `qa.${batchId}.done`,
        `qa.${batchId}.failed`,
        `qa.${batchId}.cancel`
    );
    if (keys.length) await connection.del(...keys);
    return { updated };
}
