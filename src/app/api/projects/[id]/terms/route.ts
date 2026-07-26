import { findProjectDictionaryAction } from '@/actions/dictionary';
import { updateDocumentStatusIfCurrentDB } from '@/db/document';
import { extractTextFromUrl } from '@/lib/file-parser';
import {
    DOCUMENT_TERMS_START_ERROR,
    documentTermsBatchPointerKey,
    documentTermsJobId,
    normalizeDocumentTermJobOptions,
    resolveDocumentTermsStatus,
} from '@/lib/document-term-job';
import { guardMessage, guardStatus, requireUser, requireWritableProject } from '@/lib/guards';
import { scopedProjectBatchId } from '@/lib/init-artifact-keys';
import { canWriteDocumentTermsStatus } from '@/lib/document-init-status';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH, TTL_PROGRESS, setTextWithTTL } from '@/lib/redis-ttl';
import { getReadableDocumentSourceUrlForOwner } from '@/server/uploaded-object';
import { DocumentStatus } from '@/types/enums';
import { getQueue } from '@/worker/queue';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
const logger = createLogger(
    {
        type: 'request:api:projects:[id]:terms',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export async function POST(req: NextRequest, ctx: any) {
    let progressRedis: Awaited<ReturnType<typeof getRedis>> | null = null;
    let progressBatchId = '';
    let termsLockKey = '';
    let termsLockValue = '';
    let termsLockTransferred = false;
    try {
        const redis = await getRedis();
        progressRedis = redis;
        const { id: projectId } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch {}
        const batchId = String(q.get('batchId') || body?.batchId || '');
        logger.debug(`req batchId: ${batchId}`);
        const termOptions = normalizeDocumentTermJobOptions(body?.terms);
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const scopedBatchId = scopedProjectBatchId(projectId, batchId);
        progressBatchId = scopedBatchId;

        // Never recycle a canceled namespace. A model call from the old job
        // may return after the user stops it; clearing this marker on a retry
        // would let that stale worker publish into the replacement run.
        if ((await redis.get(`docTerms.${scopedBatchId}.cancel`)) === '1') {
            return NextResponse.json(
                {
                    error: '术语提取已停止，请创建新的重试任务',
                    requiresNewBatch: true,
                },
                { status: 409 }
            );
        }

        const only = project.documents?.[0];
        if (!only || !only.name)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        if (!canWriteDocumentTermsStatus(only.status)) {
            return NextResponse.json(
                { error: '文档已进入其他阶段，不能从旧页面重新启动术语提取' },
                { status: 409 }
            );
        }
        const sourceUrl = await getReadableDocumentSourceUrlForOwner(only.name, authCtx);

        const termsBatchPointerKey = documentTermsBatchPointerKey(only.id);
        const rememberedBatchId = String((await redis.get(termsBatchPointerKey)) || '');
        if (rememberedBatchId && body?.retry !== true) {
            const rememberedScopedBatchId = scopedProjectBatchId(projectId, rememberedBatchId);
            const [rememberedTotal, rememberedDone, rememberedFailed, rememberedCanceled] =
                await Promise.all([
                    redis.get(`docTerms.${rememberedScopedBatchId}.total`),
                    redis.get(`docTerms.${rememberedScopedBatchId}.done`),
                    redis.get(`docTerms.${rememberedScopedBatchId}.failed`),
                    redis.get(`docTerms.${rememberedScopedBatchId}.cancel`),
                ]);
            const rememberedStatus = resolveDocumentTermsStatus(
                rememberedTotal,
                rememberedDone,
                rememberedFailed,
                rememberedCanceled
            );
            if (rememberedStatus !== 'idle') {
                return NextResponse.json({
                    ok: true,
                    step: 'terms',
                    reused: true,
                    activeBatchId: rememberedBatchId,
                    termsStatus: rememberedStatus,
                });
            }
            return NextResponse.json(
                {
                    error: '术语提取结果已过期，请重试',
                    activeBatchId: rememberedBatchId,
                    requiresRetry: true,
                },
                { status: 409 }
            );
        }

        termsLockKey = `project-init:terms-lock:${only.id}`;
        termsLockValue = JSON.stringify({ token: randomUUID(), batchId });
        const termsLockAcquired = await redis.set(
            termsLockKey,
            termsLockValue,
            'EX',
            60 * 60,
            'NX'
        );
        if (termsLockAcquired !== 'OK') {
            const activeLock = await redis.get(termsLockKey);
            let activeBatchId = '';
            try {
                activeBatchId = String(JSON.parse(String(activeLock || '{}'))?.batchId || '');
            } catch {}
            return NextResponse.json({
                ok: true,
                step: 'terms',
                reused: true,
                activeBatchId: activeBatchId || undefined,
            });
        }

        // 确保项目词库存在（PROJECT 范围）
        try {
            await findProjectDictionaryAction(projectId);
        } catch {}

        let bodyText = '';
        try {
            const { text } = await extractTextFromUrl(sourceUrl);
            bodyText = String(text || '').trim();
        } catch {}
        if (!bodyText) return NextResponse.json({ error: 'empty content' }, { status: 400 });
        const claimed = await updateDocumentStatusIfCurrentDB(
            only.id,
            DocumentStatus.TERMS_EXTRACTING as any,
            ['SEGMENTING', 'TERMS_EXTRACTING']
        );
        if (!claimed) {
            return NextResponse.json({ error: '文档阶段已变化，术语提取未启动' }, { status: 409 });
        }

        const queue = getQueue('doc-terms');
        const jobId = documentTermsJobId(scopedBatchId);
        const existingJob = await queue.getJob(jobId);
        if (existingJob) {
            const state = await existingJob.getState();
            if (!['completed', 'failed', 'unknown'].includes(state)) {
                // Older/racing callers may already have queued this exact job
                // without the document pointer. Remember it for reload recovery;
                // the newly-acquired lock is released by finally because the
                // existing worker does not own its token.
                await setTextWithTTL(redis, termsBatchPointerKey, batchId, TTL_BATCH);
                return NextResponse.json({
                    ok: true,
                    step: 'terms',
                    reused: true,
                    activeBatchId: batchId,
                });
            }
            await existingJob.remove();
        }

        await redis.del(
            `docTerms.${scopedBatchId}.failed`,
            `docTerms.${scopedBatchId}.error`,
            `docTerms.${scopedBatchId}.item.terms.all`,
            `docTerms.${scopedBatchId}.cancel`,
            `docTerms.${scopedBatchId}.terminal.terms.all`
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
                termsLockKey,
                termsLockValue,
                ...termOptions,
            },
            { jobId, removeOnComplete: 1000, removeOnFail: 5000 }
        );
        await setTextWithTTL(redis, termsBatchPointerKey, batchId, TTL_BATCH);
        termsLockTransferred = true;
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
            } catch {}
        }
        logger.error('[terms start error]', e);
        const status = guardStatus(e);
        return NextResponse.json(
            { error: status >= 500 ? DOCUMENT_TERMS_START_ERROR : guardMessage(e) },
            { status }
        );
    } finally {
        if (progressRedis && termsLockKey && termsLockValue && !termsLockTransferred) {
            await releaseOwnedRedisLock(progressRedis, termsLockKey, termsLockValue).catch(
                () => {}
            );
        }
    }
}
