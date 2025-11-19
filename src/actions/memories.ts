"use server";

import { prisma } from "@/lib/db";
import { embedBatchAction, embedTextAction } from "@/actions/embedding";
import { upsertVectors, searchVectors, hybridSearch, searchKeywords } from "@/lib/vector/milvus";
import { HybridSearchConfig } from "@/types/hybrid-search";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

type ImportInput = {
  file: File;
  memoryId?: string;
  sourceLang?: string;
  targetLang?: string;
  sourceKey?: string;
  targetKey?: string;
  notesKey?: string;
};

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [] as Array<{ source: string; target: string; notes?: string }>;
  const firstLine = lines[0] || "";
  const headers = firstLine.split(/,|\t/).map((h) => h.trim().toLowerCase());
  const idx = (cands: string[]) => cands.map((c) => headers.indexOf(c)).find((i) => i >= 0) ?? -1;
  const si = idx(["source", "src", "源", "原文"]);
  const ti = idx(["target", "tgt", "译", "译文"]);
  const ni = idx(["notes", "note", "备注"]);
  const out: Array<{ source: string; target: string; notes?: string }> = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/,|\t/);
    const s = si >= 0 ? String(cols[si] ?? "").trim() : "";
    const t = ti >= 0 ? String(cols[ti] ?? "").trim() : "";
    const n = ni >= 0 ? String(cols[ni] ?? "").trim() : "";
    if (s && t) out.push({ source: s, target: t, notes: n || undefined });
  }
  return out;
}

function parseExcel(buf: Buffer, mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const name = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined;
  if (!name) return [] as Array<{ source: string; target: string; notes?: string }>;
  const ws = wb.Sheets[name];
  const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: "" }) : [];
  const norm = (s: string) => String(s || "").trim().toLowerCase();
  const srcKey = norm(mapping?.sourceKey || "source");
  const tgtKey = norm(mapping?.targetKey || "target");
  const noteKey = norm(mapping?.notesKey || "notes");
  const out: Array<{ source: string; target: string; notes?: string }> = [];
  for (const r of rows) {
    const kv: Record<string, any> = {};
    for (const k of Object.keys(r)) kv[norm(k)] = r[k];
    const s = String(kv[srcKey] ?? kv["源"] ?? kv["source"] ?? "").trim();
    const t = String(kv[tgtKey] ?? kv["译"] ?? kv["target"] ?? "").trim();
    const n = String(kv[noteKey] ?? kv["备注"] ?? kv["notes"] ?? "").trim();
    if (s && t) out.push({ source: s, target: t, notes: n || undefined });
  }
  return out;
}

function parseTMX(xml: string, srcPref?: string, tgtPref?: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const obj: any = parser.parse(xml);
  const body = obj?.tmx?.body || obj?.TMX?.body;
  const tus = Array.isArray(body?.tu) ? body.tu : body?.tu ? [body.tu] : [];
  const out: Array<{ source: string; target: string; notes?: string }> = [];
  for (const tu of tus) {
    const tuv = Array.isArray(tu?.tuv) ? tu.tuv : tu?.tuv ? [tu.tuv] : [];
    const pick = (pref?: string) => (pref ? tuv.find((x: any) => String(x?.["@_xml:lang"] || x?.["@_lang"] || "").toLowerCase().startsWith(pref.toLowerCase())) : undefined);
    let s = pick(srcPref);
    let t = pick(tgtPref);
    if (!s || !t) {
      if (tuv.length >= 2) {
        s = tuv[0];
        t = tuv[1];
      }
    }
    const sv = String(s?.seg ?? s?.seg?.["#text"] ?? "").trim();
    const tv = String(t?.seg ?? t?.seg?.["#text"] ?? "").trim();
    if (sv && tv) out.push({ source: sv, target: tv });
  }
  return out;
}

