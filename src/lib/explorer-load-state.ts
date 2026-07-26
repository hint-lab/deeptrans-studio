export type ExplorerLoadPhase = 'loading' | 'ready' | 'empty' | 'error';

export type ExplorerLoadState = {
    phase: ExplorerLoadPhase;
    hasLoadedResult: boolean;
    isRefreshing: boolean;
    hasError: boolean;
};

export const initialExplorerLoadState: ExplorerLoadState = {
    phase: 'loading',
    hasLoadedResult: false,
    isRefreshing: false,
    hasError: false,
};

/**
 * Starts a load without discarding a verified result for the same project.
 * The UI can therefore keep a usable document tree visible while a refresh is
 * in flight, rather than briefly presenting the project as empty.
 */
export function startExplorerLoad(previous: ExplorerLoadState): ExplorerLoadState {
    if (previous.hasLoadedResult) {
        return {
            phase: previous.phase === 'empty' ? 'empty' : 'ready',
            hasLoadedResult: true,
            isRefreshing: true,
            hasError: false,
        };
    }

    return initialExplorerLoadState;
}

export function completeExplorerLoad(documentCount: number): ExplorerLoadState {
    return {
        phase: documentCount > 0 ? 'ready' : 'empty',
        hasLoadedResult: true,
        isRefreshing: false,
        hasError: false,
    };
}

/**
 * A refresh failure must not erase a previously verified document tree. The
 * error remains visible, but the tree (or verified empty state) is retained.
 */
export function failExplorerLoad(previous: ExplorerLoadState): ExplorerLoadState {
    if (previous.hasLoadedResult) {
        return {
            phase: previous.phase === 'empty' ? 'empty' : 'ready',
            hasLoadedResult: true,
            isRefreshing: false,
            hasError: true,
        };
    }

    return {
        phase: 'error',
        hasLoadedResult: false,
        isRefreshing: false,
        hasError: true,
    };
}

/**
 * A response may update the Explorer only when it belongs to the newest
 * request and to the project currently being displayed.
 */
export function isCurrentExplorerLoadRequest(
    requestId: number,
    newestRequestId: number,
    expectedProjectId: string,
    responseProjectId: unknown
) {
    return requestId === newestRequestId && responseProjectId === expectedProjectId;
}
