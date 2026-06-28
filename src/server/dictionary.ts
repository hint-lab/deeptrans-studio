import { findExactByScopeDB } from '@/db/dictionaryEntry';
import { prisma } from '@/lib/db';

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

function ownedWhere(owner: DictionaryOwner) {
    return {
        OR: [
            { userId: owner.userId },
            ...(owner.tenantId ? [{ tenantId: owner.tenantId }] : []),
        ],
    };
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
    opts?: { limit?: number }
): Promise<DictionaryQueryResult> {
    try {
        const authCtx = await resolveDictionaryOwner(owner);
        const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
        if (!term || !term.trim()) {
            return { success: true, data: [] };
        }

        const orScopes: any[] = [{ visibility: 'PUBLIC' as any }];
        orScopes.push({
            visibility: 'PROJECT' as any,
            OR: [
                ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                { projectBindings: { some: { project: ownedWhere(authCtx) } } },
            ],
        });
        orScopes.push({ visibility: 'PRIVATE' as any, userId: authCtx.userId });

        const rows = await findExactByScopeDB(term, orScopes, limit);
        if (!rows) return { success: true, data: [] };

        const visMap: Record<string, string> = { PUBLIC: '公共', PROJECT: '项目', PRIVATE: '私有' };
        return {
            success: true,
            data: rows.map((r: any) => ({
                id: r.id,
                dictionaryId: r.dictionaryId,
                term: r.sourceText,
                translation: r.targetText,
                notes: r.notes || undefined,
                origin: r.origin || undefined,
                source: r?.dictionary
                    ? `${visMap[r.dictionary.visibility as string] || r.dictionary.visibility} · ${r.dictionary.name}`
                    : undefined,
            })),
        };
    } catch (e) {
        return { success: false, error: (e as any)?.message || '查询失败' };
    }
}
