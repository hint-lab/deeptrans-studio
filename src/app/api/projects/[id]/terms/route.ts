import { findProjectDictionaryAction } from '@/actions/dictionary';
import { updateDocumentStatusDB } from '@/db/document';
import { extractTextFromUrl } from '@/lib/file-parser';
import {
    DOCUMENT_TERMS_START_ERROR,
    documentTermsJobId,
    normalizeDocumentTermJobOptions,
} from '@/lib/document-term-job';
import { guardMessage, guardStatus, requireUser, requireWritableProject } from '@/lib/guards';
import { scopedProjectBatchId } from '@/lib/init-artifact-keys';
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
    let ownedDocumentId = '';
    let progressRedis: Awaited<ReturnType<typeof getRedis>> | null = null;
    let progressBatchId = '';
    try {
        const redis = await getRedis();
        progressRedis = redis;
        const { id: projectId } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch { }
        const batchId = String(q.get('batchId') || body?.batchId || '');
        logger.debug(`req batchId: ${batchId}`);
        const termOptions = normalizeDocumentTermJobOptions(body?.terms);
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const scopedBatchId = scopedProjectBatchId(projectId, batchId);
        progressBatchId = scopedBatchId;

        // 确保项目词库存在（PROJECT 范围）
        try {
            await findProjectDictionaryAction(projectId);
        } catch { }

        const only = project.documents?.[0];
        if (!only || !only.url)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        ownedDocumentId = only.id;

        let bodyText = '';
        try {
            const { text } = await extractTextFromUrl(only.url);
            bodyText = String(text || '').trim();
        } catch { }
        if (!bodyText) return NextResponse.json({ error: 'empty content' }, { status: 400 });
        try {
            await updateDocumentStatusDB(only.id, DocumentStatus.TERMS_EXTRACTING as any);
        } catch { }

        const queue = getQueue('doc-terms');
        const jobId = documentTermsJobId(scopedBatchId);
        const existingJob = await queue.getJob(jobId);
        if (existingJob) {
            const state = await existingJob.getState();
            if (!['completed', 'failed', 'unknown'].includes(state)) {
                return NextResponse.json({ ok: true, step: 'terms', reused: true });
            }
            await existingJob.remove();
        }

        await redis.del(
            `docTerms.${scopedBatchId}.failed`,
            `docTerms.${scopedBatchId}.error`,
            `docTerms.${scopedBatchId}.item.terms.all`
        );
        await setTextWithTTL(redis, `docTerms.${scopedBatchId}.total`, '1', TTL_PROGRESS);
        await setTextWithTTL(redis, `docTerms.${scopedBatchId}.done`, '0', TTL_PROGRESS);
        await queue.add(
            'doc-terms',
            {
                id: 'terms.all',
                text: bodyText,
                batchId: scopedBatchId,
                documentId: only.id,
                userId: authCtx.userId,
                tenantId: authCtx.tenantId || undefined,
                projectId,
                ...termOptions,
            },
            { jobId, removeOnComplete: 1000, removeOnFail: 5000 }
        );
        logger.debug(`queued ${jobId}`);
        return NextResponse.json({ ok: true, step: 'terms' });
    } catch (e: any) {
        if (progressRedis && progressBatchId) {
            try {
                await setTextWithTTL(
                    progressRedis,
                    `docTerms.${progressBatchId}.failed`,
                    '1',
                    TTL_PROGRESS
                );
                await setTextWithTTL(
                    progressRedis,
                    `docTerms.${progressBatchId}.error`,
                    DOCUMENT_TERMS_START_ERROR,
                    TTL_PROGRESS
                );
            } catch { }
        }
        if (ownedDocumentId) {
            try {
                await updateDocumentStatusDB(ownedDocumentId, DocumentStatus.ERROR as any);
            } catch { }
        }
        logger.error('[terms start error]', e);
        const status = guardStatus(e);
        return NextResponse.json(
            { error: status >= 500 ? DOCUMENT_TERMS_START_ERROR : guardMessage(e) },
            { status }
        );
    }
}
