"use server"

import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { XMLParser } from "fast-xml-parser"
import {
    createDictionaryDB, 
    findDictionaryByIdDB, 
    findAllDictionariesDB,
    findAllDictionariesWithEntriesDB, 
    updateDictionaryByIdDB, 
    deleteDictionaryByIdDB, 
    findOrCreateDictionaryDB,
    findDictionariesGivenVisibilityDB,
} from "@/db/dictionary"
import {createDictionaryEntryDB, 
    updateDictionaryEntryByIdDB, 
    deleteDictionaryEntryByIdDB, 
    findDictionaryEntriesDB, 
    countDictionaryEntriesDB,
    createDictionaryEntriesBulkDB,  
    deleteDictionaryEntriesByDictionaryIdDB, 
    findExistingDictionaryEntriesMapDB, 
    findCandidateTranslationsForSourcesDB,
    findBlankDictionaryEntriesBySourcesDB
} from "@/db/dictionaryEntry"

// 创建词典
export async function createDictionaryAction(data: {
    name: string
    description?: string
    domain: string
    visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE'
    userId?: string
    tenantId?: string
}) {
    try {
        const dictionary = await createDictionaryDB({
            name: data.name,
            description: data.description,
            domain: data.domain,
            visibility: data.visibility,
            userId: data.userId,
            tenantId: data.tenantId
        })
        
        revalidatePath("/dashboard/dictionaries")
        return { success: true, data: dictionary }
    } catch (error) {
        console.error("创建词典失败:", error)
        return { success: false, error: "创建词典失败" }
    }
}

// 获取所有词典
export async function getAllDictionariesAction() {
    try {
        const dictionaries = await findAllDictionariesDB()
        return { success: true, data: dictionaries }
    } catch (error) {
        console.error("获取词典失败:", error)
        return { success: false, error: "获取词典失败" }
    }
}

// 轻量列表（给设置选项用）
export async function getAllDictionariesLiteAction() {
    try {
        const dictionaries = await findAllDictionariesWithEntriesDB()
        return { success: true, data: dictionaries }
    } catch (error) {
        console.error("获取词典列表失败:", error)
        return { success: false, error: "获取词典列表失败" }
    }
}

// 获取公共词典
export async function fetchDictionariesAction(visibility: "public"|"private"|"project", userId?: string) {
    try {
        let dictionaries;
        if (visibility === "private" && userId){
            dictionaries = await findDictionariesGivenVisibilityDB('PRIVATE', 'desc', userId)
        }
        else if (visibility === "project"){
            dictionaries = await findDictionariesGivenVisibilityDB('PROJECT', 'desc')
        }
        else{
            dictionaries = await findDictionariesGivenVisibilityDB('PUBLIC')
        }
        return { success: true, data: dictionaries }
    } catch (error) {
        console.error("获取公共词典失败:", error)
        return { success: false, error: "获取公共词典失败" }
    }
}
 

// 获取词典详情
export async function fetchDictionaryByIdAction(id: string) {
    try {
        const dictionary = await findDictionaryByIdDB(id)
        
        return { success: true, data: dictionary }
    } catch (error) {
        console.error("获取词典详情失败:", error)
        return { success: false, error: "获取词典详情失败" }
    }
}

// 仅获取词典元信息（更快，避免一次性返回大量 entries）
export async function fetchDictionaryMetaByIdAction(id: string) {
    try {
        const dictionary = await findDictionaryByIdDB(id)
        return { success: true, data: dictionary };
    } catch (error) {
        console.error("获取词典元信息失败:", error);
        return { success: false, error: "获取词典元信息失败" };
    }
}

// 更新词典
export async function updateDictionaryAction(id: string, data: {
    name?: string
    description?: string
    domain?: string
    visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE'
}) {
    try {
        const dictionary = await updateDictionaryByIdDB(id, data)
        
        revalidatePath("/dashboard/dictionaries")
        return { success: true, data: dictionary }
    } catch (error) {
        console.error("更新词典失败:", error)
        return { success: false, error: "更新词典失败" }
    }
}

