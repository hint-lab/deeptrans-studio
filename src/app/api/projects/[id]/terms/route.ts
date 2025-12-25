import { findProjectDictionaryAction } from '@/actions/dictionary';
import { auth } from '@/auth';
import { findDocumentsByProjectIdDB, updateDocumentStatusDB } from '@/db/document';
import { extractTextFromUrl } from '@/lib/file-parser';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { TTL_PROGRESS, setTextWithTTL } from '@/lib/redis-ttl';
import { DocumentStatus } from '@/types/enums';
import { getQueue } from '@/worker/queue';
import { NextRequest, NextResponse } from 'next/server';
const logger = createLogger({
    type: 'request:api:projects:[id]:terms',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function POST(req: NextRequest, ctx: any) {
    try {
        const redis = await getRedis();
        const { id: projectId } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch { }
        const batchId = String(q.get('batchId') || body?.batchId || '');
        logger.debug(`batchId: ${batchId}`);
        const terms = body?.terms || undefined;
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const session = await auth();
        const userId = session?.user?.id;

        // 确保项目词库存在（PROJECT 范围）
        try {
            await findProjectDictionaryAction(projectId);
        } catch { }

        const docs = await findDocumentsByProjectIdDB(projectId);
        const only = docs?.[0];
        if (!only || !only.url)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        try {
            await updateDocumentStatusDB(only.id, DocumentStatus.TERMS_EXTRACTING as any);
        } catch { }

        let bodyText = '';
        try {
            const { text } = await extractTextFromUrl(only.url);
            bodyText = String(text || '').trim();
        } catch { }
        if (!bodyText) return NextResponse.json({ error: 'empty content' }, { status: 400 });

        await setTextWithTTL(redis, `docTerms.${batchId}.total`, '1', TTL_PROGRESS);
        await setTextWithTTL(redis, `docTerms.${batchId}.done`, '0', TTL_PROGRESS);
        await getQueue('doc-terms').add(
            'doc-terms',
            { id: 'terms.all', text: bodyText, batchId, userId, projectId, ...terms },
            { jobId: `docTerms.${batchId}.all` }
        );
        return NextResponse.json({ ok: true, step: 'terms' });
    } catch (e: any) {
        // 构建详细的错误对象
        const detailedError = {
            name: e.name,
            message: e.message,
            stack: e.stack,
            code: e.code, // Redis 或其他库的错误代码
            cause: e.cause, // 如果有的话
        };
        try {
            const { id: projectId } = await ctx.params;
            const docs = await findDocumentsByProjectIdDB(projectId);
            const only = docs?.[0];
            if (only?.id) {
                try {
                    await updateDocumentStatusDB(only.id, DocumentStatus.ERROR as any);
                } catch { }
            }
        } catch { }
        logger.error(`[terms start error] ${JSON.stringify(detailedError, null, 2)}`);
        return NextResponse.json({ error: e?.message || 'terms start failed' }, { status: 500 });
    }
}
