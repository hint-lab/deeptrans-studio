"use server";

import { revalidatePath } from "next/cache";
import { listProjectDictionaryBindingsDB, updateProjectDictionaryBindingsDB, listProjectMemoryBindingsDB, updateProjectMemoryBindingsDB } from "@/db/projectBinding";

export async function getProjectDictionaryBindingsAction(projectId: string) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const
    const rows = await listProjectDictionaryBindingsDB(projectId)
    const list = Array.isArray(rows) ? rows : []
    const ids = list.map((r: any) => r.dictionaryId)
    return { success: true, data: ids } as const
}

export async function updateProjectDictionaryBindingsAction(projectId: string, dictionaryIds: string[]) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const
    await updateProjectDictionaryBindingsDB(projectId, Array.isArray(dictionaryIds) ? dictionaryIds : [])
    try { revalidatePath('/dashboard') } catch { }
    return { success: true } as const
}

export async function getProjectMemoryBindingsAction(projectId: string) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const
    const rows = await listProjectMemoryBindingsDB(projectId)
    const list = Array.isArray(rows) ? rows : []
    const ids = list.map((r: any) => r.memoryId)
    return { success: true, data: ids } as const
}

export async function updateProjectMemoryBindingsAction(projectId: string, memoryIds: string[]) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const
    await updateProjectMemoryBindingsDB(projectId, Array.isArray(memoryIds) ? memoryIds : [])
    try { revalidatePath('/dashboard') } catch { }
    return { success: true } as const
}