// 删除词典
export async function deleteDictionaryAction(id: string) {
    try {
        await deleteDictionaryByIdDB(id)
        revalidatePath("/dashboard/dictionaries")
        return { success: true }
    } catch (error) {
        console.error("删除词典失败:", error)
        return { success: false, error: "删除词典失败" }
    }
}

// 创建词典条目
export async function createDictionaryEntryAction(data: {
    sourceText: string
    targetText: string
    notes?: string
    dictionaryId: string
    origin?: string
    userId?: string
}) {
    try {
        const entry = await createDictionaryEntryDB({
            dictionaryId: data.dictionaryId,
            sourceText: data.sourceText,
            targetText: data.targetText,
            notes: data.notes,
            origin: data.origin ?? 'manual',
            createdById: data.userId,
            updatedById: data.userId,
        })
        
        revalidatePath("/dashboard/dictionaries")
        return { success: true, data: entry }
    } catch (error) {
        console.error("创建词典条目失败:", error)
        return { success: false, error: "创建词典条目失败" }
    }
}

// 更新词典条目
export async function updateDictionaryEntryAction(id: string, data: {
    sourceText?: string
    targetText?: string
    notes?: string
    enabled?: boolean
    userId?: string
}) {
    try {
        const entry = await updateDictionaryEntryByIdDB(id, {
            sourceText: data.sourceText,
            targetText: data.targetText,
            notes: data.notes,
            enabled: data.enabled,
            updatedById: data.userId,
        })
        
        revalidatePath("/dashboard/dictionaries")
        return { success: true, data: entry }
    } catch (error) {
        console.error("更新词典条目失败:", error)
        return { success: false, error: "更新词典条目失败" }
    }
}

// 删除词典条目
export async function deleteDictionaryEntryAction(id: string) {
    try {
        await deleteDictionaryEntryByIdDB(id)
        
        revalidatePath("/dashboard/dictionaries")
        return { success: true }
    } catch (error) {
        console.error("删除词典条目失败:", error)
        return { success: false, error: "删除词典条目失败" }
    }
}


// 获取词典的所有条目
export async function fetchDictionaryEntriesAction(dictionaryId: string, limit: number = 0) {
    try {
        const entries = await findDictionaryEntriesDB(dictionaryId, limit)
        
        return { success: true, data: entries }
    } catch (error) {
        console.error("获取词典条目失败:", error)
        return { success: false, error: "获取词典条目失败" }
    }
}

// 分页获取词典条目
export async function fetchDictionaryEntriesPagedAction(
    dictionaryId: string,
    page: number = 1,
    pageSize: number = 50,
    searchTerm?: string,
    originFilter?: string
) {
    try {
        const where: any = { dictionaryId };
        if (searchTerm && searchTerm.trim()) {
            where.OR = [
                { sourceText: { contains: searchTerm, mode: "insensitive" } },
                { targetText: { contains: searchTerm, mode: "insensitive" } },
                { notes: { contains: searchTerm, mode: "insensitive" } },
            ];
        }
        if (originFilter && originFilter.trim()) {
            where.origin = { equals: originFilter } as any;
        }

        const skip = Math.max(0, (page - 1) * pageSize);
        const take = Math.max(1, Math.min(500, pageSize));

        const [total, entries] = await Promise.all([
            countDictionaryEntriesDB(where),
            findDictionaryEntriesDB(where, skip, take)
        ]);

        return { success: true, data: entries, total, page, pageSize };
    } catch (error) {
        console.error("分页获取词典条目失败:", error);
        return { success: false, error: "分页获取词典条目失败" };
    }
}

// 搜索词典条目
export async function searchDictionaryEntriesAction(dictionaryId: string, searchTerm: string) {
    try {
        const where: any = {
            dictionaryId,
            OR: [
                { sourceText: { contains: searchTerm, mode: "insensitive" } },
                { targetText: { contains: searchTerm, mode: "insensitive" } },
                { notes: { contains: searchTerm, mode: "insensitive" } },
            ]
        }
        const entries = await findDictionaryEntriesDB(where, 0, 30)
        
        return { success: true, data: entries }
    } catch (error) {
        console.error("搜索词典条目失败:", error)
        return { success: false, error: "搜索词典条目失败" }
    }
}

