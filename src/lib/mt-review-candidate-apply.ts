export const MT_REVIEW_CANDIDATE_CONFLICT_MESSAGE =
    '当前译文已被其他窗口更新，候选译文未应用；请刷新后重试';

export type MtReviewCandidateSnapshot = {
    sourceText: string;
    targetText: string;
};

export type MtReviewCandidateItem = {
    id?: unknown;
    status?: unknown;
    sourceText?: unknown;
    targetText?: unknown;
    updatedAt?: unknown;
};

export type MtReviewCandidateConditionalUpdate = {
    where: {
        id: string;
        status: 'MT_REVIEW';
        sourceText: string;
        targetText: string;
        updatedAt: unknown;
    };
};

export type MtReviewCandidateUpdate = (
    update: MtReviewCandidateConditionalUpdate
) => Promise<{ count?: number }>;

/**
 * Candidate translations are generated separately from the target editor.
 * Apply them only when the exact source/target pair the reviewer saw is still
 * current. `updatedAt` closes the race between the snapshot check and write;
 * the text predicates make a stale browser tab reject a newer human edit even
 * when it starts its request after that edit has been saved.
 */
export function buildMtReviewCandidateApplyWhere(
    item: MtReviewCandidateItem,
    expected: MtReviewCandidateSnapshot
): MtReviewCandidateConditionalUpdate['where'] {
    const id = String(item.id || '');
    if (!id) throw new Error('缺少文档分段，无法应用候选译文');
    if (item.updatedAt === undefined || item.updatedAt === null) {
        throw new Error('当前分段缺少并发版本，无法应用候选译文');
    }
    if (item.status !== 'MT_REVIEW') {
        throw new Error('当前分段不处于预翻译复核，候选译文未应用；请刷新后重试');
    }

    const sourceText = String(item.sourceText || '');
    const targetText = String(item.targetText || '');
    if (sourceText !== String(expected.sourceText || '')) {
        throw new Error('当前分段原文已变化，候选译文未应用；请刷新后重试');
    }
    if (targetText !== String(expected.targetText || '')) {
        throw new Error(MT_REVIEW_CANDIDATE_CONFLICT_MESSAGE);
    }

    return {
        id,
        status: 'MT_REVIEW',
        sourceText: String(expected.sourceText || ''),
        targetText: String(expected.targetText || ''),
        updatedAt: item.updatedAt,
    };
}

/**
 * Perform exactly one conditional write.  A zero-count result is a conflict,
 * not a signal to retry without the reviewer-visible snapshot.
 */
export async function applyMtReviewCandidateWithUpdate(
    item: MtReviewCandidateItem,
    expected: MtReviewCandidateSnapshot,
    updateMany: MtReviewCandidateUpdate
): Promise<void> {
    const where = buildMtReviewCandidateApplyWhere(item, expected);
    const written = await updateMany({ where });
    if (Number(written?.count || 0) !== 1) {
        throw new Error(MT_REVIEW_CANDIDATE_CONFLICT_MESSAGE);
    }
}
