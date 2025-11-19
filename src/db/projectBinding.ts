import { prisma } from '@/lib/db'
import { dbTry } from './utils'

export const listProjectDictionaryBindingsDB = async (projectId: string) => {
    return dbTry(() => prisma.projectDictionary.findMany({
        where: { projectId },
        select: { dictionaryId: true, dictionary: { select: { id: true, name: true, visibility: true } } },
        orderBy: { createdAt: 'desc' }
    }))
}

export const updateProjectDictionaryBindingsDB = async (projectId: string, dictionaryIds: string[]) => {
    const unique = Array.from(new Set((dictionaryIds || []).map(String).filter(Boolean)))
    return dbTry(async () => prisma.$transaction(async (tx: any) => {
        // 删除未在列表中的绑定
        await tx.projectDictionary.deleteMany({ where: { projectId, ...(unique.length ? { dictionaryId: { notIn: unique } } : {}) } })
        // 确保存在列表中的绑定
        for (const did of unique) {
            const exist = await tx.projectDictionary.findUnique({ where: { projectId_dictionaryId: { projectId, dictionaryId: did } } as any })
            if (!exist) {
                await tx.projectDictionary.create({ data: { projectId, dictionaryId: did } })
            }
        }
        return true
    }))
}

export const listProjectMemoryBindingsDB = async (projectId: string) => {
    const has = (prisma as any).projectMemory && (prisma as any).translationMemory
    if (!has) return []
    return dbTry(() => (prisma as any).projectMemory.findMany({
        where: { projectId },
        select: { memoryId: true, memory: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }
    }))
}

export const updateProjectMemoryBindingsDB = async (projectId: string, memoryIds: string[]) => {
    const has = (prisma as any).projectMemory
    if (!has) return true
    const list = Array.isArray(memoryIds) ? memoryIds : []
    const unique = Array.from(new Set(list.map((id) => String(id || "").trim()).filter(Boolean)))
    return dbTry(async () => prisma.$transaction(async (tx: any) => {
        await tx.projectMemory.deleteMany({ where: { projectId, ...(unique.length ? { memoryId: { notIn: unique } } : {}) } })
        for (const mid of unique) {
            const exist = await tx.projectMemory.findUnique({ where: { projectId_memoryId: { projectId, memoryId: mid } } })
            if (!exist) await tx.projectMemory.create({ data: { projectId, memoryId: mid } })
        }
        return true
    }))
}


