'use server';

import { embedBatchAction } from '@/actions/embedding';
import { prisma } from '@/lib/db';
import { assertEmbeddingBatch } from '@/lib/embedding-contract';
import {
    GuardError,
    type AuthContext,
    requireOwnedMemory,
    requireUser,
    userOwnedWhere,
} from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    hasImportableTranslationMemoryPairs,
} from '@/lib/memory-import-validation';
import { parseMemoryImportDelimited } from '@/lib/memory-import-delimited';
import { createMemoryImportEntriesForCurrentOwner } from '@/lib/memory-import-owner-lock';
import { sanitizeMemoryLanguageUpdateInput } from '@/lib/memory-language-settings';
import {
    MEMORY_SEARCH_UNAVAILABLE_MESSAGE,
    memorySearchPublicErrorMessage,
} from '@/lib/memory-search';
import { upsertVectors } from '@/lib/vector/postgres';
import { searchMemoryForOwner } from '@/server/memory';
import { HybridSearchConfig } from '@/types/hybrid-search';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
const logger = createLogger(
    {
        type: 'actions:memories',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

/**
 * Server Actions serialize their return values back to the browser. Keep
 * database/provider errors in server logs and preserve only explicit guard
 * messages, which form the small public authorization vocabulary.
 */
function memoryActionErrorMessage(error: unknown, fallback: string) {
    if (error instanceof GuardError) return error.message;
    logger.error(`[MEMORY_ACTION] ${fallback}`, error);
    return fallback;
}

type ImportInput = {
    file: File;
    memoryId?: string;
    sourceLang?: string;
    targetLang?: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
    onProgress?: (event: {
        type: 'init' | 'progress';
        currentBatch: number;
        totalBatches: number;
        progress: number;
        stage: 'embedding' | 'vector';
    }) => void | Promise<void>;
};

// The dashboard moved to the durable upload + BullMQ protocol. Keep the old
// Server Action exported only long enough for stale action references to get a
// clear response; it must never bypass the receipt-backed worker write path.
const RETIRED_DIRECT_MEMORY_IMPORT_MESSAGE = '旧版导入协议已停用，请刷新页面后使用后台导入。';

function legacyDirectMemoryImportIsRetired() {
    return true;
}

function parseExcel(
    buf: Buffer,
    mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }
) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const name = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined;
    if (!name) return [] as Array<{ source: string; target: string; notes?: string }>;
    const ws = wb.Sheets[name];
    const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
    const norm = (s: string) =>
        String(s || '')
            .trim()
            .toLowerCase();
    const srcKey = norm(mapping?.sourceKey || 'source');
    const tgtKey = norm(mapping?.targetKey || 'target');
    const noteKey = norm(mapping?.notesKey || 'notes');
    const out: Array<{ source: string; target: string; notes?: string }> = [];
    for (const r of rows) {
        const kv: Record<string, any> = {};
        for (const k of Object.keys(r)) kv[norm(k)] = r[k];
        const s = String(kv[srcKey] ?? kv['源'] ?? kv['source'] ?? '').trim();
        const t = String(kv[tgtKey] ?? kv['译'] ?? kv['target'] ?? '').trim();
        const n = String(kv[noteKey] ?? kv['备注'] ?? kv['notes'] ?? '').trim();
        if (s && t) out.push({ source: s, target: t, notes: n || undefined });
    }
    return out;
}

function parseTMX(xml: string, srcPref?: string, tgtPref?: string) {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const obj: any = parser.parse(xml);
    const body = obj?.tmx?.body || obj?.TMX?.body;
    const tus = Array.isArray(body?.tu) ? body.tu : body?.tu ? [body.tu] : [];
    const out: Array<{ source: string; target: string; notes?: string }> = [];
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
        let s = pick(srcPref);
        let t = pick(tgtPref);
        if (!s || !t) {
            if (tuv.length >= 2) {
                s = tuv[0];
                t = tuv[1];
            }
        }
        const sv = String(s?.seg ?? s?.seg?.['#text'] ?? '').trim();
        const tv = String(t?.seg ?? t?.seg?.['#text'] ?? '').trim();
        if (sv && tv) out.push({ source: sv, target: tv });
    }
    return out;
}

