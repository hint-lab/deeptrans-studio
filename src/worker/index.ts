import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { DOCUMENT_TERMS_RUN_ERROR } from '@/lib/document-term-job';
import {
    commitDocumentTermsResultIfActive,
    runDocumentTermsModelWithCancellation,
} from '@/lib/document-term-cancellation';
import {
    commitBatchQAFailureIfActive,
    commitBatchQAResultIfActive,
    runBatchQAModelWithCancellation,
} from '@/lib/batch-qa-cancellation';
import {
    commitBatchPreTranslateFailureIfActive,
    commitBatchPreTranslateResultIfActive,
    runBatchPreTranslateModelWithCancellation,
} from '@/lib/batch-pre-translate-cancellation';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    hasImportableTranslationMemoryPairs,
    isTranslationMemoryImportPairCountAllowed,
    translationMemoryImportPairLimitMessage,
} from '@/lib/memory-import-validation';
import {
    commitMemoryImportWithReceiptForCurrentOwner,
    isSameMemoryImportReceiptIdentity,
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
} from '@/lib/memory-import-owner-lock';
import { parseMemoryImportDelimited } from '@/lib/memory-import-delimited';
import { resolveMemoryImportFormat } from '@/lib/memory-import-format';
import {
    memoryImportInputFingerprint,
    usesMemoryImportReceiptProtocol,
} from '@/lib/memory-import-job';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH, setTextWithTTL } from '@/lib/redis-ttl';
import { getStorageService } from '@/lib/storage/service';
import { findWritableDocumentItemForOwner } from '@/server/document-item-access';
import { embedBatchForOwner } from '@/server/embedding';
import { runPreTranslateForOwner } from '@/server/pre-translate';
import { extractDocumentTermsForOwner } from '@/server/project-init';
import { runQualityAssureForOwner } from '@/server/quality-assure';
import { startWorkerHeartbeat, type WorkerHeartbeatController } from '@/server/worker-readiness';
import { assertEmbeddingBatch } from '../lib/embedding-contract';
import { upsertTranslationMemoryVectorsWithClient, upsertVectors } from '../lib/vector/postgres';
import { createWorker, getQueueConnection } from './queue';

// The guarded local runner injects its validated profile before this process
// starts. Keep the raw/internal entrypoint deterministic as well: dotenv must
// finish synchronously before the first queue connection resolves REDIS_URL.
// dotenv does not override values already supplied by the guarded runner.
if (process.env.NODE_ENV !== 'production') dotenv.config();

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
const WORKER_QUEUE_NAMES = [
    'pretranslate',
    'qa',
    'doc-terms',
    'memory-import',
    'memory-vector-backfill',
] as const;
const workerId = randomUUID();
let workerHeartbeat: WorkerHeartbeatController | null = null;
let workerShuttingDown = false;
let queueConnectionReady = false;
const queueReadinessTimeout = setTimeout(() => {
    if (queueConnectionReady) return;
    logger.error(
        '[worker] Queue connection is not ready after 10 seconds. Run npm run local:check, then start the local worker with npm run worker; worker:raw is an internal entrypoint.'
    );
}, 10_000);
queueReadinessTimeout.unref();

connection.once('ready', () => {
    queueConnectionReady = true;
    clearTimeout(queueReadinessTimeout);
    logger.info('[worker] Queue connection is ready; publishing worker readiness');
    void startWorkerHeartbeat(connection, {
        workerId,
        queues: WORKER_QUEUE_NAMES,
    })
        .then(async heartbeat => {
            if (workerShuttingDown) {
                await heartbeat.stop();
                return;
            }
            workerHeartbeat = heartbeat;
            logger.info('[worker] Worker readiness heartbeat is active');
        })
        .catch(error => {
            logger.error(
                `[worker] Could not publish worker readiness heartbeat: ${error?.message || error}`
            );
        });
});

connection.on('error', (err: any) => {
    logger.error(`[redis] error: ${err?.message || err}`);
});

async function assertJobCanWriteItem(jobData: any) {
    const itemId = String(jobData?.id || '');
    const userId = String(jobData?.userId || '');
    if (!itemId || !userId) throw new Error('MISSING_JOB_ITEM_OWNER');
    const item = await findWritableDocumentItemForOwner(itemId, { userId });
    if (!item) throw new Error('UNAUTHORIZED_JOB_ITEM');
    return item;
}

