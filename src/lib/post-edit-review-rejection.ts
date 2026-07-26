export type PostEditReviewRejectionItem = {
    id?: unknown;
    status?: unknown;
    updatedAt?: unknown;
    metadata?: unknown;
};

export type PostEditReviewRejectionUpdate = {
    where: {
        id: string;
        status: 'POST_EDIT_REVIEW';
        updatedAt: unknown;
    };
    data: {
        status: 'QA_REVIEW';
        postEditDiscourse: unknown;
        postEditEmbedded: unknown;
        metadata: Record<string, unknown>;
    };
};

export type ConditionalDocumentItemUpdate = (
    update: PostEditReviewRejectionUpdate
) => Promise<{ count?: number }>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A post-edit proposal is scoped to the source/target revisions it was
 * generated from.  Removing it must remove those revision markers too, while
 * preserving unrelated document-item metadata.
 */
export function clearPostEditReviewMetadata(metadata: unknown): Record<string, unknown> {
    const next = isRecord(metadata) ? { ...metadata } : {};
    delete next.postEditSourceRevision;
    delete next.postEditTargetRevision;
    return next;
}

/**
 * Build the one-statement reset used only when a reviewer rejects
 * POST_EDIT_REVIEW.  The status and optimistic timestamp are both in the
 * predicate, so a stale client cannot clear a newer post-edit proposal.
 */
export function buildPostEditReviewRejectionUpdate(
    item: PostEditReviewRejectionItem,
    jsonNull: unknown
): PostEditReviewRejectionUpdate {
    const itemId = String(item.id || '');
    if (!itemId) throw actionableActionError('缺少文档分段');
    if (item.status !== 'POST_EDIT_REVIEW') {
        throw actionableActionError('当前分段不处于译后复核，无法驳回');
    }
    if (item.updatedAt === undefined || item.updatedAt === null) {
        throw actionableActionError('当前分段缺少并发版本，无法驳回');
    }

    return {
        where: {
            id: itemId,
            status: 'POST_EDIT_REVIEW',
            updatedAt: item.updatedAt,
        },
        data: {
            status: 'QA_REVIEW',
            postEditDiscourse: jsonNull,
            postEditEmbedded: jsonNull,
            metadata: clearPostEditReviewMetadata(item.metadata),
        },
    };
}

/**
 * Returns false when another request changed the item after it was read.
 * Callers must surface that conflict instead of attempting a second,
 * unguarded status or artifact update.
 */
export async function rejectPostEditReviewWithUpdate(
    item: PostEditReviewRejectionItem,
    jsonNull: unknown,
    updateMany: ConditionalDocumentItemUpdate
): Promise<boolean> {
    const written = await updateMany(buildPostEditReviewRejectionUpdate(item, jsonNull));
    return Number(written?.count || 0) === 1;
}
import { actionableActionError } from '@/lib/actionable-action-error';
