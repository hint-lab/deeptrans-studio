import { createLogger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';
import { queryDictionaryEntriesExactWithOwner } from '@/server/dictionary';
const logger = createLogger(
    {
        type: 'request:dictionary',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = String(searchParams.get('q') || '').trim();
        const projectId = String(searchParams.get('projectId') || '').trim() || undefined;
        const limitParam = searchParams.get('limit');
        const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));
        const authCtx = await requireUser();

        logger.debug('Dictionary API lookup called:', { hasQuery: !!q, limit });

        if (!q) {
            logger.debug('Dictionary API: No query term provided');
            return NextResponse.json({ data: [] });
        }

        const result = await queryDictionaryEntriesExactWithOwner(q, authCtx, {
            limit,
            projectId,
        });
        if (!result.success) {
            return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
        }
        const data = result.data || [];

        logger.debug('Dictionary API: Final response:', {
            dataCount: data?.length,
        });

        return NextResponse.json({ data });
    } catch (e: any) {
        logger.error('[API] dictionary/lookup error:', e);
        return NextResponse.json(
            { error: guardMessage(e) || 'lookup failed' },
            { status: guardStatus(e) }
        );
    }
}
