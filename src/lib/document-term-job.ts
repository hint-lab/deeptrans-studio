import type { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions';

export const DOCUMENT_TERMS_START_ERROR = '术语提取任务启动失败，请重试';
export const DOCUMENT_TERMS_RUN_ERROR = '术语提取失败，请重试';

export type DocumentTermsStatus = 'idle' | 'running' | 'completed' | 'failed';

/**
 * BullMQ reserves `:` in custom job IDs. Project-scoped batch IDs deliberately
 * contain `:`, so encode the whole scope before using it as a job ID.
 */
export function documentTermsJobId(scopedBatchId: string): string {
    const encodedBatchId = encodeURIComponent(String(scopedBatchId || '').trim());
    if (!encodedBatchId) throw new Error('missing scoped batch id');
    return `docTerms.${encodedBatchId}.all`;
}

export function documentTermsBatchPointerKey(documentId: string): string {
    const normalized = String(documentId || '').trim();
    if (!normalized) throw new Error('missing document id');
    return `project-init:terms-batch:${normalized}`;
}

export function normalizeDocumentTermJobOptions(value: unknown): DocumentTermExtractOptions {
    const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const finiteNumber = (candidate: unknown) => {
        const number = Number(candidate);
        return Number.isFinite(number) ? number : undefined;
    };

    return {
        maxTerms: finiteNumber(input.maxTerms),
        chunkSize: finiteNumber(input.chunkSize),
        overlap: finiteNumber(input.overlap),
        prompt:
            typeof input.prompt === 'string'
                ? input.prompt.trim().slice(0, 4000) || undefined
                : undefined,
    };
}

export function resolveDocumentTermsStatus(
    totalValue: unknown,
    doneValue: unknown,
    failedValue: unknown
): DocumentTermsStatus {
    if (Number(failedValue) > 0) return 'failed';

    const total = Number(totalValue) || 0;
    const done = Number(doneValue) || 0;
    if (total <= 0) return 'idle';
    return done >= total ? 'completed' : 'running';
}
