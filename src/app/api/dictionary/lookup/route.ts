import { createLogger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { guardMessage, guardStatus, ownedWhere, requireUser } from '@/lib/guards';
const logger = createLogger({
    type: 'request:dictionary',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = String(searchParams.get('q') || '').trim();
        const limitParam = searchParams.get('limit');
        const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));
        const authCtx = await requireUser();

        logger.debug('Dictionary API lookup called:', { hasQuery: !!q, limit });

        if (!q) {
            logger.debug('Dictionary API: No query term provided');
            return NextResponse.json({ data: [] });
        }

        // 按可见范围组合查询条件：PUBLIC / PROJECT / PRIVATE(userId)
        const orScopes: any[] = [{ visibility: 'PUBLIC' as any }];
        orScopes.push({
            visibility: 'PROJECT' as any,
            OR: [
                ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                { projectBindings: { some: { project: ownedWhere(authCtx) } } },
            ],
        });
        orScopes.push({ visibility: 'PRIVATE' as any, userId: authCtx.userId });

        logger.debug('Dictionary API: Query scopes:', orScopes);

        const { findExactByScopeDB } = await import('@/db/dictionaryEntry');
        const rows = await findExactByScopeDB(q, orScopes, limit);

        logger.debug('Dictionary API: Query result:', {
            rowsCount: rows?.length,
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

        logger.debug('Dictionary API: Final response:', {
            dataCount: data?.length,
        });

        return NextResponse.json({ data });
    } catch (e: any) {
        logger.error('[API] dictionary/lookup error:', e);
        return NextResponse.json({ error: guardMessage(e) || 'lookup failed' }, { status: guardStatus(e) });
    }
}
