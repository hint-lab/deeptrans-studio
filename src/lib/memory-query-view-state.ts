export type MemoryQueryMode = 'browse' | 'search';

export type MemoryQueryRequest = {
    memoryId: string;
    mode: MemoryQueryMode;
    query: string;
    page: number;
    pageSize: number;
    searchConfigKey: string;
    similarityThreshold: number;
    maxResults: number;
    refreshVersion: number;
};

export type MemoryQueryViewState = {
    requestKey: string;
    memoryId: string;
    mode: MemoryQueryMode;
    status: 'loading' | 'ready' | 'error';
    message?: string;
};

/**
 * A result belongs to more than a memory ID: changing the query, threshold,
 * page, or retrieval configuration also makes the previous result stale.
 */
export function memoryQueryRequestKey(request: MemoryQueryRequest) {
    return JSON.stringify([
        request.memoryId,
        request.mode,
        request.query,
        request.page,
        request.pageSize,
        request.searchConfigKey,
        request.similarityThreshold,
        request.maxResults,
        request.refreshVersion,
    ]);
}

export function loadingMemoryQueryView(request: MemoryQueryRequest): MemoryQueryViewState {
    return {
        requestKey: memoryQueryRequestKey(request),
        memoryId: request.memoryId,
        mode: request.mode,
        status: 'loading',
    };
}

export function readyMemoryQueryView(request: MemoryQueryRequest): MemoryQueryViewState {
    return {
        ...loadingMemoryQueryView(request),
        status: 'ready',
    };
}

export function failedMemoryQueryView(
    request: MemoryQueryRequest,
    message: string
): MemoryQueryViewState {
    return {
        ...loadingMemoryQueryView(request),
        status: 'error',
        message,
    };
}

export function isMemoryQueryViewCurrent(
    view: MemoryQueryViewState | undefined,
    request: MemoryQueryRequest
) {
    return view?.requestKey === memoryQueryRequestKey(request);
}

/**
 * Never present a result, empty state, or error from another request as if it
 * belonged to the current library/query. The caller can safely render this
 * fallback while React waits for the effect that launches the new request.
 */
export function resolveMemoryQueryView(
    view: MemoryQueryViewState | undefined,
    request: MemoryQueryRequest
): MemoryQueryViewState {
    return view && isMemoryQueryViewCurrent(view, request)
        ? view
        : loadingMemoryQueryView(request);
}
