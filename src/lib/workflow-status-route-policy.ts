import { requiresPostEditReviewDraftCAS } from '@/lib/post-edit-review-draft-client';

export function getSnapshotlessWorkflowStatusRejection(nextStatus: unknown) {
    if (!requiresPostEditReviewDraftCAS('POST_EDIT_REVIEW', nextStatus)) return undefined;

    return {
        status: 409,
        error: '译后复核签发需要保存当前译文，请在工作台中保存或单项签发后重试',
    };
}
