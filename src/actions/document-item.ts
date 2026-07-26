'use server';

import { findDocumentItemByIdDB, updateDocumentItemByIdDB } from '@/db/documentItem';
import { actionableActionError } from '@/lib/actionable-action-error';
import { rethrowPublicActionError } from '@/lib/action-error-boundary';
import {
    requireOwnedDocumentItem,
    requireUser,
    requireWritableDocumentItem,
} from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { sourceRevision, withSourceRevisions } from '@/lib/source-revision';
import {
    isSyntaxEvaluationTargetCompatible,
    normalizeSyntaxQualityResult,
} from '@/lib/syntax-quality';
import {
    hasCurrentPersistedQualityAssureResult,
    hasCurrentPersistedPreTranslationResult,
    hasCurrentPersistedPostEditResult,
    isAllowedDocumentItemStatusTransition,
    isDocumentItemTranslationStage,
    isCurrentQualityAssureRun,
} from '@/lib/translation-stage-transitions';
import { rejectPostEditReviewWithUpdate } from '@/lib/post-edit-review-rejection';
import {
    buildPostEditReviewDraftUpdate,
    type PostEditReviewDraftItem,
    type PostEditReviewDraftMode,
    type PostEditReviewDraftUpdate,
} from '@/lib/post-edit-review-draft';
import { requiresPostEditReviewDraftCAS } from '@/lib/post-edit-review-draft-client';
import { getReadableDocumentSourceUrlForOwner } from '@/server/uploaded-object';
import { Prisma, type TranslationStage } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const logger = createLogger(
    {
        type: 'actions:document-item',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export type ContentIDType = {
    id: string;
    name: string;
    isSelected?: boolean;
    children?: ContentIDType[];
};

export type TabType = {
    id: string;
    name: string;
    isActive?: boolean;
};

// 在文件开头添加类型定义
type Metadata = {
    level?: number;
    parentId?: string;
    headingId?: string;
    [key: string]: any;
};

type PreTranslationStageItem = {
    id: string;
    status?: TranslationStage | string | null;
    sourceText?: string | null;
    targetText?: string | null;
    preTranslateEmbedded?: unknown;
    metadata?: unknown;
    updatedAt?: Date;
};

type PreTranslationStageWrite = {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
};

type PreTranslationStageDeps = {
    requireWritableDocumentItem: (itemId: string) => Promise<PreTranslationStageItem>;
    updateDocumentItem: (write: PreTranslationStageWrite) => Promise<{ count: number }>;
    createRunId?: () => string;
};

export type PreTranslationStartInput = {
    // The last server-confirmed source snapshot. It protects a local draft
    // from overwriting a newer version in another tab.
    expectedSourceText: string;
    // The source the translator can currently see. It is persisted in the
    // same compare-and-set that claims MT, so starting is a single action.
    sourceText?: string;
};

type QualityAssureStageItem = {
    id: string;
    status?: TranslationStage | string | null;
    sourceText?: string | null;
    targetText?: string | null;
    qualityAssureSyntax?: unknown;
    metadata?: unknown;
    updatedAt?: Date;
};

type QualityAssureStageWrite = {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
};

type QualityAssureStageDeps = {
    requireWritableDocumentItem: (itemId: string) => Promise<QualityAssureStageItem>;
    updateDocumentItem: (write: QualityAssureStageWrite) => Promise<{ count: number }>;
    createRunId?: () => string;
};

type PostEditReviewDraftDeps = {
    requireWritableDocumentItem: (itemId: string) => Promise<PostEditReviewDraftItem>;
    updateDocumentItem: (write: PostEditReviewDraftUpdate) => Promise<{ count: number }>;
};

/**
 * The dependency form exists solely to test the CAS operation without a real
 * session/database. Keep its authorization dependency explicit at runtime so
 * an injected test or future caller cannot silently turn the exported helper
 * into an unguarded write path.
 */
function requirePostEditReviewDraftDeps(
    deps: PostEditReviewDraftDeps,
    requireWritableDocumentItem: unknown
): PostEditReviewDraftDeps {
    if (typeof requireWritableDocumentItem !== 'function') {
        throw new TypeError('译后复核保存需要 requireWritableDocumentItem 授权依赖');
    }
    if (typeof deps.updateDocumentItem !== 'function') {
        throw new TypeError('译后复核保存需要文档更新依赖');
    }
    return { ...deps, requireWritableDocumentItem } as PostEditReviewDraftDeps;
}

function withPreTranslationRunId(metadata: unknown, runId: string): Record<string, unknown> {
    const next =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : {};

    // A previous attempt may have left a durable proposal behind before a
    // reviewer rolled it back. It cannot satisfy completion for this new run.
    delete next.preTranslateResultRunId;
    next.preTranslateRunId = runId;
    return next;
}

function withQualityAssureRunId(metadata: unknown, runId: string): Record<string, unknown> {
    const next =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : {};

    // A retry may use identical source/target text. Fence an older response by
    // clearing its result identity before this claim becomes runnable.
    delete next.qaResultRunId;
    next.qaRunId = runId;
    return next;
}

function withoutQualityAssureRunId(metadata: unknown): Record<string, unknown> {
    const next =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : {};
    delete next.qaRunId;
    delete next.qaResultRunId;
    return next;
}

async function persistPostEditReviewDraftWithDeps(
    itemId: string,
    input: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
    },
    mode: PostEditReviewDraftMode,
    deps: PostEditReviewDraftDeps
) {
    const item = await deps.requireWritableDocumentItem(itemId);
    const update = buildPostEditReviewDraftUpdate(item, { ...input, mode });
    const written = await deps.updateDocumentItem(update);
    if (Number(written?.count || 0) !== 1) {
        throw actionableActionError(
            '当前原文或译文已被其他操作更新；本次修改未保存也未签发。请刷新后查看最新版本，再重新编辑。'
        );
    }
    return {
        ...item,
        targetText: update.data.targetText,
        metadata: update.data.metadata,
        ...(mode === 'signoff' ? { status: 'SIGN_OFF' as TranslationStage } : {}),
    };
}

/**
 * Persist a manual target edit only when the reviewer is still editing the
 * exact source/target version that was loaded. This is intentionally separate
 * from the older generic update action: an editor save must never turn into a
 * last-writer-wins overwrite of another tab's post-edit review.
 */
export async function savePostEditReviewDraftWithDeps(
    itemId: string,
    input: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
    },
    deps: PostEditReviewDraftDeps
) {
    const requireWritableDocumentItem = deps?.requireWritableDocumentItem;
    const guardedDeps = requirePostEditReviewDraftDeps(deps, requireWritableDocumentItem);
    return persistPostEditReviewDraftWithDeps(itemId, input, 'save', guardedDeps);
}