export async function importMemoryAction(input: ImportInput) {
    const authCtx = await requireUser();
    if (legacyDirectMemoryImportIsRetired()) {
        return { success: false, error: RETIRED_DIRECT_MEMORY_IMPORT_MESSAGE } as const;
    }
    const { file, memoryId, sourceLang, targetLang, sourceKey, targetKey, notesKey, onProgress } =
        input;
    const name = (file as any).name || 'upload';
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const emitProgress = async (event: {
        type: 'init' | 'progress';
        currentBatch: number;
        totalBatches: number;
        progress: number;
        stage: 'embedding' | 'vector';
    }) => {
        if (onProgress) await onProgress(event);
    };

    let entries: Array<{ source: string; target: string; notes?: string }> = [];
    if (ext === 'tmx' || ext === 'xml')
        entries = parseTMX(buf.toString('utf-8'), sourceLang, targetLang);
    else if (ext === 'csv' || ext === 'tsv') {
        const parsed = parseMemoryImportDelimited(buf.toString('utf-8'), {
            format: ext,
            mapping: { sourceKey, targetKey, notesKey },
        });
        if (!parsed.ok) return { success: false, error: parsed.error.message } as const;
        entries = parsed.pairs;
    } else if (ext === 'xlsx' || ext === 'xls')
        entries = parseExcel(buf, { sourceKey, targetKey, notesKey });
    else return { success: false, error: '仅支持 TMX/CSV/TSV/XLSX/XLS' } as const;

    if (!hasImportableTranslationMemoryPairs(entries)) {
        return { success: false, error: EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE } as const;
    }

    const batchSize = 200;
    const totalBatches = Math.max(1, Math.ceil(entries.length / batchSize));
    await emitProgress({
        type: 'init',
        currentBatch: 0,
        totalBatches,
        progress: entries.length ? 5 : 100,
        stage: 'embedding',
    });

    const hasTm = (prisma as any).translationMemory && (prisma as any).translationMemoryEntry;
    if (!hasTm) {
        return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
    }

    if (!memoryId) return { success: false, error: '请选择目标记忆库' } as const;
    const targetMemory = await requireOwnedMemory(memoryId, authCtx);
    const targetMemoryId = targetMemory.id;

    if (entries.length > 0) {
        // 生成 embedding（源+译合并，有助对齐语篇检索）
        // 分批处理，避免超过 API 限制
        const vectors: number[][] = [];
        try {
            logger.log(`[MEMORY_IMPORT] 开始生成 ${entries.length} 条记录的嵌入向量...`);
            const texts = entries.map(e => `${e.source}\n${e.target}`);

            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                const currentBatch = Math.floor(i / batchSize) + 1;
                logger.log(
                    `[MEMORY_IMPORT] 处理第 ${i + 1}-${Math.min(i + batch.length, texts.length)} 条记录...`
                );
                const batchVectors = await embedBatchAction(batch);
                assertEmbeddingBatch(batchVectors, batch.length, `记忆导入批次 ${currentBatch}`);
                vectors.push(...batchVectors);
                await emitProgress({
                    type: 'progress',
                    currentBatch,
                    totalBatches,
                    progress: Math.min(70, 10 + Math.round((currentBatch / totalBatches) * 60)),
                    stage: 'embedding',
                });
            }

            logger.log(
                `[MEMORY_IMPORT] 成功生成 ${vectors.length} 个向量，第一个向量维度: ${vectors[0]?.length || 0}`
            );
        } catch (error) {
            logger.error(`[MEMORY_IMPORT] 嵌入向量生成失败:`, error);
            throw error;
        }
        assertEmbeddingBatch(vectors, entries.length, '记忆导入');
        await emitProgress({
            type: 'progress',
            currentBatch: totalBatches,
            totalBatches,
            progress: 80,
            stage: 'vector',
        });
        // This legacy progress route performs the same potentially long
        // embedding work as the queue worker. Re-check and lock ownership at
        // the final write boundary so an ownership transfer or deletion while
        // embeddings are generated cannot create rows in a different scope.
        const created = await createMemoryImportEntriesForCurrentOwner(prisma, {
            memoryId: targetMemoryId,
            userId: authCtx.userId,
            entries: entries.map(e => ({
                sourceText: e.source,
                targetText: e.target,
                notes: e.notes ?? null,
                sourceLang,
                targetLang,
                createdById: authCtx.userId,
                updatedById: authCtx.userId,
            })),
        });
        // 写入 Postgres pgvector embedding（TranslationMemory collection）
        try {
            const points = created.map((row: any, i: number) => ({
                id: row.id,
                text: `${row.sourceText}\n${row.targetText}`,
                vector: vectors[i] || [],
                meta: {
                    memoryId: row.memoryId,
                    sourceLang,
                    targetLang,
                    tenantId: authCtx.tenantId || null,
                    userId: authCtx.userId,
                },
            }));

            logger.log(
                `[MEMORY_IMPORT] 准备写入 Postgres 向量索引: ${points.length}/${created.length} 条记录有有效向量`
            );

            await upsertVectors({ collection: 'TranslationMemory', points });
            logger.log(`[MEMORY_IMPORT] 成功写入 Postgres 向量索引: ${points.length} 条记录`);
            await emitProgress({
                type: 'progress',
                currentBatch: totalBatches,
                totalBatches,
                progress: 95,
                stage: 'vector',
            });
        } catch (error) {
            logger.error(`[MEMORY_IMPORT] Postgres 向量索引写入失败:`, error);
            try {
                await (prisma as any).translationMemoryEntry.deleteMany({
                    where: {
                        memoryId: targetMemoryId,
                        id: { in: created.map((row: any) => row.id) },
                    },
                });
            } catch (cleanupError) {
                logger.error('[MEMORY_IMPORT] 回滚本次导入文本失败:', cleanupError);
            }
            throw new Error(`向量索引写入失败: ${error}`);
        }
    }
    return { success: true, data: { total: entries.length } } as const;
}