// 导入：Excel (xlsx)
export async function importDictionaryFromXlsxAction(
    dictionaryId: string,
    fileBuffer: ArrayBuffer | Buffer,
    mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }
) {
    try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(fileBuffer, { type: 'buffer' });
        const first = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined as unknown as string;
        const ws = first ? wb.Sheets[first] : undefined as any;
        const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
        const norm = (k: string) => String(k || '').trim().toLowerCase();
        const srcKey = mapping?.sourceKey || 'source';
        const tgtKey = mapping?.targetKey || 'target';
        const noteKey = mapping?.notesKey || 'notes';
        const entries = rows.map((r) => {
            const keys = Object.keys(r);
            const kv: any = {};
            for (const k of keys) kv[norm(k)] = r[k];
            return {
                sourceText: String(kv[norm(srcKey)] ?? kv['源'] ?? kv['source'] ?? ''),
                targetText: String(kv[norm(tgtKey)] ?? kv['译'] ?? kv['target'] ?? ''),
                notes: String(kv[norm(noteKey)] ?? kv['备注'] ?? kv['notes'] ?? ''),
            };
        }).filter(e => e.sourceText && e.targetText);

        if (!entries.length) return { success: false, error: 'Excel 未检测到有效的 source/target 列' };

        await createDictionaryEntriesBulkDB(dictionaryId, entries.map(e => ({ sourceText: e.sourceText, targetText: e.targetText, notes: e.notes ?? null })))
        revalidatePath("/dashboard/dictionaries");
        return { success: true, count: entries.length };
    } catch (e) {
        console.error('Excel 导入失败:', e);
        return { success: false, error: 'Excel 导入失败' };
    }
}

// 导入：TBX（简化版：提取 termEntry > langSet 与 tig 的 term）
export async function importDictionaryFromTbxAction(dictionaryId: string, xmlText: string) {
    try {
        const { XMLParser } = await import('fast-xml-parser');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', textNodeName: 'text' });
        const obj: any = parser.parse(xmlText);
        const body = obj?.TBX?.text?.body || obj?.tbx?.text?.body || obj?.TBX?.body || obj?.tbx?.body;
        const entries: Array<{ sourceText: string; targetText: string; notes?: string }> = [];

        const asArray = (x: any) => Array.isArray(x) ? x : (x ? [x] : []);
        const termEntries = asArray(body?.termEntry);
        for (const te of termEntries) {
            const langSets = asArray(te?.langSet);
            if (langSets.length < 2) continue;
            const getTerm = (ls: any) => {
                const tig = asArray(ls?.tig)[0];
                const term = tig?.term ?? tig?.term?.text ?? tig?.text ?? '';
                return String(term || '').trim();
            };
            const s = getTerm(langSets[0]);
            const t = getTerm(langSets[1]);
            if (s && t) entries.push({ sourceText: s, targetText: t });
        }

        if (!entries.length) return { success: false, error: 'TBX 未检测到可导入的词条' };
        await createDictionaryEntriesBulkDB(dictionaryId, entries.map(e => ({ sourceText: e.sourceText, targetText: e.targetText, notes: null })))
        revalidatePath("/dashboard/dictionaries");
        return { success: true, count: entries.length };
    } catch (e) {
        console.error('TBX 导入失败:', e);
        return { success: false, error: 'TBX 导入失败' };
    }
}

// 批量导入词条（从前端已解析的数据分批提交，避免大文件 Buffer 传输和超时）
export async function bulkImportDictionaryEntriesAction(
    dictionaryId: string,
    entries: Array<{ sourceText: string; targetText: string; notes?: string }>
) {
    try {
        if (!Array.isArray(entries) || entries.length === 0) {
            return { success: true, count: 0 };
        }

        await createDictionaryEntriesBulkDB(dictionaryId, entries.map(e => ({ sourceText: e.sourceText, targetText: e.targetText, notes: e.notes ?? null })))

        revalidatePath("/dashboard/dictionaries");
        return { success: true, count: entries.length };
    } catch (e) {
        console.error('批量导入失败:', e);
        return { success: false, error: '批量导入失败' };
    }
}

// —— Server Action：统一的导入入口（Excel/CSV/TBX + 模式） ——
type ParsedEntry = { sourceText: string; targetText: string; notes?: string }

