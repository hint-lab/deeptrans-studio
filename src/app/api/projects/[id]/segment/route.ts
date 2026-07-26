import { extractTextFromUrl } from '@/lib/file-parser';
import {
    DOCUMENT_INITIALIZATION_CONFLICT,
    replaceDocumentItemsForInitializationDB,
} from '@/db/documentItem';
import {
    DEFAULT_SEGMENT_GRANULARITY,
    limitSegmentPreview,
    normalizeSegmentGranularity,
    segmentPreviewActiveGranularityKey,
    type SegmentGranularity,
    type StructuredParagraph,
    type StructuredSegment,
} from '@/lib/document-segmentation';
import {
    readInitStructuredRaw,
    scopedProjectBatchId,
} from '@/lib/init-artifact-keys';
import {
    guardMessage,
    guardStatus,
    requireOwnedProject,
    requireOwnedProjectDocument,
    requireUser,
    requireWritableProject,
} from '@/lib/guards';
import { canWriteDocumentSegmentStatus } from '@/lib/document-init-status';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { releaseOwnedRedisLock } from '@/lib/redis-lock';
import { TTL_BATCH, TTL_PROGRESS, setJSONWithTTL, setTextWithTTL } from '@/lib/redis-ttl';
import {
    createSemanticDocumentSegmentationPlan,
    documentSegmentationModelCacheKey,
    fingerprintStructuredSegmentationSource,
    type SemanticSegmentationPlanner,
} from '@/server/semantic-document-segmentation';
import { resolveWorkflowPromptSnapshot } from '@/server/workflow-prompts';
import {
    getReadableDocumentSourceUrlForOwner,
    getReadableUploadedObjectBufferForOwner,
} from '@/server/uploaded-object';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const logger = createLogger(
    { type: 'request:segment' },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

type PreviewPlanState = 'running' | 'ready';
type CachedPreviewPlan = {
    protocolVersion: 1;
    state: PreviewPlanState;
    planId: string;
    ownerUserId: string;
    projectId: string;
    documentId: string;
    title: string;
    granularity: SegmentGranularity;
    promptVersion: number;
    sourceFingerprint: string;
    planner?: SemanticSegmentationPlanner;
    modelCalls?: number;
    segments?: StructuredSegment[];
};

/**
 * A plan record is keyed only by its server-created UUID and project. It is
 * intentionally independent from the browser's initialization batch id, so a
 * caller cannot buy repeated LLM plans merely by changing that client value.
 */
function previewPlanKey(projectId: string, planId: string) {
    return `seg.plan:${projectId}:${planId}`;
}

function previewPlanPointerKey(
    ownerUserId: string,
    projectId: string,
    documentId: string,
    granularity: SegmentGranularity,
    promptVersion: number,
    sourceFingerprint: string,
    modelCacheKey: string
) {
    return `seg.plan.pointer:${ownerUserId}:${projectId}:${documentId}:${granularity}:p${promptVersion}:${modelCacheKey}:${sourceFingerprint}`;
}

function previewPlanLockKey(pointerKey: string) {
    return `${pointerKey}:lock`;
}

function planIdFrom(value: unknown): string | null {
    const planId = String(value || '').trim();
    return /^[A-Za-z0-9_-]{16,128}$/.test(planId) ? planId : null;
}

function paragraphsFromText(text: string): StructuredParagraph[] {
    return String(text || '')
        .split(/\n\s*\n|\r?\n/)
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => ({ text: value, level: null, styleName: 'Normal' }));
}

function structuredArtifactJsonFile(document: any): string | null {
    const structured = document?.structured;
    if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return null;
    const artifacts = (structured as Record<string, unknown>).artifacts;
    if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) return null;
    const jsonFile = (artifacts as Record<string, unknown>).jsonFile;
    return typeof jsonFile === 'string' && jsonFile.trim() ? jsonFile.trim() : null;
}