export async function importMemoryAction(input: ImportInput) {
  const { file, memoryId, sourceLang, targetLang, sourceKey, targetKey, notesKey } = input;
  const name = (file as any).name || "upload";
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  let entries: Array<{ source: string; target: string; notes?: string }> = [];
  if (ext === "tmx" || ext === "xml") entries = parseTMX(buf.toString("utf-8"), sourceLang, targetLang);
  else if (ext === "csv" || ext === "tsv") entries = parseCSV(buf.toString("utf-8"));
  else if (ext === "xlsx" || ext === "xls") entries = parseExcel(buf, { sourceKey, targetKey, notesKey });
  else return { success: false, error: "仅支持 TMX/CSV/TSV/XLSX/XLS" } as const;

  const hasTm = (prisma as any).translationMemory && (prisma as any).translationMemoryEntry;
  if (!hasTm) {
    // 降级写入 DictionaryEntry，但仍然执行向量化并入索到 Milvus
    if (entries.length > 0) {
      await prisma.$transaction(
        entries.map((e) =>
          prisma.dictionaryEntry.create({
            data: {
              dictionaryId: "global-memory",
              sourceText: e.source,
              targetText: e.target,
              notes: e.notes ?? null,
            },
          })
        )
      );
    }
    return { success: true, data: { total: entries.length }, fallback: true } as const;
  }

  let targetMemoryId = memoryId;
  if (!targetMemoryId) {
    const mem = await (prisma as any).translationMemory.upsert({
      where: { id: "global-memory" },
      update: {},
      create: { id: "global-memory", name: "全局记忆库", description: "默认导入" },
    });
    targetMemoryId = mem.id;
  }

  if (entries.length > 0) {
    // 生成 embedding（源+译合并，有助对齐语篇检索）
    // 分批处理，避免超过 API 限制
    let vectors: number[][] = [];
    try {
      console.log(`[MEMORY_IMPORT] 开始生成 ${entries.length} 条记录的嵌入向量...`);
      const texts = entries.map(e => `${e.source}\n${e.target}`);
      const batchSize = 200; // 设置为 200，留一些余量

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        console.log(`[MEMORY_IMPORT] 处理第 ${i + 1}-${Math.min(i + batch.length, texts.length)} 条记录...`);
        const batchVectors = await embedBatchAction(batch);
        vectors.push(...batchVectors);
      }

      console.log(`[MEMORY_IMPORT] 成功生成 ${vectors.length} 个向量，第一个向量维度: ${vectors[0]?.length || 0}`);
    } catch (error) {
      console.error(`[MEMORY_IMPORT] 嵌入向量生成失败:`, error);
    }
    const created = await prisma.$transaction(
      entries.map((e) =>
        (prisma as any).translationMemoryEntry.create({
          data: {
            memoryId: targetMemoryId!,
            sourceText: e.source,
            targetText: e.target,
            notes: e.notes ?? null,
            sourceLang,
            targetLang,
          },
        })
      )
    );
    // 写入 Milvus（TranslationMemory collection）
    try {
      const points = created.map((row: any, i: number) => ({
        id: row.id,
        text: `${row.sourceText}\n${row.targetText}`,
        vector: vectors[i] || [],
        meta: { memoryId: row.memoryId, sourceLang, targetLang },
      })).filter((p: { vector: number[] }) => Array.isArray(p.vector) && p.vector.length);

      console.log(`[MEMORY_IMPORT] 准备写入 Milvus: ${points.length}/${created.length} 条记录有有效向量`);

      if (points.length) {
        await upsertVectors({ collection: 'TranslationMemory', points });
        console.log(`[MEMORY_IMPORT] 成功写入 Milvus: ${points.length} 条记录`);
      } else {
        console.warn(`[MEMORY_IMPORT] 警告: 没有有效向量可写入 Milvus`);
      }
    } catch (error) {
      console.error(`[MEMORY_IMPORT] Milvus 写入失败:`, error);
      // 重新抛出错误，让调用者知道有问题
      throw new Error(`向量索引写入失败: ${error}`);
    }
  }
  return { success: true, data: { total: entries.length } } as const;
}

// 允许从客户端直接以 Server Action 方式调用（FormData）
export async function importMemoryFromForm(form: FormData) {
  'use server';
  try {
    const file = form.get('file');
    if (!(file instanceof File)) return { success: false, error: '缺少文件（file）' } as const;
    const memoryId = (form.get('memoryId') as string) || undefined;
    const sourceLang = (form.get('sourceLang') as string) || undefined;
    const targetLang = (form.get('targetLang') as string) || undefined;
    const sourceKey = (form.get('sourceKey') as string) || undefined;
    const targetKey = (form.get('targetKey') as string) || undefined;
    const notesKey = (form.get('notesKey') as string) || undefined;
    return await importMemoryAction({ file, memoryId, sourceLang, targetLang, sourceKey, targetKey, notesKey });
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) } as const;
  }
}