function mapHeaders(headers: string[]): { sourceKey?: string; targetKey?: string; notesKey?: string } {
    const norm = (s: string) => s.trim().toLowerCase()
    let sourceKey: string | undefined
    let targetKey: string | undefined
    let notesKey: string | undefined
    for (const h of headers) {
        const n = norm(h)
        if (!sourceKey && (n.includes("source") || n.includes("源") || n === "src")) sourceKey = h
        if (!targetKey && (n.includes("target") || n.includes("译") || n.includes("目标") || n === "tgt")) targetKey = h
        if (!notesKey && (n.includes("note") || n.includes("备注") || n.includes("说明") || n === "notes")) notesKey = h
    }
    if (!sourceKey && headers[0]) sourceKey = headers[0]
    if (!targetKey && headers[1]) targetKey = headers[1]
    return { sourceKey, targetKey, notesKey }
}

function parseExcelToEntries(buffer: Buffer, mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }): ParsedEntry[] {
    const wb = XLSX.read(buffer, { type: "buffer" })
    const firstSheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined
    if (!firstSheetName) return []
    const sheet = wb.Sheets[firstSheetName] as XLSX.WorkSheet
    const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" }) : []
    if (rows.length === 0) return []
    const headers = Object.keys(rows[0] ?? {})
    const detected = mapHeaders(headers)
    const sourceKey = mapping?.sourceKey || detected.sourceKey
    const targetKey = mapping?.targetKey || detected.targetKey
    const notesKey = mapping?.notesKey || detected.notesKey
    const entries: ParsedEntry[] = []
    for (const r of rows) {
        const source = (sourceKey ? String(r[sourceKey] ?? "") : "").trim()
        const target = (targetKey ? String(r[targetKey] ?? "") : "").trim()
        const notes = (notesKey ? String(r[notesKey] ?? "") : "").trim()
        if (!source || !target) continue
        entries.push({ sourceText: source, targetText: target, notes: notes || undefined })
    }
    return entries
}

function parseCSVToEntries(text: string): ParsedEntry[] {
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (!lines.length) return []
    const first = lines[0] || ''
    const headers = first.split(/,|\t/)
    const detected = mapHeaders(headers)
    const srcIdx = headers.findIndex(h => h === detected.sourceKey)
    const tgtIdx = headers.findIndex(h => h === detected.targetKey)
    const noteIdx = headers.findIndex(h => h === detected.notesKey)
    const out: ParsedEntry[] = []
    for (const line of lines.slice(1)) {
        const cols = line.split(/,|\t/)
        const s = srcIdx >= 0 ? (cols[srcIdx] || '').trim() : ''
        const t = tgtIdx >= 0 ? (cols[tgtIdx] || '').trim() : ''
        const n = noteIdx >= 0 ? (cols[noteIdx] || '').trim() : ''
        if (s && t) out.push({ sourceText: s, targetText: t, notes: n || undefined })
    }
    return out
}

function parseTBXToEntries(xml: string, preferredSource?: string, preferredTarget?: string): ParsedEntry[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" })
    const json: any = parser.parse(xml)
    const tbx = json?.tbx || json?.TBX || json
    const body = tbx?.text?.body || tbx?.body || json?.body || json?.text?.body
    if (!body) return []
    let termEntries: any[] = body.termEntry || body["termEntry"] || []
    if (!Array.isArray(termEntries)) termEntries = [termEntries]
    const entries: ParsedEntry[] = []
    for (const te of termEntries) {
        let langSets: any[] = te?.langSet || te?.["langSet"] || []
        if (!Array.isArray(langSets)) langSets = [langSets]
        const normalized = langSets.map((ls: any) => {
            const lang: string = ls?.["@_xml:lang"] || ls?.["@_lang"] || ""
            const tig = ls?.tig || ls?.ntig || ls
            const termVal = tig?.term || tig?.termGrp?.term || tig?.text
            const term = Array.isArray(termVal) ? (termVal[0] ?? '') : termVal
            return { lang: (lang || '').toLowerCase(), term: String(term || '').trim() }
        }).filter((x: any) => x.term)
        if (normalized.length < 2) continue
        const pick = (code?: string) => code ? normalized.find((x: any) => x.lang.startsWith(code.toLowerCase())) : undefined
        let src = preferredSource ? pick(preferredSource) : undefined
        let tgt = preferredTarget ? pick(preferredTarget) : undefined
        if (!src || !tgt) {
            const langs: Record<string, any> = {}
            for (const x of normalized) if (!langs[x.lang]) langs[x.lang] = x
            const keys = Object.keys(langs)
            if (!src && keys[0]) src = langs[keys[0]]
            if (!tgt && keys[1]) tgt = langs[keys[1]]
        }
        if (src?.term && tgt?.term) entries.push({ sourceText: src.term, targetText: tgt.term })
    }
    return entries
}

