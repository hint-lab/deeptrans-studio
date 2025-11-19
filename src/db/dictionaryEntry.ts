import { prisma } from '@/lib/db'
import { dbTry } from "./utils"
import { DictionaryEntry } from "@prisma/client"
/**
 * 字典条目相关的数据库操作封装
 */
/**
 * 查找某词典中 targetText 为空的条目
 */
/**
 * 查找某词典中 targetText 为空的条目
 * @param dictionaryId 词典 ID
 * @param sources 可选的源文本列表（会去重、过滤空值）
 */
export const findBlankDictionaryEntriesBySourcesDB = async(
  dictionaryId: string,
  sources?: string[]
): Promise<Array<{ id: string; sourceText: string }> | null> => {
  const list = Array.isArray(sources)
    ? Array.from(new Set(sources.map(s => String(s || '').trim()).filter(Boolean)))
    : undefined

  return dbTry(() => prisma.dictionaryEntry.findMany({
    where: {
      dictionaryId,
      ...(list?.length ? { sourceText: { in: list } } : {}),
      OR: [ { targetText: '' } ]
    },
    select: { id: true, sourceText: true }
  })) 
} 

// 更新译文与状态
/**
 * 更新条目的译文，并自动同步 enabled/origin 字段
 */
export const updateDictionaryEntryTargetTextDB = async(
  id: string,
  targetText: string,
  origin?: string
): Promise<DictionaryEntry | null> => {
  const tt = String(targetText || '').trim()
  return dbTry(() => prisma.dictionaryEntry.update({
    where: { id },
    data: {
      targetText: tt,
      enabled: !!tt,
      notes: tt ? null : null,
      origin: tt ? (origin || 'apply:mt') : (origin || 'apply:new'),
    }
  }))
}

// 查找
/**
 * 按词典 ID 查询条目，按创建时间倒序，支持限制条数
 */
export const findDictionaryEntriesByDictionaryIdDB = async(dictionaryId: string, limit?: number): Promise<DictionaryEntry[] | null> => {
  return dbTry(() => prisma.dictionaryEntry.findMany({
    where: { dictionaryId },
    orderBy: { createdAt: 'desc' },
    ...(typeof limit === 'number' && limit > 0 ? { take: limit } : {})
  }))   
}

/** 统计条目数量（传入 Prisma where 条件） */
export const countDictionaryEntriesDB = async(where: any): Promise<number | null> => {
  return dbTry(() => prisma.dictionaryEntry.count({ where })) 
}

/** 通用查询：where + 分页 */
export const findDictionaryEntriesDB = async(where: any, skip?: number, take?: number): Promise<DictionaryEntry[]|null> => {
  return dbTry(() => prisma.dictionaryEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })) 
}

// 创建
/** 批量创建条目 */
export const createDictionaryEntriesBulkDB = async(dictionaryId: string, entries: Array<{ sourceText: string; targetText: string; notes?: string | null }>): Promise<{ count: number } | null> => {
  if (!entries.length) return { count: 0 }
  return dbTry(() => prisma.dictionaryEntry.createMany({ data: entries.map(e => ({
    dictionaryId,
    sourceText: e.sourceText,
    targetText: e.targetText,
    notes: e.notes ?? null,
    enabled: !!String(e.targetText || '').trim()
  })) })) 
}

// 删除
/** 按词典 ID 批量删除条目 */
export const deleteDictionaryEntriesByDictionaryIdDB = async(dictionaryId: string): Promise<{ count: number } | null> => {
  return dbTry(() => prisma.dictionaryEntry.deleteMany({ where: { dictionaryId } })) 
}

/** 查询一组源文本是否已存在，返回 sourceText->id 映射 */
export const findExistingDictionaryEntriesMapDB = async(dictionaryId: string, sources: string[]): Promise<Map<string, string>> => {
  const rows = await dbTry(() => prisma.dictionaryEntry.findMany({ where: { dictionaryId, sourceText: { in: sources } }, select: { id: true, sourceText: true } }))
  if (!rows) return new Map<string, string>()
  const list = Array.isArray(rows) ? rows : []
  return new Map<string, string>(list.map((r: { id: string; sourceText: string }) => [r.sourceText, r.id])) 
}

