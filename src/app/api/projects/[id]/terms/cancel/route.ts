export const runtime = 'nodejs';

import { documentTermsBatchPointerKey, documentTermsJobId } from '@/lib/document-term-job';
import { requestDocumentTermsCancelWithRedis } from '@/lib/document-term-cancellation';
import {
    guardMessage,
    guardStatus,
    requireOwnedProjectDocument,
    requireUser,
    requireWritableProject,
} from '@/lib/guards';
import { scopedProjectBatchId } from '@/lib/init-artifact-keys';
import { getRedis } from '@/lib/redis';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH } from '@/lib/redis-ttl';
import { getQueue } from '@/worker/queue';
import { NextRequest, NextResponse } from 'next/server';

const REMOVABLE_JOB_STATES = new Set(['waiting', 'delayed', 'prioritized', 'paused']);

function lockBelongsToBatch(value: unknown, batchId: string) {
    try {
        return String(JSON.parse(String(value || '{}'))?.batchId || '') === batchId;
    } catch {
        return false;
    }
}

/**
 * Cancel is deliberately scoped to the exact writable project, owned document
 * and deterministic BullMQ job namespace. A caller cannot cancel another
 * document merely by guessing a batch id.
 */
export async function POST(req: NextRequest, ctx: any) {
    try {
        const { id: projectId } = await (ctx?.params || {});
        const body = (await req.json().catch(() => ({}))) as {
            batchId?: string;
        };
        const batchId = String(body?.batchId || '').trim();
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const authCtx = await requireUser();
        // Exact write ownership remains the admission boundary; the document
        // check below additionally binds the cancellation to the same latest
        // document that the terms start endpoint uses. The client supplies no
        // ownership, tenant, user, or document scope.
        const project = await requireWritableProject(projectId, authCtx);
        const activeDocumentId = String(project.documents?.[0]?.id || '');
        if (!activeDocumentId) {
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        }
        const document = await requireOwnedProjectDocument(projectId, activeDocumentId, authCtx);
        if (String(document.status || '') !== 'TERMS_EXTRACTING') {
            return NextResponse.json({ error: '术语提取不再运行，无法停止' }, { status: 409 });
        }

        const redis = await getRedis();
        const pointerKey = documentTermsBatchPointerKey(document.id);
        const activeBatchId = String((await redis.get(pointerKey)) || '');
        if (activeBatchId !== batchId) {
            return NextResponse.json(
                { error: '术语提取任务已更新，请刷新后重试' },
                { status: 409 }
            );
        }

        const scopedBatchId = scopedProjectBatchId(projectId, batchId);
        const queue = getQueue('doc-terms');
        const job = await queue.getJob(documentTermsJobId(scopedBatchId));
        const jobState = job ? await job.getState() : 'unknown';
        if (jobState === 'completed') {
            return NextResponse.json({ error: '术语提取结果已完成，无法停止' }, { status: 409 });
        }
        if (jobState === 'failed') {
            return NextResponse.json({ error: '术语提取已失败，请直接重试' }, { status: 409 });
        }

        const cancel = await requestDocumentTermsCancelWithRedis(redis, scopedBatchId, TTL_BATCH);
        if (!cancel.canceled) {
            return NextResponse.json({ error: '术语提取结果已完成，无法停止' }, { status: 409 });
        }

        // A waiting job can be removed immediately. Active jobs finish their
        // non-interruptible model call, but its post-model and atomic publish
        // fences see the marker above and cannot expose a late result.
        if (job && REMOVABLE_JOB_STATES.has(jobState)) {
            await job.remove().catch(() => {});
        }

        // Releasing only the exact lock value from the active batch lets the
        // owner retry immediately. A late worker cannot release a newer lock.
        const lockKey = `project-init:terms-lock:${document.id}`;
        const lockValue = await redis.get(lockKey);
        if (lockBelongsToBatch(lockValue, batchId)) {
            await releaseOwnedRedisLock(redis, lockKey, String(lockValue)).catch(() => {});
        }

        return NextResponse.json({ ok: true, canceled: true });
    } catch (error) {
        return NextResponse.json({ error: guardMessage(error) }, { status: guardStatus(error) });
    }
}
