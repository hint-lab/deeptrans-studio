import { prisma } from '@/lib/db'
import { type Dictionary as PrismaDictionary } from '@prisma/client'
import { dbTry } from "./utils";

export type Dictionary = PrismaDictionary;
export type DictionaryCreateInput = {
  name: string;
  description?: string;
  domain: string;
  visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
  userId?: string;
  tenantId?: string;
}

// 创建词典
export const createDictionaryDB = async (
  data: DictionaryCreateInput
): Promise<Dictionary | null> => {

  return dbTry(() => prisma.dictionary.create({
    data: {
      name: data.name,
      description: data.description,
      domain: data.domain,
      visibility: (data.visibility as any) ?? 'PRIVATE',
      userId: data.userId,
      tenantId: data.tenantId,
    }
  }))
}

// 查找
export const findAllDictionariesDB = async (): Promise<Dictionary[] | null> => {
  return dbTry(() => prisma.dictionary.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' }
  }))
}

export const findAllDictionariesWithEntriesDB = async (): Promise<Dictionary[] | null> => {
  return dbTry(() => prisma.dictionary.findMany({
    include: {
      entries: true,
      user: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'desc' }
  }))
}


export const findDictionariesGivenVisibilityDB = async (visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE', order: string = 'desc', userId?: string): Promise<Dictionary[] | null> => {
  return dbTry(() => prisma.dictionary.findMany({
    where: { visibility: visibility, ...(userId ? { userId: userId } : {}) },
    orderBy: { createdAt: order },
  }))
}
export const findDictionariesGivenVisibilityWithEntriesDB = async (visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE', order: string = 'desc'): Promise<Dictionary[] | null> => {
  return dbTry(() => prisma.dictionary.findMany({
    where: { visibility: visibility },
    orderBy: { createdAt: order },
    include: { _count: { select: { entries: true } } },
  }))
}

export const findDictionaryByIdDB = async (id: string): Promise<Dictionary | null> => {
  return dbTry(() => prisma.dictionary.findUnique({
    where: { id },
  }))
}
export const findDictionaryByIdWithEntriesDB = async (id: string): Promise<Dictionary | null> => {
  return dbTry(() => prisma.dictionary.findUnique({
    where: { id },
    include: { entries: { orderBy: { createdAt: 'desc' } }, user: { select: { id: true, name: true } } }
  }))
}

// 更新
export const updateDictionaryByIdDB = async (id: string, data: { name?: string; description?: string; domain?: string; visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE' }) => {
  return dbTry(() => prisma.dictionary.update({ where: { id }, data: { ...data, updatedAt: new Date() } }))
}

// 删除
export const deleteDictionaryByIdDB = async (id: string): Promise<Dictionary | null> => {
  return dbTry(() => prisma.dictionary.delete({ where: { id } }))
}

// 工具：查找或创建
export const findOrCreateDictionaryDB = async (
  projectId: string,
  opts?: { scope?: 'PROJECT' | 'PRIVATE'; userId?: string }
) => {
  const scope = (opts?.scope || 'PROJECT') as 'PROJECT' | 'PRIVATE'
  // 优先：查找已存在的绑定
  try {
    const bound = await prisma.projectDictionary.findFirst({ where: { projectId }, select: { dictionaryId: true } })
    if (bound?.dictionaryId) return { id: bound.dictionaryId, created: false } as const
  } catch { }
  // 次之：按可见性（以及 PRIVATE 时的 userId）找一个最近的词典并绑定
  const where: any = { visibility: scope as any }
  if (scope === 'PRIVATE' && opts?.userId) where.userId = opts.userId
  const existing = await dbTry(() => prisma.dictionary.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { id: true } }))
  if (existing && (existing as any).id) {
    const id = (existing as any).id as string
    try { await prisma.projectDictionary.create({ data: { projectId, dictionaryId: id } }) } catch { }
    return { id, created: false } as const
  }

  let projectName = ''
  try {
    const p = await dbTry(() => prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }))
    projectName = String((p as any)?.name || '').trim()
  } catch { }
  const name = projectName ? `${projectName} · 术语清单` : '项目术语清单'
  const data: any = {
    name,
    description: scope === 'PROJECT' ? '由文档术语提取自动生成，项目内共享使用' : '由文档术语提取自动生成，后续可人工完善',
    domain: 'general',
    visibility: scope as any,
  }
  if (scope === 'PRIVATE' && opts?.userId) data.userId = opts.userId
  const created = await dbTry(() => prisma.dictionary.create({ data, select: { id: true } }))
  const createdId = (created as any)?.id as string
  try { await prisma.projectDictionary.create({ data: { projectId, dictionaryId: createdId } }) } catch { }
  return { id: createdId, created: true } as const
}