/**
 * Persist the visible post-edit draft and enter SIGN_OFF in one compare-and-
 * set. A stale client gets a conflict with no target-text write and no stage
 * transition, rather than signing off an earlier persisted translation.
 */
export async function signOffPostEditReviewWithDeps(
    itemId: string,
    input: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
    },
    deps: PostEditReviewDraftDeps
) {
    const requireWritableDocumentItem = deps?.requireWritableDocumentItem;
    const guardedDeps = requirePostEditReviewDraftDeps(deps, requireWritableDocumentItem);
    return persistPostEditReviewDraftWithDeps(itemId, input, 'signoff', guardedDeps);
}

/**
 * Claim an untouched item for a single pre-translation run.  Unlike the
 * generic status action, this intentionally does not allow an MT -> MT
 * repeat: a second tab must fail before it can spend another model run.
 *
 * The dependency form makes the optimistic compare-and-set contract testable
 * without a database/session.
 */
export async function startPreTranslationWithSourceDraftDeps(
    itemId: string,
    input: PreTranslationStartInput,
    deps: PreTranslationStageDeps
) {
    const item = await deps.requireWritableDocumentItem(itemId);
    const currentStatus = isDocumentItemTranslationStage(item.status) ? item.status : 'NOT_STARTED';
    const currentSourceText = String(item.sourceText || '');
    const expectedSourceText = String(input.expectedSourceText || '');
    const sourceTextToStart = String(input.sourceText ?? expectedSourceText);

    if (currentStatus !== 'NOT_STARTED') {
        throw actionableActionError('当前分段已被其他操作启动，请刷新后重试');
    }
    if (currentSourceText !== expectedSourceText) {
        throw actionableActionError('当前分段原文已更新，请刷新后再启动预翻译');
    }
    if (!sourceTextToStart.trim()) {
        throw actionableActionError('原文内容为空，无法进行预翻译');
    }
    const runId = String(deps.createRunId ? deps.createRunId() : randomUUID()).trim();
    if (!runId) {
        throw actionableActionError('无法创建预翻译运行标识，请刷新后重试');
    }

    const where: Record<string, unknown> = {
        id: itemId,
        status: 'NOT_STARTED',
        sourceText: currentSourceText,
    };
    if (item.updatedAt) where.updatedAt = item.updatedAt;

    const data: Record<string, unknown> = {
        status: 'MT',
        metadata: withPreTranslationRunId(item.metadata, runId),
    };
    if (sourceTextToStart !== currentSourceText) {
        data.sourceText = sourceTextToStart;
    }

    const updated = await deps.updateDocumentItem({
        where,
        data,
    });
    if (Number(updated?.count || 0) !== 1) {
        throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
    }
    return {
        ...item,
        sourceText: sourceTextToStart,
        status: 'MT' as TranslationStage,
        metadata: withPreTranslationRunId(item.metadata, runId),
        preTranslateRunId: runId,
    };
}

