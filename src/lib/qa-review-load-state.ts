export type QaReviewLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type QaReviewLoadState = {
    itemId: string;
    status: QaReviewLoadStatus;
};

export const idleQaReviewLoadState: QaReviewLoadState = {
    itemId: '',
    status: 'idle',
};

export function loadingQaReviewResults(itemId: string): QaReviewLoadState {
    return { itemId, status: 'loading' };
}

export function readyQaReviewResults(itemId: string): QaReviewLoadState {
    return { itemId, status: 'ready' };
}

export function failedQaReviewResults(itemId: string): QaReviewLoadState {
    return { itemId, status: 'error' };
}

/**
 * A segment switch renders before its loading effect starts. Treat a state
 * owned by another segment as loading rather than presenting that segment as
 * "not run" or showing its stale failure.
 */
export function resolveQaReviewLoadState(
    state: QaReviewLoadState,
    activeItemId: string
): QaReviewLoadState {
    if (!activeItemId) return idleQaReviewLoadState;
    return state.itemId === activeItemId ? state : loadingQaReviewResults(activeItemId);
}
