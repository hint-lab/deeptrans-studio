import { updateDocumentStatusDB } from '@/db/document';
import { extractFileTypeFromUrl } from '@/lib/getFileType';
import { guardMessage, guardStatus, requireOwnedProjectDocument, requireWritableProject } from '@/lib/guards';
import { initStructuredKey, scopedProjectBatchId } from '@/lib/init-artifact-keys';
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
    let batchId = '';
    let ownedDocumentId = '';
    const redis = await getRedis(); // 移到外层以便 catch 中使用
    try {
        const { id: projectIdFromParams } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch { }
        batchId = String(q.get('batchId') || body?.batchId || '');
        const docIdFromReq = String(q.get('docId') || body?.documentId || '') || undefined;
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const scopedBatchId = scopedProjectBatchId(projectIdFromParams, batchId);

        const project = await requireWritableProject(projectIdFromParams);
        const only = docIdFromReq
            ? await requireOwnedProjectDocument(projectIdFromParams, docIdFromReq)
            : project.documents?.[0];
        if (!only || !only.url)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        ownedDocumentId = only.id;
        let content = '';
        let previewHtml: string | undefined;
        const setStructuredArtifact = async (structured: any) => {
            if (!structured) return;
            await setTextWithTTL(
                redis,
                initStructuredKey(scopedBatchId),
                JSON.stringify(structured),
                TTL_BATCH
            );
        };
        const { isText, isPdf, isDoc } = await extractFileTypeFromUrl(only.url);
        try {
            if (isDoc) {
                const { text, html, structured } = await extractDocxFromUrl(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                await setStructuredArtifact(structured);
            }
            if (isPdf) {
                const { text, html, structured } = await pdfParseToStructuredJson(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                await setStructuredArtifact(structured);
            }
            if (isText) {
                const { text, html, structured } = await textToStructuredJson(only.url);
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                await setStructuredArtifact(structured);
            }
        } catch (parserError: any) {
            // 2. 捕获解析器特定的错误（如 MinerU 故障）
            logger.error(`Parser failed: ${parserError.message}`);

            // 关键修改：如果解析器报错，抛出异常进入外层 catch，
            // 而不是吞掉错误继续执行后续的 "if (!content)" 逻辑
            throw parserError;
        }
        if (!content && !previewHtml) {
            // 3. 确实没有内容，但也没有报错 -> 这是一个合法的空文档
            // 这种情况下，可以写入 empty content 提示
            await setTextWithTTL(
                redis,
                `init.${scopedBatchId}.previewHtml`,
                "<div class='p-4 text-gray-500'>文档内容为空</div>", // 稍微友好一点的提示
                TTL_PREVIEW
            );
            logger.warn("解析成功但文档内容为空");
            return NextResponse.json({ ok: true, step: 'parse' });
        }
        if (!previewHtml) previewHtml = makePreviewHtmlFromText(content);
        const preview = content.slice(0, 1200);
        await setTextWithTTL(redis, `init.${scopedBatchId}.preview`, preview, TTL_PREVIEW);
        if (previewHtml && previewHtml.trim())
            await setTextWithTTL(
                redis,
                `init.${scopedBatchId}.previewHtml`,
                previewHtml.slice(0, 200_000),
                TTL_PREVIEW
            );
        try {
            await updateDocumentStatusDB(only.id, DocumentStatus.PARSING as any);
        } catch { }
        return NextResponse.json({ ok: true, step: 'parse' });
    } catch (e: any) {
        logger.error({ error: e?.message || 'parse failed' });
        if (ownedDocumentId) {
            try {
                await updateDocumentStatusDB(ownedDocumentId, DocumentStatus.ERROR as any);
            } catch { }
        }
        // 关键修改：发生错误时，确保 Redis 中没有脏数据（如之前的 empty content）
        // 这样前端再次获取 previewHtml 时会拿到 null，从而显示骨架屏或错误重试
        if (batchId && redis) {
            const { id: projectIdFromParams } = await (ctx?.params || {});
            const scopedBatchId = scopedProjectBatchId(projectIdFromParams, batchId);
            await setTextWithTTL(
                redis,
                `init.${scopedBatchId}.previewHtml`,
                'ERROR:PARSER_FAILED', // 特殊标记
                TTL_PREVIEW
            );
        }
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