/**
 * Compatibility helper for callers that are already working with a
 * server-confirmed source. New UI starts should use the draft-aware helper
 * above so “start” can save and claim atomically.
 */
export async function startPreTranslationWithDeps(
    itemId: string,
    expectedSourceText: string,
    deps: PreTranslationStageDeps
) {
    return startPreTranslationWithSourceDraftDeps(
        itemId,
        { expectedSourceText, sourceText: expectedSourceText },
        deps
    );
}

/**
 * Promote an in-flight MT run only after its result was durably saved.  The
 * versioned write also means a concurrent tab cannot turn its own stale UI
 * result into a local or persisted success.
 */
export async function completePreTranslationWithDeps(
    itemId: string,
    expectedRunId: string,
    deps: PreTranslationStageDeps
) {
    const runId = String(expectedRunId || '').trim();
    if (!runId) {
        throw actionableActionError('预翻译运行标识缺失，请刷新后重试');
    }
    const item = await deps.requireWritableDocumentItem(itemId);
    const currentStatus = isDocumentItemTranslationStage(item.status) ? item.status : 'NOT_STARTED';
    if (currentStatus !== 'MT') {
        throw actionableActionError('当前分段不在预翻译执行阶段，请刷新后重试');
    }
    if (!hasCurrentPersistedPreTranslationResult(item, runId)) {
        throw actionableActionError('预翻译结果缺失或已过期，无法提交人工复核');
    }

    const where: Record<string, unknown> = { id: itemId, status: 'MT' };
    if (item.updatedAt) where.updatedAt = item.updatedAt;
    const updated = await deps.updateDocumentItem({
        where,
        data: { status: 'MT_REVIEW' },
    });
    if (Number(updated?.count || 0) !== 1) {
        throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
    }
    return { ...item, status: 'MT_REVIEW' as TranslationStage };
}

/**
 * Claim one MT_REVIEW item for a single quality-assurance run.  A same-stage
 * QA update is deliberately not accepted: otherwise two stale browser tabs
 * can both spend a model call for the same segment.
 */
