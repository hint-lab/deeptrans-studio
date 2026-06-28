'use server';

import { revalidatePath } from 'next/cache';
import {
    listProjectDictionaryBindingsDB,
    updateProjectDictionaryBindingsDB,
    listProjectMemoryBindingsDB,
    updateProjectMemoryBindingsDB,
} from '@/db/projectBinding';
import {
    requireAccessibleDictionary,
    requireOwnedMemory,
    requireUser,
    requireWritableProject,
    type AuthContext,
} from '@/lib/guards';

async function partitionAllowed<T>(
    ids: string[],
    check: (id: string, ctx: AuthContext) => Promise<T>,
    authCtx: AuthContext
) {
    const allowed: string[] = [];
    const denied: string[] = [];
    for (const id of ids) {
        try {
            await check(id, authCtx);
            allowed.push(id);
        } catch {
            denied.push(id);
        }
    }
    return { allowed, denied };
}

export async function getProjectDictionaryBindingsAction(projectId: string) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const;
    await requireWritableProject(projectId);
    const rows = await listProjectDictionaryBindingsDB(projectId);
    const list = Array.isArray(rows) ? rows : [];
    const ids = list.map((r: any) => r.dictionaryId);
    return { success: true, data: ids } as const;
}

export async function updateProjectDictionaryBindingsAction(
    projectId: string,
    dictionaryIds: string[]
) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const;
    const authCtx = await requireUser();
    const project = await requireWritableProject(projectId, authCtx);
    const ids = Array.isArray(dictionaryIds)
        ? Array.from(new Set(dictionaryIds.map(id => String(id || '').trim()).filter(Boolean)))
        : [];
    await Promise.all(ids.map(id => requireAccessibleDictionary(id, authCtx)));
    const existing = await listProjectDictionaryBindingsDB(project.id);
    const existingIds = (Array.isArray(existing) ? existing : []).map((r: any) => r.dictionaryId);
    const { denied: preserveIds } = await partitionAllowed(
        existingIds,
        requireAccessibleDictionary,
        authCtx
    );
    await updateProjectDictionaryBindingsDB(project.id, ids, preserveIds);
    try {
        revalidatePath('/dashboard');
    } catch {}
    return { success: true } as const;
}

export async function getProjectMemoryBindingsAction(projectId: string) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const;
    await requireWritableProject(projectId);
    const rows = await listProjectMemoryBindingsDB(projectId);
    const list = Array.isArray(rows) ? rows : [];
    const ids = list.map((r: any) => r.memoryId);
    return { success: true, data: ids } as const;
}

export async function updateProjectMemoryBindingsAction(projectId: string, memoryIds: string[]) {
    if (!projectId) return { success: false, error: '缺少 projectId' } as const;
    const authCtx = await requireUser();
    const project = await requireWritableProject(projectId, authCtx);
    const ids = Array.isArray(memoryIds)
        ? Array.from(new Set(memoryIds.map(id => String(id || '').trim()).filter(Boolean)))
        : [];
    await Promise.all(ids.map(id => requireOwnedMemory(id, authCtx)));
    const existing = await listProjectMemoryBindingsDB(project.id);
    const existingIds = (Array.isArray(existing) ? existing : []).map((r: any) => r.memoryId);
    const { denied: preserveIds } = await partitionAllowed(existingIds, requireOwnedMemory, authCtx);
    await updateProjectMemoryBindingsDB(project.id, ids, preserveIds);
    try {
        revalidatePath('/dashboard');
    } catch {}
    return { success: true } as const;
}