async function importEntries(dictionaryId: string, entries: ParsedEntry[], mode: "append" | "overwrite" | "upsert") {
    let inserted = 0
    let updated = 0
    let skipped = 0
    if (entries.length === 0) return { inserted, updated, skipped }
    if (mode === "overwrite") {
        await deleteDictionaryEntriesByDictionaryIdDB(dictionaryId)
        for (const e of entries) {
            await createDictionaryEntryDB({
                dictionaryId,
                sourceText: e.sourceText,
                targetText: e.targetText,
                notes: e.notes ?? null,
                origin: 'apply:copied',
                createdById: undefined,
                updatedById: undefined,
            })
            inserted += 1
        }
        return { inserted, updated, skipped }
    }
    if (mode === "append") {
        for (const e of entries) {
            await createDictionaryEntryDB({
                dictionaryId,
                sourceText: e.sourceText,
                targetText: e.targetText,
                notes: e.notes ?? null,
                origin: 'apply:copied',
                createdById: undefined,
                updatedById: undefined,
            })
            inserted += 1
        }
        return { inserted, updated, skipped }
    }
    const existMap = await findExistingDictionaryEntriesMapDB(dictionaryId, entries.map(e => e.sourceText))
    for (const e of entries) {
        const id = existMap.get(e.sourceText)
        if (id) {
            await updateDictionaryEntryByIdDB(id, { targetText: e.targetText, notes: e.notes ?? null })
            updated += 1
        } else {
            await createDictionaryEntryDB({
                dictionaryId,
                sourceText: e.sourceText,
                targetText: e.targetText,
                notes: e.notes ?? null,
                origin: 'apply:copied',
                createdById: undefined,
                updatedById: undefined,
            })
            inserted += 1
        }
    }
    return { inserted, updated, skipped }
}

export async function importDictionaryAction(input: {
    dictionaryId: string,
    mode?: "upsert" | "append" | "overwrite",
    file: File,
    sourceLang?: string,
    targetLang?: string,
    sourceKey?: string,
    targetKey?: string,
    notesKey?: string,
}) {
    const { dictionaryId, mode = 'upsert', file, sourceLang, targetLang, sourceKey, targetKey, notesKey } = input
    const name = (file as any).name || 'upload'
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    const buf = Buffer.from(await file.arrayBuffer())
    let entries: ParsedEntry[] = []
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        if (ext === 'csv') entries = parseCSVToEntries(buf.toString('utf-8'))
        else entries = parseExcelToEntries(buf, { sourceKey, targetKey, notesKey })
    } else if (ext === 'tbx' || ext === 'xml') {
        entries = parseTBXToEntries(buf.toString('utf-8'), sourceLang, targetLang)
    } else {
        return { success: false, error: '不支持的文件类型，仅支持 .xlsx/.xls/.csv/.tbx' }
    }
    const { inserted, updated, skipped } = await importEntries(dictionaryId, entries, mode)
    revalidatePath('/dashboard/dictionaries')
    return { success: true, data: { inserted, updated, skipped, total: entries.length } }
}

