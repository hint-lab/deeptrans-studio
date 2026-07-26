export type PreviewFileType = 'pdf' | 'docx' | 'text' | 'unknown';
export type PreviewDependency = 'pdfjs' | 'jszip' | 'docx';
export type PreviewDependencyState = 'idle' | 'loading' | 'ready' | 'failed';

export type PreviewDependencyStates = Record<PreviewDependency, PreviewDependencyState>;

/** Keep externally hosted preview dependencies bounded when the CDN is unavailable. */
export const PREVIEW_DEPENDENCY_TIMEOUT_MS = 8_000;
export const PREVIEW_RENDER_TIMEOUT_MS = 15_000;

export const INITIAL_PREVIEW_DEPENDENCY_STATES: PreviewDependencyStates = {
    pdfjs: 'idle',
    jszip: 'idle',
    docx: 'idle',
};

export function getPreviewDependencies(fileType: PreviewFileType): PreviewDependency[] {
    if (fileType === 'pdf') return ['pdfjs'];
    if (fileType === 'docx') return ['jszip', 'docx'];
    return [];
}

export function arePreviewDependenciesReady(
    fileType: PreviewFileType,
    states: PreviewDependencyStates
): boolean {
    return getPreviewDependencies(fileType).every(dependency => states[dependency] === 'ready');
}

export function getFailedPreviewDependencies(
    fileType: PreviewFileType,
    states: PreviewDependencyStates
): PreviewDependency[] {
    return getPreviewDependencies(fileType).filter(dependency => states[dependency] === 'failed');
}

export class PreviewTimeoutError extends Error {
    constructor(message = 'Preview operation timed out') {
        super(message);
        this.name = 'PreviewTimeoutError';
    }
}

/**
 * Script `onError` is not guaranteed to fire on a disconnected network. Wrap
 * the subsequent worker/render promises as well so the preview cannot keep a
 * loading skeleton forever after an external dependency stalls.
 */
export function withPreviewTimeout<T>(
    operation: Promise<T>,
    timeoutMs = PREVIEW_RENDER_TIMEOUT_MS
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new PreviewTimeoutError()), timeoutMs);
        operation.then(
            value => {
                clearTimeout(timeout);
                resolve(value);
            },
            error => {
                clearTimeout(timeout);
                reject(error);
            }
        );
    });
}