// Pre-translate worker
const preWorker = createWorker(
    'pretranslate',
    async job => {
        const {
            id,
            text,
            sourceText,
            targetText,
            sourceRevision,
            sourceLanguage,
            targetLanguage,
            userId,
            tenantId,
            batchId,
            termExtractPrompt,
            termEmbedPrompt,
        } = job.data as any;
        const modelOutcome = await runBatchPreTranslateModelWithCancellation({
            isCancellationRequested: async () =>
                (await connection.get(`batch.${batchId}.cancel`)) === '1',
            runModel: async () => {
                // The queue payload is not the authority for project scope.
                // Resolve it again from the writable item before dictionary
                // lookup so a job cannot borrow another project's bindings.
                const item = await assertJobCanWriteItem(job.data);
                return runPreTranslateForOwner(
                    text,
                    sourceLanguage,
                    targetLanguage,
                    {
                        userId,
                        tenantId,
                    },
                    {
                        termExtractPrompt,
                        termEmbedPrompt,
                        projectId: item.document.projectId,
                    }
                );
            },
        });
        if (modelOutcome.canceled) {
            job.discard();
            throw new Error('JOB_CANCELED');
        }
        const translation = modelOutcome.result?.translation || '';
        if (!String(translation).trim()) throw new Error('EMPTY_TRANSLATION_RESULT');
        const terms = modelOutcome.result?.terms || [];
        const dict = modelOutcome.result?.dict || [];
        const resultCommit = await commitBatchPreTranslateResultIfActive(
            connection,
            batchId,
            String(id),
            {
                id,
                sourceText: String(sourceText || text || ''),
                targetText: targetText ?? null,
                sourceRevision: String(sourceRevision || ''),
                translation,
                terms,
                dict,
            },
            TTL_BATCH
        );
        if (resultCommit.canceled) {
            job.discard();
            throw new Error('JOB_CANCELED');
        }
        const total = Number(await connection.get(`batch.${batchId}.total`)) || 0;
        const percent =
            total > 0 ? Math.min(100, Math.round((resultCommit.count / total) * 100)) : 0;
        await job.updateProgress(percent);
        logger.info(
            `[pre] job=${job.id} ${resultCommit.committed ? 'pre-translate pipeline complete' : 'duplicate terminal ignored'}`
        );
    },
    24
);

preWorker.on('active', job => {
    logger.info(`[pre] active job=${job.id} name=${job.name}`);
});
preWorker.on('progress', (job, progress) => {
    logger.info(`[pre] progress job=${job.id} progress=${progress}`);
});
preWorker.on('failed', async (job, err) => {
    try {
        const batchId = (job?.data as any)?.batchId;
        const terminalReason = String((err as Error)?.message || '');
        const canceled =
            terminalReason === 'JOB_CANCELED' ||
            (batchId ? (await connection.get(`batch.${batchId}.cancel`)) === '1' : false);
        // A canceled model call is neither a failed item nor a terminal batch
        // counter. The server cancellation fence already prevents its late
        // output from becoming cached or persistable.
        if (canceled) {
            logger.info(`[pre] canceled job=${job?.id}`);
            return;
        }
        logger.error(`[pre] failed job=${job?.id} error=${err?.message || err}`);
        const attempts = Math.max(1, Number(job?.opts?.attempts || 1));
        const isFinalFailure = Number(job?.attemptsMade || 0) >= attempts;
        const itemId = String((job?.data as any)?.id || job?.id || '');
        if (!batchId || !itemId || !isFinalFailure) return;
        const terminal = await commitBatchPreTranslateFailureIfActive(
            connection,
            batchId,
            itemId,
            String((err as Error)?.message || err),
            TTL_BATCH
        ).catch(() => undefined);
        if (terminal?.canceled) {
            logger.info(`[pre] canceled before failure commit job=${job?.id}`);
        }
    } catch {}
});
preWorker.on('error', err => {
    logger.error(`[pre] worker error: ${err?.message || err}`);
});