export async function startQualityAssureWithDeps(
    itemId: string,
    expectedSourceText: string,
    expectedTargetText: string,
    deps: QualityAssureStageDeps
) {
    const item = await deps.requireWritableDocumentItem(itemId);
    const currentStatus = isDocumentItemTranslationStage(item.status) ? item.status : 'NOT_STARTED';
    const currentSourceText = String(item.sourceText || '');
    const currentTargetText = String(item.targetText || '');

    if (currentStatus !== 'MT_REVIEW') {
        throw actionableActionError('当前分段不在预翻译复核阶段，请刷新后重试');
    }
    if (!currentSourceText.trim()) {
        throw actionableActionError('原文内容为空，无法进行质检');
    }
    if (!currentTargetText.trim()) {
        throw actionableActionError('译文内容为空，无法进行质检');
    }
    if (currentSourceText !== String(expectedSourceText || '')) {
        throw actionableActionError('当前分段原文已变化，请保存并刷新后再启动质检');
    }
    if (currentTargetText !== String(expectedTargetText || '')) {
        throw actionableActionError('当前分段译文已变化，请保存并刷新后再启动质检');
    }
    const runId = String(deps.createRunId ? deps.createRunId() : randomUUID()).trim();
    if (!runId) {
        throw actionableActionError('无法创建质检运行标识，请刷新后重试');
    }

    const where: Record<string, unknown> = {
        id: itemId,
        status: 'MT_REVIEW',
        sourceText: currentSourceText,
        targetText: currentTargetText,
    };
    if (item.updatedAt) where.updatedAt = item.updatedAt;

    const updated = await deps.updateDocumentItem({
        where,
        data: {
            status: 'QA',
            metadata: withQualityAssureRunId(item.metadata, runId),
        },
    });
    if (Number(updated?.count || 0) !== 1) {
        throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
    }
    return {
        ...item,
        status: 'QA' as TranslationStage,
        metadata: withQualityAssureRunId(item.metadata, runId),
        qaRunId: runId,
    };
}

/**
 * Promote a QA run to review only after the exact run persisted a current,
 * complete result. This is separate from generic stage updates so an API or
 * stale UI cannot label a missing or older result as reviewable.
 */
export async function completeQualityAssureWithDeps(
    itemId: string,
    expectedRunId: string,
    deps: QualityAssureStageDeps
) {
    const runId = String(expectedRunId || '').trim();
    if (!runId) {
        throw actionableActionError('质检运行标识缺失，请刷新后重试');
    }
    const item = await deps.requireWritableDocumentItem(itemId);
    const currentStatus = isDocumentItemTranslationStage(item.status) ? item.status : 'NOT_STARTED';
    if (currentStatus !== 'QA') {
        throw actionableActionError('当前分段不在质检执行阶段，请刷新后重试');
    }
    if (!hasCurrentPersistedQualityAssureResult(item, runId)) {
        throw actionableActionError('质检结果缺失或已过期，无法提交质检复核');
    }

    const where: Record<string, unknown> = { id: itemId, status: 'QA' };
    if (item.updatedAt) where.updatedAt = item.updatedAt;
    const updated = await deps.updateDocumentItem({
        where,
        data: { status: 'QA_REVIEW' },
    });
    if (Number(updated?.count || 0) !== 1) {
        throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
    }
    return { ...item, status: 'QA_REVIEW' as TranslationStage };
}

/**
 * Reject the current QA review in the same optimistic write that clears its
 * artifact and run identities. A stale tab therefore cannot clear a newer
 * review or let a late result republish itself after rejection.
 */