export async function listMemoriesAction() {
  try {
    const hasTm = (prisma as any).translationMemory;
    if (!hasTm) return { success: true, data: [{ id: "global-memory", name: "全局记忆库" }] };
    const rows = await (prisma as any).translationMemory.findMany({
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
      orderBy: { createdAt: 'desc' }
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
    return { success: false, error: "获取记忆库列表失败" };
  }
}

export async function createMemoryAction(input: { name: string; description?: string }) {
  try {
    const hasTm = (prisma as any).translationMemory;
    if (!hasTm) {
      return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
    }
    const mem = await (prisma as any).translationMemory.create({ data: { name: input.name, description: input.description ?? null } });
    return { success: true, data: mem } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '创建失败' } as const;
  }
}

export async function deleteMemoryAction(memoryId: string) {
  try {
    const hasTm = (prisma as any).translationMemory;
    if (!hasTm) return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
    await (prisma as any).translationMemory.delete({ where: { id: memoryId } });
    return { success: true } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '删除失败' } as const;
  }
}

export async function updateMemoryLanguagesAction(memoryId: string, input: { sourceLang?: string; targetLang?: string }) {
  try {
    const hasTm = (prisma as any).translationMemory;
    const hasEntry = (prisma as any).translationMemoryEntry;
    if (!hasTm || !hasEntry) return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
    if (!memoryId) return { success: false, error: '缺少 memoryId' } as const;

    const data: any = {};
    if (input.sourceLang !== undefined) data.sourceLang = input.sourceLang || null;
    if (input.targetLang !== undefined) data.targetLang = input.targetLang || null;
    if (!Object.keys(data).length) return { success: false, error: '未提供需要更新的字段' } as const;

    const res = await (prisma as any).translationMemoryEntry.updateMany({
      where: { memoryId },
      data
    });

    return { success: true, data: { updated: res.count } } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '更新失败' } as const;
  }
}

export async function getMemoryByIdAction(memoryId: string) {
  try {
    const hasTm = (prisma as any).translationMemory;
    if (!hasTm) return { success: false, error: '当前数据模型未启用 TranslationMemory' } as const;
    const mem = await (prisma as any).translationMemory.findUnique({ where: { id: memoryId }, include: { _count: { select: { entries: true } } } });
    if (!mem) return { success: false, error: '未找到记忆库' } as const;
    return { success: true, data: mem } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '查询失败' } as const;
  }
}

export async function getMemoryEntriesPagedAction(memoryId: string, page: number = 1, pageSize: number = 50, search?: string) {
  try {
    const hasTm = (prisma as any).translationMemoryEntry;
    if (!hasTm) return { success: false, error: '当前数据模型未启用 MemoryEntry' } as const;
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
      (prisma as any).translationMemoryEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })
    ]);
    return { success: true, data: items, total, page, pageSize: take } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '获取词条失败' } as const;
  }
}