// QA worker
const qaWorker = createWorker(
    'qa',
    async job => {
        const {
            id,
            sourceText,
            targetText,
            targetLanguage,
            domain,
            tenantId,
            userId,
            batchId,
            syntaxEvaluatePrompt,
        } = job.data as any;
        const modelOutcome = await runBatchQAModelWithCancellation({
            isCancellationRequested: async () =>
                (await connection.get(`qa.${batchId}.cancel`)) === '1',
            runModel: async () =>
                runQualityAssureForOwner(
                    sourceText,
                    targetText,
                    { userId, tenantId },
                    { targetLanguage, domain, prompt: syntaxEvaluatePrompt }
                ),
        });
        if (modelOutcome.canceled) {
            job.discard();
            throw new Error('JOB_CANCELED');
        }

        const resultCommit = await commitBatchQAResultIfActive(
            connection,
            batchId,
            String(id),
            {
                id,
                qualityAssureBiTerm: modelOutcome.result?.biTerm ?? undefined,
                qualityAssureSyntax: modelOutcome.result?.syntax ?? undefined,
                qualityAssureSyntaxEmbedded: null,
            },
            TTL_BATCH
        );
        if (resultCommit.canceled) {
            job.discard();
            throw new Error('JOB_CANCELED');
        }

        const total = Number(await connection.get(`qa.${batchId}.total`)) || 0;
        const percent =
            total > 0 ? Math.min(100, Math.round((resultCommit.count / total) * 100)) : 0;
        await job.updateProgress(percent);
        logger.info(
            `[qa] job=${job.id} ${resultCommit.committed ? 'QA pipeline complete' : 'duplicate terminal ignored'}`
        );
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
    try {
        const batchId = (job?.data as any)?.batchId;
        const terminalReason = String((err as Error)?.message || '');
        // `JOB_CANCELED` is deliberately raised after a worker observes the
        // cancel fence. It is not a failed segment and must never make a
        // canceled batch appear terminal or leave a failure key behind.
        if (terminalReason === 'JOB_CANCELED') {
            logger.info(`[qa] canceled job=${job?.id}`);
            return;
        }
        logger.error(`[qa] failed job=${job?.id} error=${err?.message || err}`);
        const attempts = Math.max(1, Number(job?.opts?.attempts || 1));
        const isFinalFailure = Number(job?.attemptsMade || 0) >= attempts;
        const itemId = String((job?.data as any)?.id || job?.id || '');
        if (batchId && itemId && isFinalFailure) {
            const terminal = await commitBatchQAFailureIfActive(
                connection,
                batchId,
                itemId,
                String((err as Error)?.message || err),
                TTL_BATCH
            ).catch(() => undefined);
            if (terminal?.canceled) {
                logger.info(`[qa] canceled before failure commit job=${job?.id}`);
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
        const modelOutcome = await runDocumentTermsModelWithCancellation({
            isCancellationRequested: async () =>
                batchId ? (await connection.get(`docTerms.${batchId}.cancel`)) === '1' : false,
            runModel: async () =>
                extractDocumentTermsForOwner(
                    text,
                    { userId, tenantId },
                    {
                        prompt,
                        maxTerms,
                        chunkSize,
                        overlap,
                    }
                ),
        });
        if (modelOutcome.canceled) {
            job.discard();
            throw new Error('JOB_CANCELED');
        }
        const terms = modelOutcome.result;
        // 术语结果仅返回给上层，由服务层决定是否/如何持久化与应用范围
        if (batchId) {
            const resultCommit = await commitDocumentTermsResultIfActive(
                connection,
                batchId,
                String(id),
                { id, terms },
                TTL_BATCH
            );
            if (resultCommit.canceled) {
                job.discard();
                throw new Error('JOB_CANCELED');
            }
            if (!resultCommit.committed) {
                job.discard();
                throw new Error('JOB_TERMINAL');
            }
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
            const terminalReason = String((err as Error)?.message || '');
            const canceled =
                terminalReason === 'JOB_CANCELED' ||
                (await connection.get(`docTerms.${batchId}.cancel`)) === '1';
            // A canceled extraction is a terminal recovery state, not a
            // failure. Do not overwrite the cancel marker with a generic
            // error after a model call returns late.
            if (canceled || terminalReason === 'JOB_TERMINAL') return;
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

process.on('unhandledRejection', (reason: any) => {
    logger.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err: any) => {
    logger.error('[process] uncaughtException:', err);
});

async function stopWorkerHeartbeat() {
    workerShuttingDown = true;
    clearTimeout(queueReadinessTimeout);
    await workerHeartbeat?.stop();
}

process.on('SIGINT', async () => {
    logger.info('[worker] SIGINT received, shutting down...');
    await stopWorkerHeartbeat();
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
    await stopWorkerHeartbeat();
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
    receiptProtocolVersion?: number;
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

        const jobId = String(job.id || '').trim();
        if (!jobId) throw new Error('MISSING_MEMORY_IMPORT_JOB_ID');
        const importIdentity = {
            userId,
            memoryId,
            fileKey,
            fileType: String(fileType || ''),
            sourceLang,
            targetLang,
            sourceKey,
            targetKey,
            notesKey,
            tenantId: tenantId || null,
        };
        const inputFingerprint = memoryImportInputFingerprint(importIdentity);
        const receiptByJobId = await (prisma as any).translationMemoryImportReceipt.findFirst({
            where: { jobId },
        });
        const existingReceipt =
            receiptByJobId ||
            (await (prisma as any).translationMemoryImportReceipt.findFirst({
                where: { userId, memoryId, inputFingerprint },
            }));
        if (existingReceipt) {
            if (
                !isSameMemoryImportReceiptIdentity(existingReceipt, {
                    userId,
                    memoryId,
                    fileKey,
                    inputFingerprint,
                })
            ) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            await updateProgress({
                stage: 'complete',
                currentBatch: 1,
                totalBatches: 1,
                progress: 100,
            });
            return {
                total: existingReceipt.total,
                indexed: existingReceipt.indexed,
                memoryId,
            };
        }

        const buf = await getStorageService().getObjectBuffer(fileKey);

        // parse file
        let pairs: Array<{ source: string; target: string; notes?: string }> = [];
        const importFormat = resolveMemoryImportFormat(fileType);
        if (!importFormat) throw new Error('UNSUPPORTED_FILE_TYPE');
        const normalizeColumnKey = (value: unknown) =>
            String(value ?? '')
                .replace(/^\uFEFF/, '')
                .trim()
                .toLowerCase();
        const requestedSourceKey = normalizeColumnKey(sourceKey);
        const requestedTargetKey = normalizeColumnKey(targetKey);
        const requestedNotesKey = normalizeColumnKey(notesKey);
        if (importFormat === 'tmx') {
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
        } else if (importFormat === 'csv' || importFormat === 'tsv') {
            const parsed = parseMemoryImportDelimited(buf.toString('utf-8'), {
                format: importFormat,
                mapping: { sourceKey, targetKey, notesKey },
            });
            if (!parsed.ok) {
                logger.warn(
                    `[WORKER_IMPORT] ${importFormat.toUpperCase()} 格式错误，已拒绝导入: ${parsed.error.code} (${parsed.error.line}:${parsed.error.column})`
                );
                throw new Error(
                    `MALFORMED_DELIMITED_IMPORT: ${parsed.error.code}: ${parsed.error.message}`
                );
            }
            pairs = parsed.pairs;
        } else if (importFormat === 'spreadsheet') {
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
        }

        await updateProgress({
            stage: 'parsing',
            currentBatch: 1,
            totalBatches: 1,
            progress: 5,
        });

        if (!hasImportableTranslationMemoryPairs(pairs)) {
            logger.warn('[WORKER_IMPORT] 未解析到有效的翻译对，任务失败');
            throw new Error(EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE);
        }
        if (!isTranslationMemoryImportPairCountAllowed(pairs.length)) {
            logger.warn(
                `[WORKER_IMPORT] 已拒绝 ${pairs.length} 条翻译对：单次导入上限为 500 条`
            );
            throw new Error(translationMemoryImportPairLimitMessage(pairs.length));
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

        // Embedding is intentionally outside the DB transaction, but every
        // final write is not: owner lock, text entries, vector rows, and the
        // success receipt commit together. A BullMQ retry after this commit
        // returns the receipt instead of duplicating the import.
        const committed = await commitMemoryImportWithReceiptForCurrentOwner(prisma, {
            memoryId,
            userId,
            entries: pairs.map(p => ({
                sourceText: p.source,
                targetText: p.target,
                notes: p.notes ? p.notes : null,
                sourceLang,
                targetLang,
                createdById: userId,
                updatedById: userId,
            })),
            receipt: {
                jobId,
                inputFingerprint,
                fileKey,
                total: pairs.length,
                indexed: vectors.length,
            },
            requireReservation: usesMemoryImportReceiptProtocol(job.data),
            writeVectors: async (transaction, created) => {
                const points = created.map((row, i) => {
                    const vector = vectors[i];
                    // `assertEmbeddingBatch` above guarantees the same length,
                    // but keep the indexing boundary explicit under strict TS.
                    if (!vector) throw new Error(`MISSING_MEMORY_IMPORT_VECTOR:${i}`);
                    return {
                        id: row.id,
                        text: `${row.sourceText}\n${row.targetText}`,
                        vector,
                        meta: {
                            memoryId: row.memoryId,
                            sourceLang,
                            targetLang,
                            tenantId: tenantId || null,
                            userId,
                        },
                    };
                });

                logger.info(
                    `[WORKER_IMPORT] 准备原子写入 Postgres 向量索引: ${points.length}/${points.length} 条记录有有效向量`
                );
                await upsertTranslationMemoryVectorsWithClient(transaction, points);
                logger.info(
                    `[WORKER_IMPORT] 已原子写入 Postgres 向量索引: ${points.length} 条记录`
                );
            },
        });
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
        logger.info(
            `[WORKER_IMPORT] 导入${committed.status === 'already-committed' ? '已恢复' : '成功'}，共写入 ${committed.receipt.total} 条记忆数据`
        );
        return {
            total: committed.receipt.total,
            indexed: committed.receipt.indexed,
            memoryId,
        };
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
