// Dev 环境按需加载 dotenv（使用动态 import，无顶层 await）
if (process.env.NODE_ENV !== 'production') {
    import('dotenv')
        .then((dotenv: any) => {
            dotenv?.config?.();
        })
        .catch(() => {});
}
import { fetchDocumentItemNeedsMtReviewByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { TTL_BATCH, setJSONWithTTL } from '@/lib/redis-ttl';
import { getStorageConfigFromEnv } from '@/lib/storage/config';
import { createStorageService } from '@/lib/storage/factory';
import { canWriteDocumentItemForOwner } from '@/server/document-item-access';
import { embedBatchForOwner } from '@/server/embedding';
import { runPreTranslateForOwner } from '@/server/pre-translate';
import { extractDocumentTermsForOwner } from '@/server/project-init';
import { runQualityAssureForOwner } from '@/server/quality-assure';
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
const storageService = createStorageService(getStorageConfigFromEnv());

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
        if (cancel === '1') throw new Error('JOB_CANCELED');
        const res = await runQualityAssureForOwner(
            sourceText,
            targetText,
            { userId, tenantId },
            { targetLanguage, domain }
        );
        await connection.set(
            `qa.${batchId}.item.${id}`,
            JSON.stringify({
                id,
                qualityAssureBiTerm: res?.biTerm ?? undefined,
                qualityAssureSyntax: res?.syntax ?? undefined,
                qualityAssureSyntaxEmbedded: res?.syntaxEmbedded ?? undefined,
            })
        );
        await connection.incr(`qa.${batchId}.done`);
        const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
        const done = Number(await connection.get(`qa.${batchId}.done`)) || 0;
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
        if (batchId) {
            await connection.incr(`qa.${batchId}.failed`).catch(() => {});
            await connection
                .set(`qa.${batchId}.fail.${job?.id}`, String((err as Error)?.message || err))
                .catch(() => {});
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
            await connection.incr(`docTerms.${batchId}.done`);
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
docTermsWorker.on('completed', job => {
    logger.info(`[doc-terms] completed job=${job.id}`);
});
docTermsWorker.on('failed', async (job, err) => {
    logger.error(`[doc-terms] failed job=${job?.id} error=${err?.message || err}`);
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
        await connection.quit();
    } catch {}
    process.exit(0);
});

logger.info('[worker] Pretranslate, DocTerms & QA workers started');

// Memory-import worker
const memoryImportWorker = createWorker(
    'memory-import',
    async job => {
        const { fileKey, fileType, memoryId, sourceLang, targetLang, tenantId, userId } =
            job.data as any;
        if (!userId || !memoryId) throw new Error('MISSING_OWNER_OR_MEMORY');
        if (!String(fileKey || '').startsWith(`users/${userId}/uploads/`)) {
            throw new Error('UNAUTHORIZED_FILE_KEY');
        }
        const memory = await (prisma as any).translationMemory.findFirst({
            where: { id: memoryId, userId },
            select: { id: true },
        });
        if (!memory) throw new Error('UNAUTHORIZED_MEMORY');

        const buf = await storageService.getObjectBuffer(fileKey);

        // parse file
        let pairs: Array<{ source: string; target: string; notes?: string }> = [];
        const ext = String(fileType || '').toLowerCase();
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
                const headers = headerLine.split(/,|\t/).map(h =>
                    String(h || '')
                        .trim()
                        .toLowerCase()
                );
                const idx = (cands: string[]) =>
                    cands.map(c => headers.indexOf(c)).find(i => i >= 0) ?? -1;
                const si = idx(['source', 'src', '源', '原文']);
                const ti = idx(['target', 'tgt', '译', '译文']);
                const ni = idx(['notes', 'note', '备注']);
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
                const norm = (s: string) =>
                    String(s || '')
                        .trim()
                        .toLowerCase();
                const srcKey = norm('source');
                const tgtKey = norm('target');
                const noteKey = norm('notes');
                for (const r of rows) {
                    const kv: Record<string, any> = {};
                    for (const k of Object.keys(r)) kv[norm(k)] = r[k];
                    const s = String(kv[srcKey] ?? kv['源'] ?? kv['source'] ?? '').trim();
                    const t = String(kv[tgtKey] ?? kv['译'] ?? kv['target'] ?? '').trim();
                    const n = String(kv[noteKey] ?? kv['备注'] ?? kv['notes'] ?? '').trim();
                    if (s && t) pairs.push({ source: s, target: t, notes: n ? n : undefined });
                }
            }
        } else {
            throw new Error('UNSUPPORTED_FILE_TYPE');
        }

        if (!pairs.length) {
            logger.warn('[WORKER_IMPORT] 未解析到有效的翻译对，跳过后续处理');
            return;
        }

        // write rows to DB first so vector ids match TranslationMemoryEntry ids
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

        // embed in batches and upsert to Postgres pgvector
        const texts = pairs.map(p => `${p.source}\n${p.target}`);
        let vectors: number[][] = [];
        try {
            logger.info(`[WORKER_IMPORT] 开始生成 ${texts.length} 条记录的嵌入向量...`);
            const batchSize = 200; // 设置为 200，留一些余量

            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                logger.info(
                    `[WORKER_IMPORT] 处理第 ${i + 1}-${Math.min(i + batch.length, texts.length)} 条记录...`
                );
                const batchVectors = await embedBatchForOwner(batch, { userId, tenantId });
                vectors.push(...batchVectors);
            }

            logger.info(
                `[WORKER_IMPORT] 成功生成 ${vectors.length} 个向量，第一个向量维度: ${vectors[0]?.length || 0}`
            );
        } catch (error) {
            logger.error(`[WORKER_IMPORT] 嵌入向量生成失败:`, error);
        }

        const collection = 'TranslationMemory';
        const points = created.map((row: any, i: number) => ({
            id: row.id,
            text: `${row.sourceText}\n${row.targetText}`,
            vector: vectors[i] || [],
            meta: {
                memoryId: row.memoryId,
                sourceLang,
                targetLang,
                tenantId: tenantId || null,
                userId,
            },
        }));
        const valid = points.filter(
            (p: { vector: number[] }) => Array.isArray(p.vector) && p.vector.length
        );

        logger.info(
            `[WORKER_IMPORT] 准备写入 Postgres 向量索引: ${valid.length}/${points.length} 条记录有有效向量`
        );

        if (valid.length) {
            try {
                await upsertVectors({ collection, points: valid });
                logger.info(`[WORKER_IMPORT] 成功写入 Postgres 向量索引: ${valid.length} 条记录`);
            } catch (error) {
                logger.error(`[WORKER_IMPORT] Postgres 向量索引写入失败:`, error);
                throw error;
            }
        } else {
            logger.warn(`[WORKER_IMPORT] 警告: 没有有效向量可写入 Postgres 向量索引`);
        }
        logger.info(`[WORKER_IMPORT] 导入成功，共写入 ${pairs.length} 条记忆数据`);
    },
    4
);

logger.info('[worker] memory-import worker started');
