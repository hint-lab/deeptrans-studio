import { findByScopeDB, findExactByScopeDB } from '@/db/dictionaryEntry';
import { prisma } from '@/lib/db';
import { buildDictionaryLookupScopes } from '@/lib/dictionary-lookup-scope';

export type DictionaryOwner = {
    userId: string;
    tenantId?: string | null;
};

export type DictionaryQueryResult = {
    success: boolean;
    data?: Array<{
        id: string;
        dictionaryId: string;
        term: string;
        translation: string;
        notes?: string;
        origin?: string;
        source?: string;
    }>;
    error?: string;
};

export type DictionaryLookupOptions = {
    limit?: number;
    projectId?: string;
};

function ownedProjectWhere(owner: DictionaryOwner) {
    return {
        OR: [{ userId: owner.userId }, ...(owner.tenantId ? [{ tenantId: owner.tenantId }] : [])],
    };
}

async function resolveProjectDictionaryIdsForOwner(
    projectId: string | undefined,
    owner: DictionaryOwner
) {
    const id = String(projectId || '').trim();
    if (!id) return [];

    // Do not trust a browser-provided project ID. A missing or inaccessible
    // project fails closed to the public/private scope rather than exposing a
    // tenant-wide pool of project dictionaries.
    const project = await prisma.project.findFirst({
        where: { id, ...ownedProjectWhere(owner) },
        select: {
            projectDictionaries: {
                select: { dictionaryId: true },
            },
        },
    });
    if (!project) return [];

    return (project.projectDictionaries as Array<{ dictionaryId: string }>).map(
        binding => binding.dictionaryId
    );
}

async function resolveDictionaryLookupScope(owner: DictionaryOwner, projectId: string | undefined) {
    const authCtx = await resolveDictionaryOwner(owner);
    const projectDictionaryIds = await resolveProjectDictionaryIdsForOwner(projectId, authCtx);
    return {
        authCtx,
        scopes: buildDictionaryLookupScopes(authCtx, projectDictionaryIds),
    };
}

function dictionaryResultRows(
    rows: Array<{
        id: string;
        dictionaryId: string;
        sourceText: string;
        targetText: string;
        notes: string | null;
        origin: string | null;
        dictionary: { name: string; visibility: string };
    }>
): NonNullable<DictionaryQueryResult['data']> {
    const visMap: Record<string, string> = { PUBLIC: '公共', PROJECT: '项目', PRIVATE: '私有' };
    return rows.map(row => ({
        id: row.id,
        dictionaryId: row.dictionaryId,
        term: row.sourceText,
        translation: row.targetText,
        notes: row.notes || undefined,
        origin: row.origin || undefined,
        source: row.dictionary
            ? `${visMap[row.dictionary.visibility] || row.dictionary.visibility} · ${row.dictionary.name}`
            : undefined,
    }));
}

export async function resolveDictionaryOwner(owner: DictionaryOwner): Promise<DictionaryOwner> {
    const user = await prisma.user.findUnique({
        where: { id: owner.userId },
        select: { id: true, tenantId: true },
    });
    if (!user) throw new Error('内部用户不存在');
    if (owner.tenantId && user.tenantId && owner.tenantId !== user.tenantId) {
        throw new Error('内部租户身份不匹配');
    }
    return { userId: user.id, tenantId: user.tenantId };
}

export async function queryDictionaryEntriesExactWithOwner(
    term: string,
    owner: DictionaryOwner,
    opts?: DictionaryLookupOptions
): Promise<DictionaryQueryResult> {
    try {
        const { scopes } = await resolveDictionaryLookupScope(owner, opts?.projectId);
        const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
        if (!term || !term.trim()) {
            return { success: true, data: [] };
        }

        const rows = await findExactByScopeDB(term, scopes, limit);
        if (rows === null) return { success: false, error: '词库检索暂不可用，请稍后重试' };

        return {
            success: true,
            data: dictionaryResultRows(rows),
        };
    } catch (e) {
        return { success: false, error: (e as any)?.message || '查询失败' };
    }
}

/** Search visible dictionaries by text with the same exact project scope. */
export async function queryDictionaryEntriesWithOwner(
    term: string,
    owner: DictionaryOwner,
    opts?: DictionaryLookupOptions
): Promise<DictionaryQueryResult> {
    try {
        const { scopes } = await resolveDictionaryLookupScope(owner, opts?.projectId);
        const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
        if (!term || !term.trim()) return { success: true, data: [] };

        const rows = await findByScopeDB(term, scopes, limit);
        if (rows === null) return { success: false, error: '词库检索暂不可用，请稍后重试' };

        return {
            success: true,
            data: dictionaryResultRows(rows),
        };
    } catch (e) {
        return { success: false, error: (e as any)?.message || '查询失败' };
    }
}