// 创建
/** 创建单条条目 */
export const createDictionaryEntryDB = async(data: {
  dictionaryId: string;
  sourceText: string;
  targetText: string;
  notes?: string | null;
  origin?: string | null;
  createdById?: string;
  updatedById?: string;
}): Promise<DictionaryEntry | null> => {
  return dbTry(() => prisma.dictionaryEntry.create({ data: {
    dictionaryId: data.dictionaryId,
    sourceText: data.sourceText,
    targetText: data.targetText,
    notes: data.notes ?? null,
    origin: data.origin ?? 'manual',
    createdById: data.createdById,
    updatedById: data.updatedById,
  } })) 
}   
// 更新
export const updateDictionaryEntryByIdDB = async(id: string, data: {
  sourceText?: string;
  targetText?: string;
  notes?: string | null;
  enabled?: boolean;
  updatedById?: string;
}): Promise<DictionaryEntry | null> => {
  return dbTry(() => prisma.dictionaryEntry.update({ where: { id }, data: {
    sourceText: data.sourceText,
    targetText: data.targetText,
    notes: data.notes,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
    updatedAt: new Date(),
    updatedById: data.updatedById,
  } }))   
}

// 删除
/** 删除单条条目（按 id） */
export const deleteDictionaryEntryByIdDB = async(id: string): Promise<DictionaryEntry | null> => {
  return dbTry(() => prisma.dictionaryEntry.delete({ where: { id } })) 
}

// 查找（词典范围）
/**
 * 在公开/项目/私有词典范围内，查询给定源文本列表的候选译文
 */
export const findCandidateTranslationsForSourcesDB = async(sourceList: string[], projectId?: string, userId?: string): Promise<Array<{ sourceText: string; targetText: string; notes: string | null }>| null> => {
  if (!Array.isArray(sourceList) || sourceList.length === 0) return [] as Array<{ sourceText: string; targetText: string; notes: string | null }>
  return dbTry(() => prisma.dictionaryEntry.findMany({
    where: {
      sourceText: { in: sourceList },
      dictionary: {
        OR: [
          { visibility: 'PUBLIC' as any },
          { visibility: 'PROJECT' as any, ...(projectId ? { projectId: { not: projectId } } : {}) },
          ...(userId ? [{ visibility: 'PRIVATE' as any, userId }] : [] as any[]),
        ]
      },
    },
    select: { sourceText: true, targetText: true, notes: true },
    take: 10000,
  })) 
}

/** 模糊检索：在给定词典可见性范围内，按文本 contains 查询 */
export const findByScopeDB = async(term: string, orScopes: any[], limit: number): Promise<Array<{ sourceText: string; targetText: string; notes: string | null; dictionary: { name: string; visibility: string } }>| null> => {
  const rows = await dbTry(() => prisma.dictionaryEntry.findMany({
    where: {
      OR: [
        { sourceText: { contains: term, mode: 'insensitive' } },
        { targetText: { contains: term, mode: 'insensitive' } },
      ],
      enabled: true,
      dictionary: { OR: orScopes }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { sourceText: true, targetText: true, notes: true, dictionary: { select: { name: true, visibility: true } } }
  }))
  if (!rows) return [] as Array<{ sourceText: string; targetText: string; notes: string | null; dictionary: { name: string; visibility: string } }>
  const list = Array.isArray(rows) ? rows : []
  return list.map((r: { sourceText: string; targetText: string; notes: string | null; dictionary: { name: string; visibility: string } }) => ({
    sourceText: r.sourceText,
    targetText: r.targetText,
    notes: r.notes,
    dictionary: r.dictionary
  }))
}
 

/** 精确检索：sourceText 完全匹配（不区分大小写） */
export const findExactByScopeDB = async(term: string, orScopes: any[], limit: number): Promise<Array<{ id: string; dictionaryId: string; sourceText: string; targetText: string; notes: string | null; origin: string | null; dictionary: { name: string; visibility: string } }>> => {
  const rows = await dbTry(() => prisma.dictionaryEntry.findMany({
    where: {
      sourceText: { equals: term, mode: 'insensitive' as any },
      enabled: true,
      dictionary: { OR: orScopes }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, dictionaryId: true, sourceText: true, targetText: true, notes: true, origin: true, dictionary: { select: { name: true, visibility: true } } }
    }))
  if (!rows) return []
  return Array.isArray(rows) ? rows : []
}