async function loadStructuredParagraphsForOwner(input: {
    redis: Awaited<ReturnType<typeof getRedis>>;
    scopedBatchId: string;
    document: any;
    authCtx: Awaited<ReturnType<typeof requireUser>>;
}): Promise<StructuredParagraph[]> {
    // The document's owner-verified persisted artifact is authoritative. Do
    // not let a caller-selected initialization batch choose the source for a
    // fresh plan when the document already has a durable parse artifact.
    const artifactFile = structuredArtifactJsonFile(input.document);
    if (artifactFile) {
        try {
            const bytes = await getReadableUploadedObjectBufferForOwner(artifactFile, input.authCtx);
            const structured = JSON.parse(Buffer.from(bytes).toString('utf8'));
            if (Array.isArray(structured?.paragraphs) && structured.paragraphs.length) {
                return structured.paragraphs as StructuredParagraph[];
            }
        } catch {
            // Do not fetch the stored jsonUrl directly. An owner-scoped object
            // key is the only supported artifact read boundary.
        }
    }

    try {
        const raw = await readInitStructuredRaw(input.redis, input.scopedBatchId);
        const structured = raw ? JSON.parse(String(raw)) : null;
        if (Array.isArray(structured?.paragraphs) && structured.paragraphs.length) {
            return structured.paragraphs as StructuredParagraph[];
        }
    } catch {
        // A malformed or expired cache is not an authority. Re-extract from
        // the owner-verified original object below.
    }

    const sourceUrl = await getReadableDocumentSourceUrlForOwner(input.document?.name, input.authCtx);
    const extracted = await extractTextFromUrl(sourceUrl);
    return paragraphsFromText(String(extracted?.text || '').trim());
}

function parseCachedPreviewPlan(value: unknown): CachedPreviewPlan | null {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const plan = parsed as Partial<CachedPreviewPlan>;
        if (
            plan.protocolVersion !== 1 ||
            (plan.state !== 'running' && plan.state !== 'ready') ||
            !planIdFrom(plan.planId) ||
            !String(plan.ownerUserId || '') ||
            !String(plan.projectId || '') ||
            !String(plan.documentId || '') ||
            !String(plan.sourceFingerprint || '')
        ) {
            return null;
        }
        if (plan.state === 'ready' && !Array.isArray(plan.segments)) return null;
        return plan as CachedPreviewPlan;
    } catch {
        return null;
    }
}

function isPlanForOwner(
    plan: CachedPreviewPlan | null,
    ownerUserId: string,
    projectId: string,
    documentId?: string
): plan is CachedPreviewPlan {
    return Boolean(
        plan &&
            plan.ownerUserId === ownerUserId &&
            plan.projectId === projectId &&
            (!documentId || plan.documentId === documentId)
    );
}

function displaySegments(plan: CachedPreviewPlan): StructuredSegment[] {
    const segments = Array.isArray(plan.segments) ? plan.segments : [];
    if (!plan.title) return segments;
    return [
        {
            type: 'TITLE',
            sourceText: plan.title,
            metadata: {
                level: 1,
                segmentGranularity: plan.granularity,
                segmentation: {
                    engine: plan.planner || 'structure-fallback',
                    promptVersion: plan.promptVersion,
                    planId: plan.planId,
                    sourceBlockId: 'document-title',
                },
            },
        },
        ...segments,
    ];
}

async function readPlan(
    redis: Awaited<ReturnType<typeof getRedis>>,
    projectId: string,
    planId: string
) {
    return parseCachedPreviewPlan(await redis.get(previewPlanKey(projectId, planId)));
}

function averageBodyCharacters(segments: readonly StructuredSegment[] | undefined): number {
    if (!Array.isArray(segments)) return 0;
    const bodySegments = segments.filter(
        segment => String(segment?.type || '').toUpperCase() !== 'TITLE'
    );
    if (!bodySegments.length) return 0;
    return Math.round(
        bodySegments.reduce((total, segment) => total + String(segment.sourceText || '').length, 0) /
            bodySegments.length
    );
}

