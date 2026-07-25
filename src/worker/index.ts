// Dev 环境按需加载 dotenv（使用动态 import，无顶层 await）
if (process.env.NODE_ENV !== 'production') {
    import('dotenv')
        .then((dotenv: any) => {
            dotenv?.config?.();
        })
        .catch(() => {});
}
import { Prisma } from '@prisma/client';
import { fetchDocumentItemNeedsMtReviewByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { DOCUMENT_TERMS_RUN_ERROR } from '@/lib/document-term-job';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH, setJSONWithTTL, setTextWithTTL } from '@/lib/redis-ttl';
import { getStorageService } from '@/lib/storage/service';
import { canWriteDocumentItemForOwner } from '@/server/document-item-access';
import { embedBatchForOwner } from '@/server/embedding';
import { runPreTranslateForOwner } from '@/server/pre-translate';
import { extractDocumentTermsForOwner } from '@/server/project-init';
import { runQualityAssureForOwner } from '@/server/quality-assure';
import { assertEmbeddingBatch } from '../lib/embedding-contract';
import { upsertVectors } from '../lib/vector/postgres';
import { createWorker, getQueueConnection } from './queue';
const logger = createLogger(
    {
        type: 'worker',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

const connection = getQueueConnection();

async function markQABatchItemTerminal(
    batchId: string,
    itemId: string,
    outcome: 'done' | 'failed'
): Promise<{ marked: boolean; count: number }> {
    const result = (await connection.eval(
        `
        local inserted = redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
        if inserted then
            local count = redis.call('incr', KEYS[2])
            return {1, count}
        end
        return {0, tonumber(redis.call('get', KEYS[2]) or '0')}
        `,
        2,
        `qa.${batchId}.terminal.${itemId}`,
        `qa.${batchId}.${outcome}`,
        outcome,
        String(TTL_BATCH)
    )) as [number | string, number | string];
    return { marked: Number(result?.[0]) === 1, count: Number(result?.[1] || 0) };
}

async function assertJobCanWriteItem(jobData: any) {
    const itemId = String(jobData?.id || '');
    const userId = String(jobData?.userId || '');
    if (!itemId || !userId) throw new Error('MISSING_JOB_ITEM_OWNER');
    const allowed = await canWriteDocumentItemForOwner(itemId, { userId });
    if (!allowed) throw new Error('UNAUTHORIZED_JOB_ITEM');
    return itemId;
}

// Pre-translate worker
const preWorker = createWorker(
    'pretranslate',
    async job => {
        const { id, text, sourceLanguage, targetLanguage, userId, tenantId, batchId } =
            job.data as any;
        const cancel = await connection.get(`batch.${batchId}.cancel`);
        if (cancel === '1') throw new Error('JOB_CANCELED');
        const res = await runPreTranslateForOwner(text, sourceLanguage, targetLanguage, {
            userId,
            tenantId,
        });
        const translation = res?.translation || '';
        const terms = res?.terms || [];
        const dict = res?.dict || [];
        await setJSONWithTTL(
            connection,
            `batch.${batchId}.item.${id}`,
            { id, translation, terms, dict },
            TTL_BATCH
        );
        await connection.incr(`batch.${batchId}.done`);
        const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
        const done = Number(await connection.get(`batch.${batchId}.done`)) || 0;
        const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        await job.updateProgress(percent);
        logger.info(`[pre] job=${job.id} finished pre-translate pipeline`);
    },
    24
);

preWorker.on('active', job => {
    logger.info(`[pre] active job=${job.id} name=${job.name}`);
});
preWorker.on('progress', (job, progress) => {
    logger.info(`[pre] progress job=${job.id} progress=${progress}`);
});
preWorker.on('completed', async job => {
    logger.info(`[pre] completed job=${job.id}`);
    // 自动推进：PRE_TRANSLATE -> (needsMtReview ? MT_REVIEW : QA)
    try {
        const itemId = (job?.data as any)?.id;
        if (!itemId) return;
        await assertJobCanWriteItem(job?.data);
        const needs = await fetchDocumentItemNeedsMtReviewByIdDB(itemId);
        const next = needs ? 'MT_REVIEW' : 'QA';
        await updateDocumentItemByIdDB(itemId, { status: next as any } as any);
    } catch {}
});
preWorker.on('failed', async (job, err) => {
    logger.error(`[pre] failed job=${job?.id} error=${err?.message || err}`);
    try {
        const batchId = (job?.data as any)?.batchId;
        if (batchId) {
            await connection.incr(`batch:${batchId}:failed`).catch(() => {});
            await connection
                .set(`batch:${batchId}:fail:${job?.id}`, String(err?.message || err))
                .catch(() => {});
        }
        // 标记段状态：ERROR 或 CANCELED
        try {
            const itemId = (job?.data as any)?.id;
            if (itemId) {
                await assertJobCanWriteItem(job?.data);
                await updateDocumentItemByIdDB(itemId, {
                    status: (err?.message === 'JOB_CANCELED' ? 'CANCELED' : 'ERROR') as any,
                } as any);
            }
        } catch {}
    } catch {}
});
preWorker.on('error', err => {
    logger.error(`[pre] worker error: ${err?.message || err}`);
});

// QA worker
const qaWorker = createWorker(
    'qa',
    async job => {
        const { id, sourceText, targetText, targetLanguage, domain, tenantId, userId, batchId } =
            job.data as any;
        const cancel = await connection.get(`qa.${batchId}.cancel`);
        if (cancel === '1') {
            job.discard();
            throw new Error('JOB_CANCELED');
        }
        const res = await runQualityAssureForOwner(
            sourceText,
            targetText,
            { userId, tenantId },
            { targetLanguage, domain }
        );
        await setJSONWithTTL(
            connection,
            `qa.${batchId}.item.${id}`,
            {
                id,
                qualityAssureBiTerm: res?.biTerm ?? undefined,
                qualityAssureSyntax: res?.syntax ?? undefined,
                qualityAssureSyntaxEmbedded: null,
            },
            TTL_BATCH
        );
        const terminal = await markQABatchItemTerminal(batchId, id, 'done');
        const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
        const done = terminal.count;
        const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        await job.updateProgress(percent);
        logger.info(`[qa] job=${job.id} QA pipeline complete`);
    },
    16
);

qaWorker.on('active', job => {
    logger.info(`[qa] active job=${job.id} name=${job.name}`);
});
qaWorker.on('progress', (job, progress) => {
    logger.info(`[qa] progress job=${job.id} progress=${progress}`);
});
qaWorker.on('completed', job => {
    logger.info(`[qa] completed job=${job.id}`);
});
qaWorker.on('failed', async (job, err) => {
    logger.error(`[qa] failed job=${job?.id} error=${err?.message || err}`);
    try {
        const batchId = (job?.data as any)?.batchId;
        const attempts = Math.max(1, Number(job?.opts?.attempts || 1));
        const isFinalFailure =
            (err as Error)?.message === 'JOB_CANCELED' ||
            Number(job?.attemptsMade || 0) >= attempts;
        const itemId = String((job?.data as any)?.id || job?.id || '');
        if (batchId && itemId && isFinalFailure) {
            const terminal = await markQABatchItemTerminal(batchId, itemId, 'failed').catch(
                () => undefined
            );
            if (terminal?.marked) {
                await connection
                    .set(
                        `qa.${batchId}.fail.${itemId}`,
                        String((err as Error)?.message || err),
                        'EX',
                        TTL_BATCH
                    )
                    .catch(() => {});
            }
        }
    } catch {}
});
qaWorker.on('error', err => {
    logger.error(`[qa] worker error: ${err?.message || err}`);
});

// Document terms worker
const docTermsWorker = createWorker(
    'doc-terms',
    async job => {
        const { id, text, prompt, batchId, maxTerms, chunkSize, overlap, userId, tenantId } =
            job.data as any;
        const cancel = batchId ? await connection.get(`docTerms.${batchId}.cancel`) : null;
        if (cancel === '1') throw new Error('JOB_CANCELED');
        const terms = await extractDocumentTermsForOwner(
            text,
            { userId, tenantId },
            {
                prompt,
                maxTerms,
                chunkSize,
                overlap,
            }
        );
        // 术语结果仅返回给上层，由服务层决定是否/如何持久化与应用范围
        if (batchId) {
            await setJSONWithTTL(
                connection,
                `docTerms.${batchId}.item.${id}`,
                { id, terms },
                TTL_BATCH
            );
            await setTextWithTTL(connection, `docTerms.${batchId}.total`, '1', TTL_BATCH);
            await setTextWithTTL(connection, `docTerms.${batchId}.done`, '1', TTL_BATCH);
            const total = Number(await connection.get(`docTerms.${batchId}.total`)) || 0;
            const done = Number(await connection.get(`docTerms.${batchId}.done`)) || 0;
            const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
            await job.updateProgress(percent);
        } else {
            await job.updateProgress(100);
        }
        logger.info(
            `[doc-terms] job=${job.id} extracted ${Array.isArray(terms) ? terms.length : 0} terms`
        );
    },
    12
);

docTermsWorker.on('active', job => {
    logger.info(`[doc-terms] active job=${job.id} name=${job.name}`);
});
docTermsWorker.on('progress', (job, progress) => {
    logger.info(`[doc-terms] progress job=${job.id} progress=${progress}`);
});
docTermsWorker.on('completed', async job => {
    logger.info(`[doc-terms] completed job=${job.id}`);
    const batchId = (job?.data as any)?.batchId;
    if (batchId) {
        await connection
            .del(`docTerms.${batchId}.failed`, `docTerms.${batchId}.error`)
            .catch(() => {});
    }
    const termsLockKey = String((job?.data as any)?.termsLockKey || '');
    const termsLockValue = String((job?.data as any)?.termsLockValue || '');
    await releaseOwnedRedisLock(connection, termsLockKey, termsLockValue).catch(() => {});
});
docTermsWorker.on('failed', async (job, err) => {
    logger.error(`[doc-terms] failed job=${job?.id} error=${err?.message || err}`);
    const termsLockKey = String((job?.data as any)?.termsLockKey || '');
    const termsLockValue = String((job?.data as any)?.termsLockValue || '');
    await releaseOwnedRedisLock(connection, termsLockKey, termsLockValue).catch(() => {});
    try {
        const batchId = (job?.data as any)?.batchId;
        if (batchId) {
            await setTextWithTTL(
                connection,
                `docTerms.${batchId}.error`,
                DOCUMENT_TERMS_RUN_ERROR,
                TTL_BATCH
            );
            await connection.set(`docTerms.${batchId}.failed`, '1', 'EX', TTL_BATCH);
        }
    } catch (statusError: any) {
        logger.error(
            `[doc-terms] failed to persist failure state job=${job?.id} error=${statusError?.message || statusError}`
        );
    }
});
docTermsWorker.on('error', err => {
    logger.error(`[doc-terms] worker error: ${err?.message || err}`);
});

connection.on('error', (err: any) => {
    logger.error(`[redis] error: ${err?.message || err}`);
});

process.on('unhandledRejection', (reason: any) => {
    logger.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err: any) => {
    logger.error('[process] uncaughtException:', err);
});
process.on('SIGINT', async () => {
    logger.info('[worker] SIGINT received, shutting down...');
    try {
        await preWorker.close();
    } catch {}
    try {
        await qaWorker.close();
    } catch {}
    try {
        await docTermsWorker.close();
    } catch {}
    try {
        await memoryImportWorker.close();
    } catch {}
    try {
        await memoryVectorBackfillWorker.close();
    } catch {}
    try {
        await connection.quit();
    } catch {}
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger.info('[worker] SIGTERM received, shutting down...');
    try {
        await preWorker.close();
    } catch {}
    try {
        await qaWorker.close();
    } catch {}
    try {
        await docTermsWorker.close();
    } catch {}
    try {
        await memoryImportWorker.close();
    } catch {}
    try {
        await memoryVectorBackfillWorker.close();
    } catch {}
    try {
        await connection.quit();
    } catch {}
    process.exit(0);
});

logger.info('[worker] Pretranslate, DocTerms & QA workers started');

// Memory-import worker
type MemoryImportJobData = {
    fileKey: string;
    fileType?: string;
    memoryId: string;
    sourceLang?: string;
    targetLang?: string;
    tenantId?: string | null;
    userId: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
};

type MemoryImportResult = {
    total: number;
    indexed: number;
    memoryId: string;
};

type MemoryImportProgress = {
    stage: 'parsing' | 'embedding' | 'vector' | 'complete';
    currentBatch: number;
    totalBatches: number;
    progress: number;
};

const memoryImportWorker = createWorker<MemoryImportJobData, MemoryImportResult>(
    'memory-import',
    async job => {
        const {
            fileKey,
            fileType,
            memoryId,
            sourceLang,
            targetLang,
            tenantId,
            userId,
            sourceKey,
            targetKey,
            notesKey,
        } = job.data;
        const updateProgress = (progress: MemoryImportProgress) => job.updateProgress(progress);
        await updateProgress({
            stage: 'parsing',
            currentBatch: 0,
            totalBatches: 1,
            progress: 0,
        });

        if (!userId || !memoryId) throw new Error('MISSING_OWNER_OR_MEMORY');
        if (!String(fileKey || '').startsWith(`users/${userId}/uploads/`)) {
            throw new Error('UNAUTHORIZED_FILE_KEY');
        }
        const memory = await (prisma as any).translationMemory.findFirst({
            where: { id: memoryId, userId },
            select: { id: true },
        });
        if (!memory) throw new Error('UNAUTHORIZED_MEMORY');

        const buf = await getStorageService().getObjectBuffer(fileKey);

        // parse file
        let pairs: Array<{ source: string; target: string; notes?: string }> = [];
        const ext = String(fileType || '').toLowerCase();
        const normalizeColumnKey = (value: unknown) =>
            String(value ?? '')
                .trim()
                .toLowerCase();
        const requestedSourceKey = normalizeColumnKey(sourceKey);
        const requestedTargetKey = normalizeColumnKey(targetKey);
        const requestedNotesKey = normalizeColumnKey(notesKey);
        if (ext.includes('tmx') || ext.includes('xml')) {
            const { XMLParser } = await import('fast-xml-parser');
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
            const obj: any = parser.parse(buf.toString('utf-8'));
            const body = obj?.tmx?.body || obj?.TMX?.body;
            const tus = Array.isArray(body?.tu) ? body.tu : body?.tu ? [body.tu] : [];
            for (const tu of tus) {
                const tuv = Array.isArray(tu?.tuv) ? tu.tuv : tu?.tuv ? [tu.tuv] : [];
                const pick = (pref?: string) =>
                    pref
                        ? tuv.find((x: any) =>
                              String(x?.['@_xml:lang'] || x?.['@_lang'] || '')
                                  .toLowerCase()
                                  .startsWith(pref.toLowerCase())
                          )
                        : undefined;
                let s = pick(sourceLang);
                let t = pick(targetLang);
                if (!s || !t) {
                    if (tuv.length >= 2) {
                        s = tuv[0];
                        t = tuv[1];
                    }
                }
                const sv = String(s?.seg ?? s?.seg?.['#text'] ?? '').trim();
                const tv = String(t?.seg ?? t?.seg?.['#text'] ?? '').trim();
                if (sv && tv) pairs.push({ source: sv, target: tv });
            }
        } else if (ext.includes('csv') || ext.includes('tsv')) {
            const text = buf.toString('utf-8');
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (lines.length) {
                const headerLine = String(lines[0] || '');
                const headers = headerLine.split(/,|\t/).map(normalizeColumnKey);
                const idx = (candidates: string[]) => {
                    for (const candidate of candidates) {
                        if (!candidate) continue;
                        const columnIndex = headers.indexOf(candidate);
                        if (columnIndex >= 0) return columnIndex;
                    }
                    return -1;
                };
                const si = idx([requestedSourceKey, 'source', 'src', '源', '原文']);
                const ti = idx([requestedTargetKey, 'target', 'tgt', '译', '译文']);
                const ni = idx([requestedNotesKey, 'notes', 'note', '备注']);
                for (const line of lines.slice(1)) {
                    const cols = line.split(/,|\t/);
                    const s = si >= 0 ? String(cols[si] ?? '').trim() : '';
                    const t = ti >= 0 ? String(cols[ti] ?? '').trim() : '';
                    const n = ni >= 0 ? String(cols[ni] ?? '').trim() : '';
                    if (s && t) pairs.push({ source: s, target: t, notes: n || undefined });
                }
            }
        } else if (ext.includes('xlsx') || ext.includes('xls')) {
            const XLSXMod = await import('xlsx');
            const XLSX: any = (XLSXMod as any).default || XLSXMod;
            const wb = XLSX.read(buf, { type: 'buffer' });
            const name = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined;
            if (name) {
                const ws = wb.Sheets[name];
                const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
                for (const r of rows) {
                    const kv: Record<string, unknown> = Object.create(null);
                    for (const k of Object.keys(r)) kv[normalizeColumnKey(k)] = r[k];
                    const readColumn = (candidates: string[]) => {
                        for (const candidate of candidates) {
                            if (candidate && Object.prototype.hasOwnProperty.call(kv, candidate)) {
                                return kv[candidate];
                            }
                        }
                        return '';
                    };
                    const s = String(
                        readColumn([requestedSourceKey, 'source', 'src', '源', '原文']) ?? ''
                    ).trim();
                    const t = String(
                        readColumn([requestedTargetKey, 'target', 'tgt', '译', '译文']) ?? ''
                    ).trim();
                    const n = String(
                        readColumn([requestedNotesKey, 'notes', 'note', '备注']) ?? ''
                    ).trim();
                    if (s && t) pairs.push({ source: s, target: t, notes: n ? n : undefined });
                }
            }
        } else {
            throw new Error('UNSUPPORTED_FILE_TYPE');
        }

        await updateProgress({
            stage: 'parsing',
            currentBatch: 1,
            totalBatches: 1,
            progress: 5,
        });

        if (!pairs.length) {
            logger.warn('[WORKER_IMPORT] 未解析到有效的翻译对，跳过后续处理');
            await updateProgress({
                stage: 'complete',
                currentBatch: 1,
                totalBatches: 1,
                progress: 100,
            });
            return { total: 0, indexed: 0, memoryId };
        }

        // Generate and validate every vector before creating any text rows.
        const texts = pairs.map(p => `${p.source}\n${p.target}`);
        const vectors: number[][] = [];
        const batchSize = 200;
        const totalEmbeddingBatches = Math.ceil(texts.length / batchSize);
        await updateProgress({
            stage: 'embedding',
            currentBatch: 0,
            totalBatches: totalEmbeddingBatches,
            progress: 5,
        });

        try {
            logger.info(`[WORKER_IMPORT] 开始生成 ${texts.length} 条记录的嵌入向量...`);
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                const currentBatch = Math.floor(i / batchSize) + 1;
                logger.info(
                    `[WORKER_IMPORT] 处理第 ${i + 1}-${Math.min(i + batch.length, texts.length)} 条记录...`
                );
                const batchVectors = await embedBatchForOwner(batch, { userId, tenantId });
                assertEmbeddingBatch(
                    batchVectors,
                    batch.length,
                    `memory-import:${memoryId}:batch-${currentBatch}`
                );
                vectors.push(...batchVectors);
                await updateProgress({
                    stage: 'embedding',
                    currentBatch,
                    totalBatches: totalEmbeddingBatches,
                    progress: Math.min(
                        80,
                        5 + Math.round((75 * currentBatch) / totalEmbeddingBatches)
                    ),
                });
            }

            assertEmbeddingBatch(vectors, texts.length, `memory-import:${memoryId}:complete`);
            logger.info(
                `[WORKER_IMPORT] 成功生成 ${vectors.length} 个向量，第一个向量维度: ${vectors[0]?.length || 0}`
            );
        } catch (error) {
            logger.error(`[WORKER_IMPORT] 嵌入向量生成失败:`, error);
            throw error;
        }

        await updateProgress({
            stage: 'vector',
            currentBatch: 0,
            totalBatches: 1,
            progress: 90,
        });

        const created = await prisma.$transaction(
            pairs.map(p =>
                (prisma as any).translationMemoryEntry.create({
                    data: {
                        memoryId,
                        sourceText: p.source,
                        targetText: p.target,
                        notes: p.notes ? p.notes : null,
                        sourceLang,
                        targetLang,
                        createdById: userId,
                        updatedById: userId,
                    },
                })
            )
        );
        const createdIds = created.map((row: any) => row.id);

        try {
            const collection = 'TranslationMemory';
            const points = created.map((row: any, i: number) => ({
                id: row.id,
                text: `${row.sourceText}\n${row.targetText}`,
                vector: vectors[i],
                meta: {
                    memoryId: row.memoryId,
                    sourceLang,
                    targetLang,
                    tenantId: tenantId || null,
                    userId,
                },
            }));

            logger.info(
                `[WORKER_IMPORT] 准备写入 Postgres 向量索引: ${points.length}/${points.length} 条记录有有效向量`
            );

            await upsertVectors({ collection, points });
            logger.info(`[WORKER_IMPORT] 成功写入 Postgres 向量索引: ${points.length} 条记录`);
            await updateProgress({
                stage: 'vector',
                currentBatch: 1,
                totalBatches: 1,
                progress: 100,
            });
            await updateProgress({
                stage: 'complete',
                currentBatch: 1,
                totalBatches: 1,
                progress: 100,
            });
            logger.info(`[WORKER_IMPORT] 导入成功，共写入 ${pairs.length} 条记忆数据`);
            return { total: pairs.length, indexed: points.length, memoryId };
        } catch (error) {
            logger.error(`[WORKER_IMPORT] 向量写入或任务收尾失败，正在删除本次文本行:`, error);
            try {
                await (prisma as any).translationMemoryEntry.deleteMany({
                    where: { memoryId, id: { in: createdIds } },
                });
                logger.info(`[WORKER_IMPORT] 已补偿删除 ${createdIds.length} 条本次创建的文本行`);
            } catch (cleanupError) {
                logger.error(`[WORKER_IMPORT] 补偿删除本次文本行失败:`, cleanupError);
            }
            throw error;
        }
    },
    4
);

logger.info('[worker] memory-import worker started');

type MemoryVectorBackfillJobData = {
    memoryId: string;
    userId: string;
    tenantId?: string | null;
    batchSize?: number;
};

type MemoryVectorBackfillResult = {
    memoryId: string;
    total: number;
    indexed: number;
    remaining: number;
};

type MemoryVectorBackfillRow = {
    id: string;
    sourceText: string;
    targetText: string;
    sourceLang: string | null;
    targetLang: string | null;
};

function countFromRawResult(rows: Array<{ count: bigint | number | string }>) {
    const count = Number(rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('INVALID_MEMORY_VECTOR_BACKFILL_COUNT');
    }
    return count;
}

const memoryVectorBackfillWorker = createWorker<
    MemoryVectorBackfillJobData,
    MemoryVectorBackfillResult
>(
    'memory-vector-backfill',
    async job => {
        const { memoryId, userId, tenantId } = job.data;
        const requestedBatchSize = Number(job.data.batchSize || 100);
        const batchSize = Math.max(
            1,
            Math.min(
                200,
                Number.isFinite(requestedBatchSize) ? Math.floor(requestedBatchSize) : 100
            )
        );
        const updateProgress = (progress: MemoryImportProgress) => job.updateProgress(progress);

        await updateProgress({
            stage: 'parsing',
            currentBatch: 0,
            totalBatches: 1,
            progress: 0,
        });
        if (!memoryId || !userId) throw new Error('MISSING_OWNER_OR_MEMORY');

        const memory = await (prisma as any).translationMemory.findFirst({
            where: { id: memoryId, userId },
            select: { id: true },
        });
        if (!memory) throw new Error('UNAUTHORIZED_MEMORY');

        const countMissing = async () => {
            const rows = (await prisma.$queryRaw(Prisma.sql`
                    SELECT COUNT(*)::bigint AS count
                    FROM "TranslationMemoryEntry"
                    WHERE "memoryId" = ${memory.id}
                      AND embedding IS NULL
                `)) as Array<{ count: bigint }>;
            return countFromRawResult(rows);
        };

        const total = await countMissing();
        const totalBatches = Math.ceil(total / batchSize);
        await updateProgress({
            stage: 'parsing',
            currentBatch: 0,
            totalBatches,
            progress: 5,
        });
        if (!total) {
            await updateProgress({
                stage: 'complete',
                currentBatch: 0,
                totalBatches: 0,
                progress: 100,
            });
            return { memoryId: memory.id, total: 0, indexed: 0, remaining: 0 };
        }

        let cursor: string | null = null;
        let indexed = 0;
        let currentBatch = 0;

        while (true) {
            const cursorFilter: Prisma.Sql = cursor ? Prisma.sql`AND id > ${cursor}` : Prisma.empty;
            const rows = (await prisma.$queryRaw(Prisma.sql`
                SELECT id, "sourceText", "targetText", "sourceLang", "targetLang"
                FROM "TranslationMemoryEntry"
                WHERE "memoryId" = ${memory.id}
                  AND embedding IS NULL
                  ${cursorFilter}
                ORDER BY id ASC
                LIMIT ${batchSize}
            `)) as MemoryVectorBackfillRow[];
            if (!rows.length) break;

            const nextBatch = currentBatch + 1;
            const progressBeforeBatch = Math.min(99, 5 + Math.floor((94 * indexed) / total));
            await updateProgress({
                stage: 'embedding',
                currentBatch: nextBatch,
                totalBatches,
                progress: progressBeforeBatch,
            });

            const texts = rows.map(row => `${row.sourceText}\n${row.targetText}`);
            const vectors = await embedBatchForOwner(texts, { userId, tenantId });
            assertEmbeddingBatch(
                vectors,
                rows.length,
                `memory-vector-backfill:${memory.id}:batch-${nextBatch}`
            );

            await updateProgress({
                stage: 'vector',
                currentBatch: nextBatch,
                totalBatches,
                progress: progressBeforeBatch,
            });
            await upsertVectors({
                collection: 'TranslationMemory',
                points: rows.map((row, index) => ({
                    id: row.id,
                    text: texts[index]!,
                    vector: vectors[index]!,
                    meta: {
                        memoryId: memory.id,
                        sourceLang: row.sourceLang,
                        targetLang: row.targetLang,
                        tenantId: tenantId || null,
                        userId,
                    },
                })),
            });

            indexed += rows.length;
            currentBatch = nextBatch;
            cursor = rows[rows.length - 1]?.id || cursor;
            await updateProgress({
                stage: 'vector',
                currentBatch,
                totalBatches,
                progress: Math.min(99, 5 + Math.floor((94 * indexed) / total)),
            });
        }

        const remaining = await countMissing();
        await updateProgress({
            stage: 'complete',
            currentBatch,
            totalBatches,
            progress: 100,
        });
        logger.info(
            `[WORKER_BACKFILL] 完成记忆库 ${memory.id} 的向量补全：本次 ${indexed}/${total}，剩余 ${remaining}`
        );
        return { memoryId: memory.id, total, indexed, remaining };
    },
    2
);

logger.info('[worker] memory-vector-backfill worker started');
