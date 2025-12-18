import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = String(searchParams.get('q') || '').trim();
        const tenantId = searchParams.get('tenantId') || undefined;
        const userId = searchParams.get('userId') || undefined;
        const limitParam = searchParams.get('limit');
        const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));

        console.log('Dictionary API lookup called:', { q, tenantId, userId, limit });

        if (!q) {
            console.log('Dictionary API: No query term provided');
            return NextResponse.json({ data: [] });
        }

        // 按可见范围组合查询条件：PUBLIC / PROJECT / PRIVATE(userId)
        const orScopes: any[] = [{ visibility: 'PUBLIC' as any }];
        // PROJECT 范围：保留（当前不限定 projectId）
        if (tenantId) orScopes.push({ visibility: 'PROJECT' as any });
        else orScopes.push({ visibility: 'PROJECT' as any });
        if (userId) orScopes.push({ visibility: 'PRIVATE' as any, userId });

        console.log('Dictionary API: Query scopes:', orScopes);

        const { findExactByScopeDB } = await import('@/db/dictionaryEntry');
        const rows = await findExactByScopeDB(q, orScopes, limit);

        console.log('Dictionary API: Query result:', {
            rowsCount: rows?.length,
            rows: rows?.slice(0, 3),
        });

        const visMap: Record<string, string> = { PUBLIC: '公共', PROJECT: '项目', PRIVATE: '私有' };
        const data = (rows || []).map((r: any) => ({
            id: r.id,
            dictionaryId: r.dictionaryId,
            term: r.sourceText,
            translation: r.targetText,
            notes: r.notes || undefined,
            source: r?.dictionary
                ? `${visMap[r.dictionary.visibility as string] || r.dictionary.visibility} · ${r.dictionary.name}`
                : undefined,
        }));

        console.log('Dictionary API: Final response:', {
            dataCount: data?.length,
            data: data?.slice(0, 3),
        });

        return NextResponse.json({ data });
    } catch (e: any) {
        console.error('[API] dictionary/lookup error:', e);
        return NextResponse.json({ error: e?.message || 'lookup failed' }, { status: 500 });
    }
}