async function persistAppliedSegments(input: {
    redis: Awaited<ReturnType<typeof getRedis>>;
    scopedBatchId: string;
    documentId: string;
    plan: CachedPreviewPlan;
}) {
    const output = displaySegments(input.plan);
    if (!output.length) throw new Error('no document items to persist');
    const items = output.map((segment, index) => ({
        documentId: input.documentId,
        order: index + 1,
        sourceText: segment.sourceText,
        targetText: null,
        status: 'NOT_STARTED' as any,
        type: segment.type || 'TEXT',
        metadata: segment.metadata ?? null,
    }));
    const persisted = await replaceDocumentItemsForInitializationDB(input.documentId, items);
    await setTextWithTTL(input.redis, `seg.${input.scopedBatchId}.total`, '1', TTL_PROGRESS);
    await setTextWithTTL(input.redis, `seg.${input.scopedBatchId}.done`, '1', TTL_PROGRESS);
    await setJSONWithTTL(
        input.redis,
        `seg.${input.scopedBatchId}.item.seg.all`,
        {
            segments: output,
            granularity: input.plan.granularity,
            planId: input.plan.planId,
            promptVersion: input.plan.promptVersion,
            planner: input.plan.planner,
        },
        TTL_BATCH
    );
    return persisted;
}

export async function POST(req: NextRequest, ctx: any) {
    try {
        const redis = await getRedis();
        const { id: projectId } = await (ctx?.params || {});
        const query = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch {}
        const batchId = String(query.get('batchId') || body?.batchId || '');
        const documentIdFromRequest =
            String(query.get('docId') || body?.documentId || '') || undefined;
        const preview = query.get('preview') === '1' || body?.segment?.preview === true;
        const requestedGranularity = normalizeSegmentGranularity(
            query.get('granularity') || body?.segment?.granularity || DEFAULT_SEGMENT_GRANULARITY
        );
        const requestedPlanId = planIdFrom(body?.segment?.planId || query.get('planId'));
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const document = documentIdFromRequest
            ? await requireOwnedProjectDocument(projectId, documentIdFromRequest, authCtx)
            : project.documents?.[0];
        if (!document?.id || !document?.name) {
            return NextResponse.json({ error: 'document not found' }, { status: 404 });
        }
        const documentId = String(document.id);
        const scopedBatchId = scopedProjectBatchId(projectId, batchId);

        if (preview) {
            const promptSnapshot = await resolveWorkflowPromptSnapshot(
                authCtx,
                'document-segmentation'
            );
            const paragraphs = await loadStructuredParagraphsForOwner({
                redis,
                scopedBatchId,
                document,
                authCtx,
            });
            if (!paragraphs.length) return NextResponse.json({ error: 'empty content' }, { status: 400 });
            const sourceFingerprint = fingerprintStructuredSegmentationSource(paragraphs);
            const pointerKey = previewPlanPointerKey(
                authCtx.userId,
                projectId,
                documentId,
                requestedGranularity,
                promptSnapshot.version,
                sourceFingerprint,
                documentSegmentationModelCacheKey()
            );
            const reusablePlanId = planIdFrom(await redis.get(pointerKey));
            if (reusablePlanId) {
                const reusable = await readPlan(redis, projectId, reusablePlanId);
                if (
                    isPlanForOwner(reusable, authCtx.userId, projectId, documentId) &&
                    reusable.state === 'ready' &&
                    reusable.sourceFingerprint === sourceFingerprint
                ) {
                    return NextResponse.json({
                        ok: true,
                        step: 'segment-preview',
                        status: 'ready',
                        reused: true,
                        planId: reusable.planId,
                        count: reusable.segments?.length || 0,
                        granularity: reusable.granularity,
                        promptVersion: reusable.promptVersion,
                        planner: reusable.planner,
                    });
                }
            }

            const lockKey = previewPlanLockKey(pointerKey);
            const planId = randomUUID();
            const lockAcquired = await redis.set(lockKey, planId, 'EX', 300, 'NX');
            if (lockAcquired !== 'OK') {
                const runningPlanId = planIdFrom(await redis.get(lockKey));
                return NextResponse.json({
                    ok: true,
                    step: 'segment-preview',
                    status: 'running',
                    planId: runningPlanId || undefined,
                    granularity: requestedGranularity,
                    promptVersion: promptSnapshot.version,
                });
            }

            try {
                await setJSONWithTTL(
                    redis,
                    previewPlanKey(projectId, planId),
                    {
                        protocolVersion: 1,
                        state: 'running',
                        planId,
                        ownerUserId: authCtx.userId,
                        projectId,
                        documentId,
                        title: String(document.originalName || ''),
                        granularity: requestedGranularity,
                        promptVersion: promptSnapshot.version,
                        sourceFingerprint,
                    } satisfies CachedPreviewPlan,
                    TTL_BATCH
                );
                const generated = await createSemanticDocumentSegmentationPlan({
                    paragraphs,
                    granularity: requestedGranularity,
                    personalInstruction: promptSnapshot.instruction,
                    promptVersion: promptSnapshot.version,
                    planId,
                });
                const readyPlan: CachedPreviewPlan = {
                    protocolVersion: 1,
                    state: 'ready',
                    planId,
                    ownerUserId: authCtx.userId,
                    projectId,
                    documentId,
                    title: String(document.originalName || ''),
                    granularity: requestedGranularity,
                    promptVersion: promptSnapshot.version,
                    sourceFingerprint: generated.sourceFingerprint,
                    planner: generated.planner,
                    modelCalls: generated.modelCalls,
                    segments: generated.segments,
                };
                if (generated.sourceFingerprint !== sourceFingerprint) {
                    throw new Error('document source changed while creating the segmentation plan');
                }
                await setJSONWithTTL(redis, previewPlanKey(projectId, planId), readyPlan, TTL_BATCH);
                await setTextWithTTL(redis, pointerKey, planId, TTL_BATCH);
                await setTextWithTTL(
                    redis,
                    segmentPreviewActiveGranularityKey(scopedBatchId),
                    requestedGranularity,
                    TTL_BATCH
                );
                logger.info('Semantic segmentation plan prepared', {
                    projectId,
                    documentId,
                    planId,
                    planner: generated.planner,
                    segments: generated.segments.length,
                    modelCalls: generated.modelCalls,
                });
                return NextResponse.json({
                    ok: true,
                    step: 'segment-preview',
                    status: 'ready',
                    planId,
                    count: generated.segments.length,
                    granularity: requestedGranularity,
                    promptVersion: promptSnapshot.version,
                    planner: generated.planner,
                });
            } finally {
                await releaseOwnedRedisLock(redis, lockKey, planId).catch(() => {});
            }
        }

        if (!canWriteDocumentSegmentStatus(document.status)) {
            return NextResponse.json(
                { error: '文档已进入后续阶段，不能从旧页面重新分割' },
                { status: 409 }
            );
        }
        if (!requestedPlanId) {
            return NextResponse.json(
                { error: '请先生成并确认 AI 分割方案' },
                { status: 409 }
            );
        }
        const plan = await readPlan(redis, projectId, requestedPlanId);
        if (!isPlanForOwner(plan, authCtx.userId, projectId, documentId) || plan.state !== 'ready') {
            return NextResponse.json(
                { error: 'AI 分割预览已过期，请重新生成' },
                { status: 409 }
            );
        }
        const paragraphs = await loadStructuredParagraphsForOwner({
            redis,
            scopedBatchId,
            document,
            authCtx,
        });
        if (fingerprintStructuredSegmentationSource(paragraphs) !== plan.sourceFingerprint) {
            return NextResponse.json(
                { error: '文档内容已变化，请重新生成 AI 分割方案' },
                { status: 409 }
            );
        }
        const persisted = await persistAppliedSegments({
            redis,
            scopedBatchId,
            documentId,
            plan,
        });
        logger.info('Applied reviewed semantic segmentation plan', {
            projectId,
            documentId,
            planId: plan.planId,
            planner: plan.planner,
            count: persisted.count,
        });
        return NextResponse.json({
            ok: true,
            step: 'segment',
            count: persisted.count,
            planId: plan.planId,
            granularity: plan.granularity,
            promptVersion: plan.promptVersion,
            planner: plan.planner,
        });
    } catch (error: any) {
        if (String(error?.message || '') === DOCUMENT_INITIALIZATION_CONFLICT) {
            return NextResponse.json(
                { error: '文档已有分段或已进入后续阶段，禁止覆盖现有翻译内容' },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: guardMessage(error) }, { status: guardStatus(error) });
    }
}