// 允许从客户端直接以 Server Action 方式调用（FormData）
export async function importMemoryFromForm(form: FormData, onProgress?: ImportInput['onProgress']) {
    'use server';
    try {
        await requireUser();
        if (legacyDirectMemoryImportIsRetired()) {
            return { success: false, error: RETIRED_DIRECT_MEMORY_IMPORT_MESSAGE } as const;
        }
        const file = form.get('file');
        if (!(file instanceof File)) return { success: false, error: '缺少文件（file）' } as const;
        const memoryId = (form.get('memoryId') as string) || undefined;
        const sourceLang = (form.get('sourceLang') as string) || undefined;
        const targetLang = (form.get('targetLang') as string) || undefined;
        const sourceKey = (form.get('sourceKey') as string) || undefined;
        const targetKey = (form.get('targetKey') as string) || undefined;
        const notesKey = (form.get('notesKey') as string) || undefined;
        return await importMemoryAction({
            file,
            memoryId,
            sourceLang,
            targetLang,
            sourceKey,
            targetKey,
            notesKey,
            onProgress,
        });
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, RETIRED_DIRECT_MEMORY_IMPORT_MESSAGE),
        } as const;
    }
}

export async function listMemoriesAction() {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemory;
        if (!hasTm) return { success: true, data: [] };
        const rows = await (prisma as any).translationMemory.findMany({
            where: userOwnedWhere(authCtx),
            select: {
                id: true,
                name: true,
                description: true,
                _count: { select: { entries: true } },
                entries: {
                    select: { updatedAt: true, sourceLang: true, targetLang: true },
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const list = rows.map((m: any) => {
            const last = Array.isArray(m.entries) && m.entries[0] ? m.entries[0] : null;
            return {
                id: m.id,
                name: m.name,
                description: m.description,
                _count: m._count,
                // 供前端直接显示
                sourceLanguage: last?.sourceLang || null,
                targetLanguage: last?.targetLang || null,
                updatedAt: last?.updatedAt || null,
            };
        });
        return { success: true, data: list };
    } catch (e) {
        return { success: false, error: '获取记忆库列表失败' };
    }
}

export async function createMemoryAction(input: { name: string; description?: string }) {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemory;
        if (!hasTm) {
            return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
        }
        const mem = await (prisma as any).translationMemory.create({
            data: {
                name: input.name,
                description: input.description ?? null,
                tenantId: authCtx.tenantId || null,
                userId: authCtx.userId,
            },
        });
        return { success: true, data: mem } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '创建记忆库失败，请稍后重试。'),
        } as const;
    }
}

export async function deleteMemoryAction(memoryId: string) {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemory;
        if (!hasTm)
            return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
        await requireOwnedMemory(memoryId, authCtx);
        await (prisma as any).translationMemory.delete({ where: { id: memoryId } });
        return { success: true } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '删除记忆库失败，请稍后重试。'),
        } as const;
    }
}

export async function updateMemoryLanguagesAction(
    memoryId: string,
    input: { sourceLang?: string; targetLang?: string }
) {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemory;
        const hasEntry = (prisma as any).translationMemoryEntry;
        if (!hasTm || !hasEntry)
            return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
        if (!memoryId) return { success: false, error: '缺少 memoryId' } as const;
        await requireOwnedMemory(memoryId, authCtx);

        const data = sanitizeMemoryLanguageUpdateInput(input);
        if (!Object.keys(data).length)
            return { success: false, error: '未提供需要更新的字段' } as const;

        const res = await (prisma as any).translationMemoryEntry.updateMany({
            where: { memoryId },
            data,
        });

        return { success: true, data: { updated: res.count } } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '更新记忆库设置失败，请稍后重试。'),
        } as const;
    }
}