// 统一的词典查询（按可见范围：PUBLIC / PROJECT(projectId) / PRIVATE(userId)）
export async function queryDictionaryEntriesByScopeAction(term: string, opts?: { tenantId?: string; userId?: string; limit?: number }) {
    try {
        const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
        if (!term || !term.trim()) return { success: true, data: [] as Array<{ term: string; translation: string; notes?: string }> };
        const orScopes: any[] = [ { visibility: 'PUBLIC' as any } ];
        // PROJECT 范围：按 projectId 过滤；若无特定 projectId 场景，这里保持为所有 PROJECT 词典
        // 保留租户参数以兼容未来多租户扩展，但不再作为 TEAM
        if (opts?.tenantId) orScopes.push({ visibility: 'PROJECT' as any });
        else orScopes.push({ visibility: 'PROJECT' as any });
        if (opts?.userId) orScopes.push({ visibility: 'PRIVATE' as any, userId: opts.userId });

        const rows = await (await import('@/db/dictionaryEntry')).findByScopeDB(term, orScopes, limit)
        if (!rows) return { success: true, data: [] as Array<{ term: string; translation: string; notes?: string }> }
        const visMap: Record<string, string> = { PUBLIC: '公共', PROJECT: '项目', PRIVATE: '私有' };
        return { success: true, data: rows.map((r: any) => ({ term: r.sourceText, translation: r.targetText, notes: r.notes || undefined, source: r?.dictionary ? `${visMap[r.dictionary.visibility as string] || r.dictionary.visibility} · ${r.dictionary.name}` : undefined })) };
    } catch (e) {
        return { success: false, error: (e as any)?.message || '查询失败' };
    }
}

// 精确匹配：仅按源文精确等值匹配，减少“包含”带来的噪声
export async function queryDictionaryEntriesExactByScope(term: string, opts?: { tenantId?: string; userId?: string; limit?: number }) {
    try {
        const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
        if (!term || !term.trim()) return { success: true, data: [] as Array<{ term: string; translation: string; notes?: string }> };
        const orScopes: any[] = [ { visibility: 'PUBLIC' as any } ];
        if (opts?.tenantId) orScopes.push({ visibility: 'PROJECT' as any });
        else orScopes.push({ visibility: 'PROJECT' as any });
        if (opts?.userId) orScopes.push({ visibility: 'PRIVATE' as any, userId: opts.userId });

        const rows = await (await import('@/db/dictionaryEntry')).findExactByScopeDB(term, orScopes, limit)
        if (!rows) return { success: true, data: [] as Array<{ id: string; dictionaryId: string; term: string; translation: string; notes?: string; origin?: string; source?: string }> }
        const visMap: Record<string, string> = { PUBLIC: '公共', PROJECT: '项目', PRIVATE: '私有' };
        return { success: true, data: rows.map((r: any) => ({ id: r.id, dictionaryId: r.dictionaryId, term: r.sourceText, translation: r.targetText, notes: r.notes || undefined, origin: r.origin || undefined, source: r?.dictionary ? `${visMap[r.dictionary.visibility as string] || r.dictionary.visibility} · ${r.dictionary.name}` : undefined })) };
    } catch (e) {
        return { success: false, error: (e as any)?.message || '查询失败' };
    }
}

// 查找/创建：项目 + 用户 的私有词典
export async function findDictionaryByProjectUserAction(projectId: string, userId: string) {
    try {
        const res = await findOrCreateDictionaryDB(projectId, { scope: 'PRIVATE', userId })
        try { revalidatePath('/dashboard/dictionaries') } catch {}
        return { success: true, data: { id: res.id, created: res.created } as const }
    } catch (e) {
        console.error('查找/创建项目私有词典失败:', e)
        return { success: false, error: '查找/创建项目私有词典失败' }
    }
}

// 查找/创建：项目级词典（PROJECT 可见性，不绑定 userId）
export async function findProjectDictionaryAction(projectId: string) {
    try {
        const res = await findOrCreateDictionaryDB(projectId, { scope: 'PROJECT' })
        try { revalidatePath('/dashboard/dictionaries') } catch {}
        return { success: true, data: { id: res.id, created: res.created } as const }
    } catch (e) {
        console.error('查找/创建项目词典失败:', e)
        return { success: false, error: '查找/创建项目词典失败' }
    }
}