export async function rejectQualityAssureWithDeps(itemId: string, deps: QualityAssureStageDeps) {
    const item = await deps.requireWritableDocumentItem(itemId);
    const currentStatus = isDocumentItemTranslationStage(item.status) ? item.status : 'NOT_STARTED';
    if (currentStatus !== 'QA_REVIEW') {
        throw actionableActionError('当前分段不在质检复核阶段，请刷新后重试');
    }

    const where: Record<string, unknown> = { id: itemId, status: 'QA_REVIEW' };
    if (item.updatedAt) where.updatedAt = item.updatedAt;
    const updated = await deps.updateDocumentItem({
        where,
        data: {
            status: 'QA',
            qualityAssureBiTerm: Prisma.DbNull,
            qualityAssureSyntax: Prisma.DbNull,
            qualityAssureSyntaxEmbedded: Prisma.DbNull,
            metadata: withoutQualityAssureRunId(item.metadata),
        },
    });
    if (Number(updated?.count || 0) !== 1) {
        throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
    }
    return { ...item, status: 'QA' as TranslationStage };
}

// 更新文档项原文
export async function updateOriginalTextAction(itemId: string, sourceText: string) {
    try {
        await requireWritableDocumentItem(itemId);
        return await updateDocumentItemByIdDB(itemId, { sourceText });
    } catch (error) {
        logger.error('更新原文失败:', error);
        throw new Error('更新原文失败');
    }
}
export async function updateTranslationAction(itemId: string, targetText: string) {
    try {
        const item = await requireWritableDocumentItem(itemId);
        const metadata = withSourceRevisions(
            (item as any)?.metadata as Record<string, unknown> | null,
            (item as any)?.sourceText,
            { target: true }
        );
        return await updateDocumentItemByIdDB(itemId, { targetText, metadata } as any);
    } catch (error) {
        logger.error('更新译文失败:', error);
        throw new Error('更新译文失败');
    }
}

// 更新文档项状态（Server Action）
export async function updateDocItemStatusAction(itemId: string, status: TranslationStage | string) {
    try {
        const item = await requireWritableDocumentItem(itemId);
        if (!isDocumentItemTranslationStage(status)) {
            throw actionableActionError('无效的翻译阶段');
        }
        const s = status;
        const currentStatus = isDocumentItemTranslationStage((item as any).status)
            ? ((item as any).status as TranslationStage)
            : 'NOT_STARTED';
        if (!isAllowedDocumentItemStatusTransition(currentStatus, s)) {
            throw actionableActionError(`不允许从 ${currentStatus} 跳转到 ${s}`);
        }

        // The executable QA boundary is deliberately server-owned. Generic
        // updates are still used for human rollback paths (QA_REVIEW -> QA and
        // QA -> MT_REVIEW), but must never start/repeat a QA model run or mark
        // it reviewable without the run-token protocol below.
        if (
            (s === 'QA' && (currentStatus === 'MT_REVIEW' || currentStatus === 'QA')) ||
            (s === 'QA_REVIEW' && (currentStatus === 'QA' || currentStatus === 'QA_REVIEW'))
        ) {
            throw actionableActionError('单段质检必须通过受保护的运行流程启动和完成');
        }

        if (requiresPostEditReviewDraftCAS(currentStatus, s)) {
            throw actionableActionError('译后复核签发必须通过受保护的保存流程，请刷新后重试');
        }

        // Validate the QA artifact when entering/retrying the automatic
        // post-edit stage.  Do not make a rollback from POST_EDIT_REVIEW
        // depend on it: rollbacks must remain available for recovery.
        if (s === 'POST_EDIT' && (currentStatus === 'QA_REVIEW' || currentStatus === 'POST_EDIT')) {
            const syntax = normalizeSyntaxQualityResult((item as any).qualityAssureSyntax);
            const evaluation = syntax.evaluation;
            if (syntax.status !== 'complete' || syntax.legacy || !evaluation) {
                throw actionableActionError('质检结果不完整，请重新质检后再进入译后编辑');
            }
            if (evaluation.sourceRevision !== sourceRevision((item as any).sourceText)) {
                throw actionableActionError('当前原文已变化，请重新质检后再进入译后编辑');
            }
            const currentTarget = String((item as any).targetText || '');
            const proposal = String((item as any).qualityAssureSyntaxEmbedded || '');
            if (!isSyntaxEvaluationTargetCompatible(evaluation, currentTarget, proposal)) {
                throw actionableActionError('当前译文已变化，请重新质检后再进入译后编辑');
            }
        }

        // POST_EDIT_REVIEW is the human review of a completed post-edit run,
        // not a label a client may assign without persisted workflow output.
        if (
            currentStatus === 'POST_EDIT' &&
            s === 'POST_EDIT_REVIEW' &&
            !hasCurrentPersistedPostEditResult(item as any)
        ) {
            throw actionableActionError('译后编辑结果缺失或已过期，请重新执行译后编辑后再提交复核');
        }
        const updated = await prisma.documentItem.updateMany({
            where: { id: itemId, updatedAt: (item as any).updatedAt },
            data: { status: s },
        });
        if (Number(updated?.count || 0) !== 1) {
            throw actionableActionError('当前分段已被其他操作更新，请重试');
        }
        return { ...(item as any), status: s };
    } catch (error) {
        logger.error('更新文档项状态失败:', error);
        rethrowPublicActionError(error, '更新文档项状态失败，请刷新后重试');
    }
}

