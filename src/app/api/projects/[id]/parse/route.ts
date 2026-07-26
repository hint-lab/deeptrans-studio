import { findDocumentByIdDB, updateDocumentStatusIfCurrentDB } from '@/db/document';
import { extractFileTypeFromUrl } from '@/lib/getFileType';
import {
    guardMessage,
    guardStatus,
    requireOwnedProjectDocument,
    requireUser,
    requireWritableProject,
} from '@/lib/guards';
import { initStructuredKey, scopedProjectBatchId } from '@/lib/init-artifact-keys';
import {
    canWriteDocumentParseStatus,
    PARSE_MUTABLE_DOCUMENT_STATUSES,
    resolveProjectInitResumeTarget,
} from '@/lib/document-init-status';
import {
    DOCUMENT_INIT_EMPTY_DOCUMENT_MESSAGE,
    resolveDocumentInitParseOutcome,
} from '@/lib/document-init-parse-state';
import { createLogger } from '@/lib/logger';
import { extractDocxFromUrl } from '@/lib/parsers/docx-parser';
import { pdfParseToStructuredJson } from '@/lib/parsers/pdf-parser';
import { textToStructuredJson } from '@/lib/parsers/text-parser';
import { getRedis } from '@/lib/redis';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH, TTL_PREVIEW, setTextWithTTL } from '@/lib/redis-ttl';
import { getReadableDocumentSourceUrlForOwner } from '@/server/uploaded-object';
import { DocumentStatus } from '@/types/enums';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
const logger = createLogger(
    {
        type: 'request:parse',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
function makePreviewHtmlFromText(content: string): string {
    const raw = String(content || '').slice(0, 5000);
    const esc = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const htmlBody = esc
        .split(/\n\s*\n/)
        .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');
    return `<div>${htmlBody}</div>`;
}

const PARSE_LOCK_TTL_SECONDS = 60 * 60;

function alreadyInitializedPayload(status: unknown) {
    const currentStatus = String(status || '');
    return {
        ok: true,
        skipped: true,
        step: 'already-initialized',
        status: currentStatus,
        resumeTarget: resolveProjectInitResumeTarget(currentStatus),
    };
}

async function commitParseStatus(documentId: string) {
    const updated = await updateDocumentStatusIfCurrentDB(
        documentId,
        DocumentStatus.PARSING as any,
        PARSE_MUTABLE_DOCUMENT_STATUSES
    );
    if (updated) return null;
    const latest = await findDocumentByIdDB(documentId);
    return alreadyInitializedPayload(latest?.status);
}

export async function POST(req: NextRequest, ctx: any) {
    let batchId = '';
    let ownedDocumentId = '';
    let parseLockKey = '';
    let parseLockValue = '';
    const redis = await getRedis(); // 移到外层以便 catch 中使用
    try {
        const { id: projectIdFromParams } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch {}
        batchId = String(q.get('batchId') || body?.batchId || '');
        const docIdFromReq = String(q.get('docId') || body?.documentId || '') || undefined;
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const scopedBatchId = scopedProjectBatchId(projectIdFromParams, batchId);

        const authCtx = await requireUser();
        const project = await requireWritableProject(projectIdFromParams, authCtx);
        const only = docIdFromReq
            ? await requireOwnedProjectDocument(projectIdFromParams, docIdFromReq, authCtx)
            : project.documents?.[0];
        if (!only || !only.name)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        ownedDocumentId = only.id;
        if (!canWriteDocumentParseStatus(only.status)) {
            return NextResponse.json(alreadyInitializedPayload(only.status));
        }
        const sourceUrl = await getReadableDocumentSourceUrlForOwner(only.name, authCtx);
        parseLockKey = `project-init:parse-lock:${only.id}`;
        parseLockValue = JSON.stringify({ token: randomUUID(), batchId });
        const lockAcquired = await redis.set(
            parseLockKey,
            parseLockValue,
            'EX',
            PARSE_LOCK_TTL_SECONDS,
            'NX'
        );
        if (lockAcquired !== 'OK') {
            const activeLock = await redis.get(parseLockKey);
            let activeBatchId = '';
            try {
                activeBatchId = String(JSON.parse(String(activeLock || '{}'))?.batchId || '');
            } catch {}
            return NextResponse.json({
                ...alreadyInitializedPayload(only.status),
                step: 'parse-in-progress',
                activeBatchId: activeBatchId || undefined,
            });
        }
        const lockedDocument = await findDocumentByIdDB(only.id);
        if (!canWriteDocumentParseStatus(lockedDocument?.status)) {
            return NextResponse.json(alreadyInitializedPayload(lockedDocument?.status));
        }
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
        const { isText, isPdf, isDoc } = await extractFileTypeFromUrl(sourceUrl);
        let structured: any;
        try {
            if (isDoc) {
                const parsed = await extractDocxFromUrl(sourceUrl);
                const { text, html } = parsed;
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                structured = parsed.structured;
            }
            if (isPdf) {
                const parsed = await pdfParseToStructuredJson(sourceUrl);
                const { text, html } = parsed;
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                structured = parsed.structured;
            }
            if (isText) {
                const parsed = await textToStructuredJson(sourceUrl);
                const { text, html } = parsed;
                if (text || html) {
                    content = String(text || '').trim();
                    previewHtml = html;
                }
                structured = parsed.structured;
            }
        } catch (parserError: any) {
            // 2. 捕获解析器特定的错误（如 MinerU 故障）
            logger.error(`Parser failed: ${parserError.message}`);

            // 关键修改：如果解析器报错，抛出异常进入外层 catch，
            // 而不是吞掉错误继续执行后续的 "if (!content)" 逻辑
            throw parserError;
        }
        const parseOutcome = resolveDocumentInitParseOutcome(content);
        if (parseOutcome.kind === 'empty-document') {
            // An empty parser shell cannot be segmented. Mark the document as
            // recoverably failed before exposing the state to the client, so a
            // stale tab cannot persist or segment it as though parsing worked.
            const markedEmpty = await updateDocumentStatusIfCurrentDB(
                only.id,
                DocumentStatus.ERROR as any,
                PARSE_MUTABLE_DOCUMENT_STATUSES
            );
            if (!markedEmpty) {
                const latest = await findDocumentByIdDB(only.id);
                return NextResponse.json(alreadyInitializedPayload(latest?.status));
            }
            await setTextWithTTL(
                redis,
                `init.${scopedBatchId}.previewHtml`,
                parseOutcome.previewMarker,
                TTL_PREVIEW
            );
            logger.warn('文档不含可用于翻译的文本，未推进解析流程');
            return NextResponse.json(
                {
                    error: DOCUMENT_INIT_EMPTY_DOCUMENT_MESSAGE,
                    code: parseOutcome.code,
                    retryable: true,
                    status: DocumentStatus.ERROR,
                },
                { status: 422 }
            );
        }
        await setStructuredArtifact(structured);
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
        const advanced = await commitParseStatus(only.id);
        if (advanced) return NextResponse.json(advanced);
        return NextResponse.json({ ok: true, step: 'parse' });
    } catch (e: any) {
        logger.error({ error: e?.message || 'parse failed' });
        if (ownedDocumentId) {
            try {
                await updateDocumentStatusIfCurrentDB(
                    ownedDocumentId,
                    DocumentStatus.ERROR as any,
                    PARSE_MUTABLE_DOCUMENT_STATUSES
                );
            } catch {}
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
    } finally {
        if (parseLockKey && parseLockValue) {
            await releaseOwnedRedisLock(redis, parseLockKey, parseLockValue).catch(() => {});
        }
    }
}