// 记忆库检索 - 支持向量检索、BM25 检索和混合检索
export async function searchMemoryAction(
  query: string,
  opts?: {
    tenantId?: string;
    limit?: number;
    searchConfig?: Partial<HybridSearchConfig>;
  }
) {
  try {
    const hasTm = (prisma as any).translationMemoryEntry;
    if (!hasTm) return { success: true, data: [] as Array<{ id: string; source: string; target: string; score: number }> } as const;

    const tokenize = (text: string) => {
      const t = String(text || '').toLowerCase();
      const words = t.split(/[\s,.;:!?，。；：！、()\[\]{}"'“”‘’<>\-_/]+/).filter(Boolean);
      const chars = Array.from(t.replace(/\s+/g, '')) as string[];
      const bigrams: string[] = [];
      for (let i = 0; i < Math.min(Math.max(0, chars.length - 1), 50); i++) {
        const left = chars[i] || '';
        const right = chars[i + 1] || '';
        const bg = String(left) + String(right);
        if (bg.trim().length >= 2) bigrams.push(bg);
      }
      return Array.from(new Set([...words, ...bigrams]));
    };

    if (!query?.trim()) return { success: true, data: [] as any[] } as const;
    const limit = Math.max(1, opts?.limit || 5);
    const searchConfig = opts?.searchConfig;

    // 使用混合检索（向量 + BM25）
    try {
      const qv = await embedTextAction(query);
      if (Array.isArray(qv) && qv.length) {
        const hits = await hybridSearch({
          collection: 'TranslationMemory',
          query,
          vector: qv,
          config: {
            finalTopK: limit * 2, // 多取一些结果
            ...searchConfig
          }
        });

        if (hits?.length) {
          const ids = hits.map(h => h.id);
          const rows: Array<{ id: string; sourceText: string; targetText: string }> = await (prisma as any).translationMemoryEntry.findMany({
            where: { id: { in: ids } },
            select: { id: true, sourceText: true, targetText: true }
          });
          const map = new Map<string, { id: string; sourceText: string; targetText: string }>(rows.map((r) => [r.id, r]));
          const merged = hits.map(h => ({
            id: h.id,
            source: map.get(h.id)?.sourceText || '',
            target: map.get(h.id)?.targetText || '',
            score: h.score || 0,
            searchMode: h.source,
            vectorScore: h.vectorScore,
            keywordScore: h.keywordScore
          })).filter(x => x.source).slice(0, limit);

          if (merged.length) {
            console.log(`[SEARCH] Hybrid search found ${merged.length} results using ${searchConfig?.mode || 'hybrid'} mode`);
            return { success: true, data: merged, searchMode: 'hybrid' } as const;
          }
        }
      }
    } catch (error) {
      console.error('[SEARCH] Hybrid search error:', error);
    }

    // BM 兜底
    const tokens = tokenize(query).slice(0, 20);
    if (!tokens.length) return { success: true, data: [] as any[] } as const;
    const ors = tokens.map(tok => ({ sourceText: { contains: tok, mode: 'insensitive' as const } }));
    const rows = await (prisma as any).translationMemoryEntry.findMany({
      where: {
        OR: ors,
        ...(opts?.tenantId ? { memory: { tenantId: opts.tenantId } } : {}),
      },
      select: { id: true, sourceText: true, targetText: true },
      take: Math.max(50, limit * 20),
      orderBy: { createdAt: 'desc' }
    });
    const tokenSet = new Set(tokens);
    const scored = rows.map((r: any) => {
      const sTokens = tokenize(r.sourceText);
      const inter = sTokens.filter((t: string) => tokenSet.has(t));
      const recall = inter.length / Math.max(1, tokens.length);
      const precision = inter.length / Math.max(1, sTokens.length);
      const f1 = (2 * recall * precision) / Math.max(1e-6, recall + precision);
      const score = 0.6 * recall + 0.4 * f1;
      return { id: r.id, source: r.sourceText, target: r.targetText, score };
    }).sort((a: any, b: any) => b.score - a.score);
    return { success: true, data: scored.slice(0, limit) } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '检索失败' } as const;
  }
}


// 在指定记忆库内进行检索 - 支持混合检索
export async function searchMemoryInLibraryAction(
  memoryId: string,
  query: string,
  limit: number = 50,
  searchConfig?: Partial<HybridSearchConfig>
) {
  try {
    const hasEntry = (prisma as any).translationMemoryEntry;
    if (!hasEntry) return { success: true, data: [] as Array<{ id: string; sourceText: string; targetText: string; notes?: string | null; score?: number }> } as const;
    if (!query?.trim()) return { success: true, data: [] as any[] } as const;

    // 使用混合检索（向量 + BM25）
    try {
      const qv = await embedTextAction(query);
      if (Array.isArray(qv) && qv.length) {
        const hits = await hybridSearch({
          collection: 'TranslationMemory',
          query,
          vector: qv,
          config: {
            finalTopK: Math.max(50, limit * 5), // 多取一些再内存过滤
            ...searchConfig
          },
          filter: `meta like "%${memoryId}%"` // 基于 meta 字段过滤记忆库
        });

        // 进一步过滤确保属于指定记忆库
        const filteredHits = hits.filter((h: any) => String(h?.meta?.memoryId || '') === String(memoryId));

        if (filteredHits.length) {
          const take = Math.min(limit, filteredHits.length);
          const top = filteredHits.slice(0, take);
          const ids = top.map((h: any) => String(h.id));
          const rows: Array<{ id: string; sourceText: string; targetText: string; notes?: string | null }> = await (prisma as any).translationMemoryEntry.findMany({
            where: { id: { in: ids }, memoryId },
            select: { id: true, sourceText: true, targetText: true, notes: true },
          });
          const rowMap = new Map(rows.map(r => [r.id, r]));
          const merged = top
            .map((h: any) => {
              const r = rowMap.get(String(h.id));
              return r ? {
                ...r,
                score: Number(h.score || 0),
                searchMode: h.source,
                vectorScore: h.vectorScore,
                keywordScore: h.keywordScore
              } : null;
            })
            .filter(Boolean) as Array<{
              id: string;
              sourceText: string;
              targetText: string;
              notes?: string | null;
              score?: number;
              searchMode?: string;
              vectorScore?: number;
              keywordScore?: number;
            }>;

          if (merged.length) {
            console.log(`[SEARCH_LIBRARY] Hybrid search found ${merged.length} results in library ${memoryId}`);
            return { success: true, data: merged, mode: 'hybrid' as const } as const;
          }
        }
      }
    } catch (error) {
      console.error('[SEARCH_LIBRARY] Hybrid search error:', error);
    }

    // 关键词兜底（限定 memoryId）
    const t = String(query || '').toLowerCase();
    const tokens = Array.from(new Set(
      t.split(/[\s,.;:!?，。；：！、()\[\]{}"'“”‘’<>\-_/]+/).filter(Boolean)
    )).slice(0, 20);
    if (!tokens.length) return { success: true, data: [] as any[] } as const;
    const ors = tokens.map(tok => ({ sourceText: { contains: tok, mode: 'insensitive' as const } }));
    const rows = await (prisma as any).translationMemoryEntry.findMany({
      where: { memoryId, OR: ors },
      select: { id: true, sourceText: true, targetText: true, notes: true },
      take: Math.max(50, limit * 3),
      orderBy: { createdAt: 'desc' }
    });
    const tokenSet = new Set(tokens);
    const scored = rows
      .map((r: any) => {
        const text = `${String(r.sourceText || '')} ${String(r.targetText || '')}`.toLowerCase();
        const words = text.split(/[\s,.;:!?，。；：！、()\[\]{}"'“”‘’<>\-_/]+/).filter(Boolean);
        const inter = words.filter((w: string) => tokenSet.has(w));
        const recall = inter.length / Math.max(1, tokens.length);
        const precision = inter.length / Math.max(1, words.length);
        const f1 = (2 * recall * precision) / Math.max(1e-6, recall + precision);
        const score = 0.6 * recall + 0.4 * f1;
        return { ...r, score };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);
    return { success: true, data: scored, mode: 'keyword' as const } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '检索失败' } as const;
  }
}

// 重新为指定记忆库构建/补全向量索引（Milvus）
export async function backfillMemoryVectorsAction(memoryId: string, opts?: { batchSize?: number; max?: number }) {
  try {
    const hasEntry = (prisma as any).translationMemoryEntry;
    if (!hasEntry) return { success: false, error: '当前数据模型未启用 MemoryEntry' } as const;
    const batchSize = Math.max(1, Math.min(200, opts?.batchSize || 100));
    const max = Math.max(1, Math.min(20000, opts?.max || 5000));

    // 分页遍历，避免一次性取太多
    let totalUpserted = 0;
    let cursor: string | null = null;
    while (totalUpserted < max) {
      const take = Math.min(batchSize, max - totalUpserted);
      const rows: Array<{ id: string; sourceText: string; targetText: string; sourceLang?: string | null; targetLang?: string | null; createdAt: Date }>
        = await (prisma as any).translationMemoryEntry.findMany({
          where: { memoryId },
          select: { id: true, sourceText: true, targetText: true, sourceLang: true, targetLang: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          take,
        });
      if (!rows.length) break;
      cursor = rows[rows.length - 1]?.id || null;

      const texts = rows.map(r => `${String(r.sourceText || '')}\n${String(r.targetText || '')}`);
      let vectors: number[][] = [];
      try {
        console.log(`[BACKFILL] 生成第 ${totalUpserted + 1}-${totalUpserted + rows.length} 条记录的向量...`);
        vectors = await embedBatchAction(texts);
        console.log(`[BACKFILL] 成功生成 ${vectors.length} 个向量`);
      } catch (error) {
        console.error(`[BACKFILL] 嵌入向量生成失败:`, error);
        throw error;
      }
      try {
        const points = rows.map((r, i) => ({
          id: r.id,
          text: texts[i] || '',
          vector: Array.isArray(vectors[i]) ? vectors[i]! : [],
          meta: { memoryId, sourceLang: r.sourceLang, targetLang: r.targetLang },
        })).filter((p) => Array.isArray(p.vector) && p.vector.length);

        console.log(`[BACKFILL] 准备写入 Milvus: ${points.length}/${rows.length} 条记录有有效向量`);

        if (points.length) {
          await upsertVectors({ collection: 'TranslationMemory', points });
          console.log(`[BACKFILL] 成功写入 Milvus: ${points.length} 条记录`);
        }
        totalUpserted += rows.length;
      } catch (error) {
        console.error(`[BACKFILL] Milvus 写入失败:`, error);
        throw error;
      }
      if (rows.length < take) break;
    }
    return { success: true, data: { upserted: totalUpserted } } as const;
  } catch (e: any) {
    return { success: false, error: e?.message || '重建向量失败' } as const;
  }
}

