export type BatchQAWorkflowItem = {
    id: string;
    status?: string | null;
};

export function isBatchQAReviewReady(status: unknown): boolean {
    return status === 'MT_REVIEW';
}

/**
 * The one-click workflow may only enqueue segments that have durably reached
 * the MT review boundary. Keeping unfinished MT segments separate prevents a
 * partial pre-translation run from being silently presented as QA complete.
 */
export function partitionBatchQAWorkflowItems<T extends BatchQAWorkflowItem>(items: T[]) {
    return {
        reviewReadyItems: items.filter(item => isBatchQAReviewReady(item.status)),
        unfinishedMtItems: items.filter(item => item.status === 'MT'),
    };
}