/**
 * Start a single pre-translation run through a strict NOT_STARTED -> MT
 * compare-and-set.  This is deliberately narrower than the general status
 * action because a repeat MT write would let concurrent IDE tabs both invoke
 * the model pipeline.
 */
export async function startPreTranslationAction(
    itemId: string,
    expectedSourceText: string,
    sourceText?: string
) {
    try {
        return await startPreTranslationWithSourceDraftDeps(
            itemId,
            { expectedSourceText, sourceText },
            {
                requireWritableDocumentItem: async id =>
                    (await requireWritableDocumentItem(id)) as PreTranslationStageItem,
                updateDocumentItem: async write => prisma.documentItem.updateMany(write as any),
                createRunId: randomUUID,
            }
        );
    } catch (error) {
        logger.error('启动预翻译失败:', error);
        rethrowPublicActionError(error, '启动预翻译失败，请刷新后重试');
    }
}

/**
 * Finish a single pre-translation run only after its current result has been
 * saved.  The guard prevents an empty/stale client result from being labelled
 * as ready for human MT review.
 */
export async function completePreTranslationAction(itemId: string, expectedRunId: string) {
    try {
        return await completePreTranslationWithDeps(itemId, expectedRunId, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as PreTranslationStageItem,
            updateDocumentItem: async write => prisma.documentItem.updateMany(write as any),
        });
    } catch (error) {
        logger.error('完成预翻译失败:', error);
        rethrowPublicActionError(error, '完成预翻译失败，请刷新后重试');
    }
}

/**
 * Start a single QA run through a strict MT_REVIEW -> QA compare-and-set.
 * Batch QA deliberately remains on its independent worker/persistence
 * protocol and does not call this action.
 */
export async function startQualityAssureAction(
    itemId: string,
    expectedSourceText: string,
    expectedTargetText: string
) {
    try {
        return await startQualityAssureWithDeps(itemId, expectedSourceText, expectedTargetText, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as QualityAssureStageItem,
            updateDocumentItem: async write => prisma.documentItem.updateMany(write as any),
            createRunId: randomUUID,
        });
    } catch (error) {
        logger.error('启动质检失败:', error);
        rethrowPublicActionError(error, '启动质检失败，请刷新后重试');
    }
}

/**
 * Finish only the QA run that saved the current source/target evaluation.
 */
export async function completeQualityAssureAction(itemId: string, expectedRunId: string) {
    try {
        return await completeQualityAssureWithDeps(itemId, expectedRunId, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as QualityAssureStageItem,
            updateDocumentItem: async write => prisma.documentItem.updateMany(write as any),
        });
    } catch (error) {
        logger.error('完成质检失败:', error);
        rethrowPublicActionError(error, '完成质检失败，请刷新后重试');
    }
}

/**
 * Reject a QA review atomically with its artifact clear and token invalidation.
 */