// 批量应用术语到词典（append/overwrite/upsert），若在他处已有译文则拷贝并启用
export async function bulkUpsertEntriesAction(input: { dictionaryId: string; projectId: string; userId?: string; terms: string[]; mode?: 'append' | 'overwrite' | 'upsert'; copyFromOthers?: boolean }) {
    try {
        const dictionaryId = input.dictionaryId
        const projectId = input.projectId
        const userId = input.userId
        const copyFromOthers = input.copyFromOthers === true
        const mode = (input.mode || 'upsert') as 'append' | 'overwrite' | 'upsert'
        const unique = Array.from(new Set((input.terms || []).map(t => String(t || '').trim()).filter(Boolean)))
        let inserted = 0
        let updated = 0
        let skipped = 0

        if (unique.length === 0) return { success: true, data: { inserted, updated, skipped } }

        const buildCandMap = async (sourceList: string[]) => {
            if (!sourceList.length) return new Map<string, { targetText: string; notes: string | null }>()
            if (!copyFromOthers) return new Map<string, { targetText: string; notes: string | null }>()
            const cands = await findCandidateTranslationsForSourcesDB(sourceList, projectId, userId)
            if (!cands) return new Map<string, { targetText: string; notes: string | null }>()
            const candMap = new Map<string, { targetText: string; notes: string | null }>()
            for (const c of cands) {
                if (!candMap.has(c.sourceText)) candMap.set(c.sourceText, { targetText: c.targetText, notes: (c as any).notes ?? null })
            }
            return candMap
        }

        if (mode === 'overwrite') {
            await deleteDictionaryEntriesByDictionaryIdDB(dictionaryId)
            if (unique.length) {
                const candMap = await buildCandMap(unique)
                for (const t of unique) {
                    const picked = candMap.get(t)
                    const tt = picked?.targetText || ''
                    const nn = picked?.notes || null
                    const origin = tt ? 'apply:copied' : 'apply:new'
                    await createDictionaryEntryDB({
                        dictionaryId,
                        sourceText: t,
                        targetText: tt,
                        notes: nn ?? null,
                        origin,
                        createdById: userId,
                        updatedById: userId,
                    })
                    inserted += 1
                }
            }
            return { success: true, data: { inserted, updated, skipped } }
        }

        // append/upsert
        const existMap = await findExistingDictionaryEntriesMapDB(dictionaryId, unique)
        const toCreate = unique.filter(t => !existMap.has(t))
        if (toCreate.length) {
            const candMap = await buildCandMap(toCreate)
            for (const t of toCreate) {
                const picked = candMap.get(t)
                const tt = picked?.targetText || ''
                const nn = picked?.notes || null
                const origin = tt ? 'apply:copied' : 'apply:new'
                await createDictionaryEntryDB({
                    dictionaryId,
                    sourceText: t,
                    targetText: tt,
                    notes: nn ?? null,
                    origin,
                    createdById: userId,
                    updatedById: userId,
                })
                inserted += 1
            }
        }
        if (mode === 'upsert' && existMap.size) {
            skipped = existMap.size
        }
        return { success: true, data: { inserted, updated, skipped } }
    } catch (e: unknown) {
        console.error('批量应用术语失败:', e)
        return { success: false, error: '批量应用术语失败' }
    }
}

// 允许前端以 FormData 直接调用的 Server Action 入口
export async function importDictionaryFromFormAction(form: FormData) {
    'use server'
    try {
        const dictionaryId = String(form.get('dictionaryId') || '').trim()
        const mode = (String(form.get('mode') || 'upsert').trim().toLowerCase()) as 'append' | 'overwrite' | 'upsert'
        const sourceLang = (String(form.get('sourceLang') || '').trim()) || undefined
        const targetLang = (String(form.get('targetLang') || '').trim()) || undefined
        const file = form.get('file') as unknown as File
        const sourceKey = (String(form.get('sourceKey') || '').trim()) || undefined
        const targetKey = (String(form.get('targetKey') || '').trim()) || undefined
        const notesKey = (String(form.get('notesKey') || '').trim()) || undefined

        if (!dictionaryId) return { success: false, error: '缺少参数 dictionaryId' } as const
        if (!(file instanceof File)) return { success: false, error: '缺少上传文件' } as const

        return await importDictionaryAction({ dictionaryId, mode, file, sourceLang, targetLang, sourceKey, targetKey, notesKey })
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) } as const
    }
}

