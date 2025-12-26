import {
    findDocumentByIdDB,
    findDocumentsByProjectIdDB,
    updateDocumentStatusDB,
} from '@/db/document';
import { extractFileTypeFromUrl } from '@/lib/getFileType';
import { createLogger } from '@/lib/logger';
import { extractDocxFromUrl } from '@/lib/parsers/docx-parser';
import { pdfParseToStructuredJson } from '@/lib/parsers/pdf-parser';
import { textToStructuredJson } from '@/lib/parsers/text-parser';
import { getRedis } from '@/lib/redis';
import { TTL_BATCH, TTL_PREVIEW, setTextWithTTL } from '@/lib/redis-ttl';
import { DocumentStatus } from '@/types/enums';
import { NextRequest, NextResponse } from 'next/server';
const logger = createLogger({
    type: 'request:parse',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
function makePreviewHtmlFromText(content: string): string {
    const raw = String(content || '').slice(0, 5000);
    const esc = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const htmlBody = esc
        .split(/\n\s*\n/)
        .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');
    return `<div>${htmlBody}</div>`;
}

export async function POST(req: NextRequest, ctx: any) {
    try {
        const redis = await getRedis();
        const { id: projectIdFromParams } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch { }
        const batchId = String(q.get('batchId') || body?.batchId || '');
        const docIdFromReq = String(q.get('docId') || body?.documentId || '') || undefined;
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const only = docIdFromReq
            ? await findDocumentByIdDB(docIdFromReq)
            : (await findDocumentsByProjectIdDB(projectIdFromParams))?.[0];
        if (!only || !only.url)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        let content = '';
        let previewHtml: string | undefined;
        const { isText, isPdf, isDoc } = await extractFileTypeFromUrl(only.url);
        try {
            if (isDoc) {
                const { text, html, structured } = await extractDocxFromUrl(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                //结构化数据会入库
                if (structured) {
                    await setTextWithTTL(
                        redis,
                        `init.${batchId}.docx.structured`,
                        JSON.stringify(structured),
                        TTL_BATCH
                    );
                }
            }
            if (isPdf) {
                const { text, html, structured } = await pdfParseToStructuredJson(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                //结构化数据会入库
                if (structured) {
                    await setTextWithTTL(
                        redis,
                        `init.${batchId}.docx.structured`,
                        JSON.stringify(structured),
                        TTL_BATCH
                    );
                }
            }
            if (isText) {
                const { text, html, structured } = await textToStructuredJson(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                //结构化数据会入库
                if (structured) {
                    await setTextWithTTL(
                        redis,
                        `init.${batchId}.docx.structured`,
                        JSON.stringify(structured),
                        TTL_BATCH
                    );
                }
            }
        } catch { }
        if (!content) {
            await setTextWithTTL(
                redis,
                `init.${batchId}.previewHtml`,
                "empty content",
                TTL_PREVIEW
            );
            logger.warn("无法解析该文档");
            return NextResponse.json({ ok: true, step: 'parse' });
        }
        if (!previewHtml) previewHtml = makePreviewHtmlFromText(content);
        const preview = content.slice(0, 1200);
        await setTextWithTTL(redis, `init.${batchId}.preview`, preview, TTL_PREVIEW);
        if (previewHtml && previewHtml.trim())
            await setTextWithTTL(
                redis,
                `init.${batchId}.previewHtml`,
                previewHtml.slice(0, 200_000),
                TTL_PREVIEW
            );
        try {
            await updateDocumentStatusDB(only.id, DocumentStatus.PARSING as any);
        } catch { }
        return NextResponse.json({ ok: true, step: 'parse' });
    } catch (e: any) {
        try {
            const { id: projectIdFromParams } = await ctx.params;
            const docs = await findDocumentsByProjectIdDB(projectIdFromParams);
            const only = docs?.[0];
            if (only?.id) {
                try {
                    await updateDocumentStatusDB(only.id, DocumentStatus.ERROR as any);
                } catch { }
            }
        } catch { }
        logger.error({ error: e?.message || 'parse failed' });
        return NextResponse.json({ error: e?.message || 'parse failed' }, { status: 500 });
    }
}