export async function rejectQualityAssureAction(itemId: string) {
    try {
        return await rejectQualityAssureWithDeps(itemId, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as QualityAssureStageItem,
            updateDocumentItem: async write => prisma.documentItem.updateMany(write as any),
        });
    } catch (error) {
        logger.error('驳回质检复核失败:', error);
        rethrowPublicActionError(error, '驳回质检复核失败，请刷新后重试');
    }
}

/**
 * Rejecting post-edit review is deliberately not expressed as two generic
 * status transitions plus a separate artifact clear.  This server-owned
 * operation verifies ownership, requires the exact review status, and clears
 * the proposal and its revision metadata in the same optimistic write.
 */
export async function rejectPostEditReviewAction(itemId: string) {
    try {
        const item = await requireWritableDocumentItem(itemId);
        const rejected = await rejectPostEditReviewWithUpdate(item, Prisma.DbNull, async update =>
            prisma.documentItem.updateMany(update as any)
        );
        if (!rejected) {
            throw actionableActionError('当前分段已被其他操作更新，请刷新后重试');
        }
        return { ...(item as any), status: 'QA_REVIEW' as TranslationStage };
    } catch (error) {
        logger.error('驳回译后复核失败:', error);
        rethrowPublicActionError(error, '驳回译后复核失败，请刷新后重试');
    }
}

export async function savePostEditReviewDraftAction(
    itemId: string,
    input: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
    }
) {
    try {
        return await savePostEditReviewDraftWithDeps(itemId, input, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as PostEditReviewDraftItem,
            updateDocumentItem: async update => prisma.documentItem.updateMany(update as any),
        });
    } catch (error) {
        logger.error('保存译后复核译文失败:', error);
        rethrowPublicActionError(error, '保存译后复核译文失败，请刷新后重试');
    }
}

export async function signOffPostEditReviewAction(
    itemId: string,
    input: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
    }
) {
    try {
        return await signOffPostEditReviewWithDeps(itemId, input, {
            requireWritableDocumentItem: async id =>
                (await requireWritableDocumentItem(id)) as PostEditReviewDraftItem,
            updateDocumentItem: async update => prisma.documentItem.updateMany(update as any),
        });
    } catch (error) {
        logger.error('签发译后复核译文失败:', error);
        rethrowPublicActionError(error, '签发译后复核译文失败，请刷新后重试');
    }
}

// 根据内容ID获取详细内容
export const getContentByIdAction = async (id: string) => {
    try {
        await requireOwnedDocumentItem(id);
        const documentItem = await findDocumentItemByIdDB(id);

        // 确保返回的数据包含预期的字段
        if (!documentItem) return null;
        const metadata = ((documentItem as any)?.metadata as Record<string, unknown> | null) || {};
        const storedTargetRevision = String(metadata.targetSourceRevision || '');
        const targetSourceMatches =
            !storedTargetRevision ||
            storedTargetRevision === sourceRevision((documentItem as any)?.sourceText);
        return {
            sourceText: documentItem.sourceText,
            // An embedded translation is a proposal until the user applies it.
            // Falling back to it here made the review panel claim it was applied.
            targetText:
                targetSourceMatches && documentItem.targetText
                    ? String(documentItem.targetText)
                    : '',
            status: (documentItem as any)?.status || 'NOT_STARTED',
        };
    } catch (error) {
        logger.error('获取文档内容失败:', error);
        rethrowPublicActionError(error, '无法获取当前分段内容，请刷新后重试');
    }
};

// Server Action: 通过分段ID获取所属文档的云端预览信息
export async function getDocumentPreviewByItemIdAction(itemId: string) {
    try {
        const authCtx = await requireUser();
        const item = await requireOwnedDocumentItem(itemId, authCtx);
        const doc = item.document;
        if (!doc) return null;
        const fileUrl = await getReadableDocumentSourceUrlForOwner(doc.name, authCtx);
        return {
            documentId: doc.id,
            fileUrl,
            mimeType: doc.mimeType,
            name: doc.originalName || doc.name,
        };
    } catch (error) {
        logger.error('获取预览信息失败:', error);
        return null;
    }
}
