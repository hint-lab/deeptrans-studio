'use server';

import { findDocumentItemsLiteByIdsDB } from '@/db/documentItem';
import { auth } from '@/auth';
// 延迟导入队列相关，避免在客户端构建时解析到 Node-only 依赖

export async function startBatchPreTranslateAction(itemIds: string[], opts: { sourceLanguage?: string; targetLanguage?: string }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!Array.isArray(itemIds) || itemIds.length === 0) return { success: 0, failed: 0 } as any;

  const { getQueue, defaultJobOpts } = await import('@/worker/queue');
  const { getRedis } = await import('@/lib/redis');
  const connection = await getRedis();

  const rows = await findDocumentItemsLiteByIdsDB(itemIds);
  const items = rows.map(r => ({ id: r.id, text: r.sourceText || '', documentId: r.documentId }))
    .filter(x => (x.text || '').trim().length > 0);

  const total = items.length;
  if (!total) return { success: 0, failed: itemIds.length } as any;

  // 初始化进度缓存（常驻 Worker 在独立进程中启动）
  const batchId = `bt.${Date.now()}`;
  await connection.set(`batch.${batchId}.total`, String(total));
  await connection.set(`batch.${batchId}.done`, '0');
  await connection.set(`batch.${batchId}.failed`, '0');
  await connection.set(`batch.${batchId}.cancel`, '0');

  // 使用 BullMQ 入队
  const queue = getQueue('pretranslate');
  await queue.addBulk(items.map((it) => ({ name: it.id, data: { batchId, id: it.id, text: it.text, sourceLanguage: opts.sourceLanguage, targetLanguage: opts.targetLanguage, userId }, opts: defaultJobOpts })));
  return { batchId, total };
}

export async function getBatchPreTranslateProgressAction(batchId: string) {
  const { getRedis } = await import('@/lib/redis');
  const connection = await getRedis();
  const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
  const done = Number(await connection.get(`batch.${batchId}.done`)) || 0;
  const failed = Number(await connection.get(`batch.${batchId}.failed`)) || 0;
  const percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;
  return { total, done, failed, percent };
}

export async function cancelBatchPreTranslateAction(batchId: string) {
  const { getRedis } = await import('@/lib/redis');
  const connection = await getRedis();
  await connection.set(`batch.${batchId}.cancel`, '1');
  return { ok: true };
}

// 在批处理完成后，将 Redis 中的结果一次性落库，并清理缓存
export async function persistBatchPreTranslateResultsAction(batchId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('未授权');
  const { getRedis } = await import('@/lib/redis');
  const connection = await getRedis();
  const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
  if (!total) return { updated: 0 };

  const keys = await connection.keys(`batch.${batchId}.item.*`);
  let updated = 0;
  for (const key of keys) {
    try {
      const raw = await connection.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as { id: string; translation: string; terms?: any; dict?: any };
      if (!data?.id) continue;
      const { updateDocumentItemByIdDB } = await import('@/db/documentItem');
      await updateDocumentItemByIdDB(data.id, { 
        targetText: data.translation as any, 
        preTranslateTerms: data.terms as any,
        preTranslateDict: data.dict as any,
        preTranslateEmbedded: data.translation as any,
        status: 'MT' as any, 
      } as any);
      updated += 1;
    } catch {}
  }
  // 清理缓存键
  await connection.del(`batch.${batchId}.total`, `batch.${batchId}.done`, `batch.${batchId}.failed`, `batch.${batchId}.cancel`);
  if (keys.length) await connection.del(...keys);
  return { updated };
}