export async function getMemoryByIdAction(memoryId: string) {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemory;
        if (!hasTm)
            return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
        const mem = await (prisma as any).translationMemory.findFirst({
            where: { id: memoryId, ...userOwnedWhere(authCtx) },
            include: { _count: { select: { entries: true } } },
        });
        if (!mem) return { success: false, error: '未找到记忆库' } as const;
        return { success: true, data: mem } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '加载记忆库信息失败，请稍后重试。'),
        } as const;
    }
}

export async function getMemoryEntriesPagedAction(
    memoryId: string,
    page: number = 1,
    pageSize: number = 50,
    search?: string
) {
    try {
        const authCtx = await requireUser();
        const hasTm = (prisma as any).translationMemoryEntry;
        if (!hasTm) return { success: false, error: '当前数据模型未启用 MemoryEntry' } as const;
        await requireOwnedMemory(memoryId, authCtx);
        const where: any = { memoryId };
        if (search && search.trim()) {
            where.OR = [
                { sourceText: { contains: search, mode: 'insensitive' } },
                { targetText: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
            ];
        }
        const take = Math.max(1, Math.min(200, pageSize));
        const skip = Math.max(0, (page - 1) * take);
        const [total, items] = await Promise.all([
            (prisma as any).translationMemoryEntry.count({ where }),
            (prisma as any).translationMemoryEntry.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
        ]);
        return { success: true, data: items, total, page, pageSize: take } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '加载记忆库内容失败，请稍后重试。'),
        } as const;
    }
}

// 记忆库检索 - 支持向量检索、BM25 检索和混合检索
export async function searchMemoryAction(
    query: string,
    opts?: {
        limit?: number;
        searchConfig?: Partial<HybridSearchConfig>;
    }
) {
    const authCtx = await requireUser();
    return searchMemoryForOwner(query, authCtx, opts);
}

// 在指定记忆库内进行检索 - 支持混合检索
export async function searchMemoryInLibraryAction(
    memoryId: string,
    query: string,
    limit: number = 50,
    searchConfig?: Partial<HybridSearchConfig>
) {
    try {
        const safeLimit = Math.max(
            1,
            Math.min(200, Number.isFinite(limit) ? Math.floor(limit) : 50)
        );
        const authCtx = await requireUser();
        const hasEntry = (prisma as any).translationMemoryEntry;
        if (!hasEntry)
            return {
                success: false,
                error: MEMORY_SEARCH_UNAVAILABLE_MESSAGE,
                data: [] as Array<{
                    id: string;
                    sourceText: string;
                    targetText: string;
                    notes?: string | null;
                    score?: number;
                }>,
            } as const;
        const memory = await requireOwnedMemory(memoryId, authCtx);
        if (!query?.trim()) return { success: true, data: [] as any[] } as const;

        // Keep library search on the same owner-scoped retrieval path as the
        // API and agents. This is what makes keyword-only, vector-only and
        // hybrid failures follow the configured semantics everywhere.
        const result = await searchMemoryForOwner(query, authCtx, {
            limit: safeLimit,
            searchConfig,
            memoryIds: [memory.id],
        });
        if (!result.success) {
            return {
                success: false,
                error: result.error || '检索失败',
                data: [] as any[],
                configuredMode: result.configuredMode,
                effectiveMode: result.effectiveMode,
                unavailableLegs: result.unavailableLegs,
            } as const;
        }

        const ids = result.data.map(entry => entry.id);
        const rows: Array<{
            id: string;
            sourceText: string;
            targetText: string;
            notes?: string | null;
        }> = ids.length
            ? await (prisma as any).translationMemoryEntry.findMany({
                  where: { id: { in: ids }, memoryId: memory.id },
                  select: { id: true, sourceText: true, targetText: true, notes: true },
              })
            : [];
        const rowMap = new Map(rows.map(row => [row.id, row]));
        const data = result.data
            .map(entry => {
                const row = rowMap.get(entry.id);
                return row
                    ? {
                          ...row,
                          score: entry.score,
                          searchMode: entry.searchMode,
                          vectorScore: entry.vectorScore,
                          keywordScore: entry.keywordScore,
                      }
                    : null;
            })
            .filter(Boolean);

        logger.log(
            `[SEARCH_LIBRARY] Found ${data.length} results in library ${memoryId} using ${result.effectiveMode} mode`
        );
        return {
            success: true,
            data,
            mode: result.effectiveMode,
            configuredMode: result.configuredMode,
            effectiveMode: result.effectiveMode,
            degraded: result.degraded,
            unavailableLegs: result.unavailableLegs,
        } as const;
    } catch (error) {
        // Authorization failures are already a small, intentional public
        // vocabulary. Database/provider failures must not escape a Server
        // Action merely because this page also sanitizes them in its UI.
        if (error instanceof GuardError) {
            return { success: false, error: error.message, data: [] as any[] } as const;
        }
        return {
            success: false,
            error: memorySearchPublicErrorMessage(error),
            data: [] as any[],
        } as const;
    }
}