export async function GET(req: NextRequest, ctx: any) {
    try {
        const { id: projectId } = await (ctx?.params || {});
        const authCtx = await requireUser();
        await requireOwnedProject(projectId, authCtx);
        const batchId = req.nextUrl.searchParams.get('batchId') || '';
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const preview = req.nextUrl.searchParams.get('preview') === '1';
        const showAll = req.nextUrl.searchParams.get('all') === '1';
        const planId = planIdFrom(req.nextUrl.searchParams.get('planId'));
        const scopedBatchId = scopedProjectBatchId(projectId, batchId);
        const redis = await getRedis();

        if (preview && planId) {
            const plan = await readPlan(redis, projectId, planId);
            if (!isPlanForOwner(plan, authCtx.userId, projectId)) {
                return NextResponse.json({ error: 'AI 分割预览已过期，请重新生成' }, { status: 409 });
            }
            if (plan.state === 'running') {
                return NextResponse.json({
                    ok: true,
                    step: 'segment-preview',
                    status: 'running',
                    planId: plan.planId,
                    granularity: plan.granularity,
                    promptVersion: plan.promptVersion,
                    segments: [],
                    totalCount: 0,
                    bodyCount: 0,
                    averageCharacters: 0,
                });
            }
            const allSegments = displaySegments(plan);
            const limited = limitSegmentPreview(allSegments, showAll);
            return NextResponse.json({
                ok: true,
                step: 'segment-preview',
                status: 'ready',
                planId: plan.planId,
                granularity: plan.granularity,
                promptVersion: plan.promptVersion,
                planner: plan.planner,
                modelCalls: plan.modelCalls,
                segments: limited.segments,
                totalCount: limited.totalCount,
                bodyCount: limited.bodyCount,
                averageCharacters: averageBodyCharacters(allSegments),
            });
        }

        // Keep the applied-document status endpoint compatible with the
        // project-init status poller. Preview reads must include planId above.
        const [total, done, all] = await Promise.all([
            redis.get(`seg.${scopedBatchId}.total`),
            redis.get(`seg.${scopedBatchId}.done`),
            redis.get(`seg.${scopedBatchId}.item.seg.all`),
        ]);
        const totalNumber = Number(total) || 0;
        const doneNumber = Number(done) || 0;
        let payload: any = null;
        try {
            payload = all ? JSON.parse(String(all)) : null;
        } catch {}
        const segments = Array.isArray(payload?.segments)
            ? (payload.segments as StructuredSegment[])
            : undefined;
        const limited = limitSegmentPreview(segments, !preview || showAll);
        return NextResponse.json({
            segProgress:
                totalNumber > 0 ? Math.min(100, Math.round((doneNumber / totalNumber) * 100)) : 0,
            status: totalNumber > 0 && doneNumber >= totalNumber ? 'ready' : 'idle',
            granularity: normalizeSegmentGranularity(payload?.granularity || DEFAULT_SEGMENT_GRANULARITY),
            planId: payload?.planId,
            promptVersion: Number(payload?.promptVersion || 0),
            planner: payload?.planner,
            segments: limited.segments,
            totalCount: limited.totalCount,
            bodyCount: limited.bodyCount,
            averageCharacters: averageBodyCharacters(segments),
        });
    } catch (error: any) {
        return NextResponse.json({ error: guardMessage(error) }, { status: guardStatus(error) });
    }
}
