import { actionableActionError } from '@/lib/actionable-action-error';
import { withSourceRevisions } from '@/lib/source-revision';

export type PostEditReviewDraftMode = 'save' | 'signoff';

export type PostEditReviewDraftItem = {
    id?: unknown;
    status?: unknown;
    sourceText?: unknown;
    targetText?: unknown;
    metadata?: unknown;
    updatedAt?: unknown;
};

export type PostEditReviewDraftUpdate = {
    where: {
        id: string;
        status: 'POST_EDIT_REVIEW';
        sourceText: string;
        targetText: string | null;
        updatedAt: unknown;
    };
    data: {
        targetText: string;
        metadata: Record<string, unknown>;
        status?: 'SIGN_OFF';
    };
};

function normalisePersistedTarget(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

/**
 * Builds the only write allowed for a target draft in post-edit review.
 *
 * The predicate contains the exact source and target snapshots as well as
 * `updatedAt`, so a stale browser tab cannot overwrite another editor's
 * revision or sign it off. Keeping this pure makes the compare-and-set
 * boundary independently testable from the server action and database.
 */
export function buildPostEditReviewDraftUpdate(
    item: PostEditReviewDraftItem,
    {
        expectedSourceText,
        expectedTargetText,
        targetText,
        mode,
    }: {
        expectedSourceText: string;
        expectedTargetText: string;
        targetText: string;
        mode: PostEditReviewDraftMode;
    }
): PostEditReviewDraftUpdate {
    const itemId = String(item.id || '');
    if (!itemId) throw actionableActionError('缺少文档分段');
    if (item.status !== 'POST_EDIT_REVIEW') {
        throw actionableActionError('当前分段不处于译后复核，请刷新后再保存或签发');
    }
    if (item.updatedAt === undefined || item.updatedAt === null) {
        throw actionableActionError('当前分段缺少并发版本，请刷新后重试');
    }

    const currentSourceText = String(item.sourceText || '');
    const currentTargetText = normalisePersistedTarget(item.targetText);
    const expectedSource = String(expectedSourceText || '');
    const expectedTarget = String(expectedTargetText || '');
    const nextTarget = String(targetText || '');

    if (
        currentSourceText !== expectedSource ||
        String(currentTargetText ?? '') !== expectedTarget
    ) {
        throw actionableActionError(
            '当前原文或译文已被其他窗口更新；本次修改未保存也未签发。请刷新后查看最新版本，再重新编辑。'
        );
    }
    if (mode === 'signoff' && !nextTarget.trim()) {
        throw actionableActionError('译文为空，无法签发。请先输入并保存译文。');
    }

    return {
        where: {
            id: itemId,
            status: 'POST_EDIT_REVIEW',
            sourceText: currentSourceText,
            targetText: currentTargetText,
            updatedAt: item.updatedAt,
        },
        data: {
            targetText: nextTarget,
            metadata: withSourceRevisions(
                item.metadata as Record<string, unknown> | null,
                currentSourceText,
                {
                    target: true,
                }
            ),
            ...(mode === 'signoff' ? { status: 'SIGN_OFF' as const } : {}),
        },
    };
}