// 重新为指定记忆库构建/补全向量索引（Postgres pgvector）
export async function backfillMemoryVectorsAction(
    memoryId: string,
    opts?: { batchSize?: number; max?: number }
) {
    try {
        const authCtx = await requireUser();
        const hasEntry = (prisma as any).translationMemoryEntry;
        if (!hasEntry) return { success: false, error: '当前数据模型未启用 MemoryEntry' } as const;
        const memory = await requireOwnedMemory(memoryId, authCtx);
        const batchSize = Math.max(1, Math.min(200, opts?.batchSize || 100));
        const max = Math.max(1, Math.min(100000, opts?.max || 20000));

        // 分页遍历，避免一次性取太多
        let totalUpserted = 0;
        let cursor: string | null = null;
        while (totalUpserted < max) {
            const take = Math.min(batchSize, max - totalUpserted);
            const rows: Array<{
                id: string;
                sourceText: string;
                targetText: string;
                sourceLang?: string | null;
                targetLang?: string | null;
                createdAt: Date;
            }> = await (prisma as any).$queryRaw`
                SELECT
                    e.id,
                    e."sourceText",
                    e."targetText",
                    e."sourceLang",
                    e."targetLang",
                    e."createdAt"
                FROM "TranslationMemoryEntry" e
                WHERE e."memoryId" = ${memory.id}
                  AND e.embedding IS NULL
                  AND (${cursor}::text IS NULL OR e.id > ${cursor})
                ORDER BY e.id ASC
                LIMIT ${take}
            `;
            if (!rows.length) break;
            cursor = rows[rows.length - 1]?.id || null;

            const texts = rows.map(
                r => `${String(r.sourceText || '')}\n${String(r.targetText || '')}`
            );
            let vectors: number[][] = [];
            try {
                logger.log(
                    `[BACKFILL] 生成第 ${totalUpserted + 1}-${totalUpserted + rows.length} 条记录的向量...`
                );
                vectors = await embedBatchAction(texts);
                assertEmbeddingBatch(vectors, rows.length, '记忆向量回填');
                logger.log(`[BACKFILL] 成功生成 ${vectors.length} 个向量`);
            } catch (error) {
                logger.error(`[BACKFILL] 嵌入向量生成失败:`, error);
                throw error;
            }
            try {
                const points = rows.map((r, i) => ({
                    id: r.id,
                    text: texts[i] || '',
                    vector: vectors[i]!,
                    meta: {
                        memoryId: memory.id,
                        sourceLang: r.sourceLang,
                        targetLang: r.targetLang,
                        tenantId: authCtx.tenantId || null,
                        userId: authCtx.userId,
                    },
                }));

                logger.log(
                    `[BACKFILL] 准备写入 Postgres 向量索引: ${points.length}/${rows.length} 条记录有有效向量`
                );

                await upsertVectors({ collection: 'TranslationMemory', points });
                logger.log(`[BACKFILL] 成功写入 Postgres 向量索引: ${points.length} 条记录`);
                totalUpserted += points.length;
            } catch (error) {
                logger.error(`[BACKFILL] Postgres 向量索引写入失败:`, error);
                throw error;
            }
            if (rows.length < take) break;
        }
        const remainingRows: Array<{ count: number }> = await (prisma as any).$queryRaw`
            SELECT COUNT(*)::int AS count
            FROM "TranslationMemoryEntry"
            WHERE "memoryId" = ${memory.id} AND embedding IS NULL
        `;
        return {
            success: true,
            data: { upserted: totalUpserted, remaining: Number(remainingRows[0]?.count || 0) },
        } as const;
    } catch (error) {
        return {
            success: false,
            error: memoryActionErrorMessage(error, '重建记忆向量失败，请稍后重试。'),
        } as const;
    }
}
