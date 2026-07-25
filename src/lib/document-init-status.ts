import { DocumentStatus } from '@/types/enums';

export type ProjectInitResumeTarget = 'parse' | 'segment' | 'terms' | 'ide' | 'error';

export const PARSE_MUTABLE_DOCUMENT_STATUSES = [
    DocumentStatus.WAITING,
    DocumentStatus.PARSING,
    DocumentStatus.ERROR,
] as const;

const PARSE_MUTABLE_STATUS_SET = new Set<string>(PARSE_MUTABLE_DOCUMENT_STATUSES);

/**
 * Parsing may only own the early initialization states. This prevents a stale
 * browser tab from moving an already initialized document back to PARSING.
 */
export function canWriteDocumentParseStatus(status: unknown): boolean {
    return PARSE_MUTABLE_STATUS_SET.has(String(status || ''));
}

export function canPersistDocumentParseArtifacts(status: unknown): boolean {
    return String(status || '') === 'PARSING';
}

export function canWriteDocumentSegmentStatus(status: unknown): boolean {
    const value = String(status || '');
    return value === 'PARSING' || value === 'SEGMENTING';
}

export function canWriteDocumentTermsStatus(status: unknown): boolean {
    const value = String(status || '');
    return value === 'SEGMENTING' || value === 'TERMS_EXTRACTING';
}

export function canFinalizeDocumentInitialization(status: unknown): boolean {
    return canWriteDocumentTermsStatus(status);
}

export function resolveProjectInitResumeTarget(status: unknown): ProjectInitResumeTarget {
    switch (String(status || '')) {
        case 'WAITING':
        case 'PARSING':
            return 'parse';
        case 'SEGMENTING':
            return 'segment';
        case 'TERMS_EXTRACTING':
            return 'terms';
        case 'PREPROCESSED':
        case 'TRANSLATING':
        case 'COMPLETED':
            return 'ide';
        case 'ERROR':
        default:
            return 'error';
    }
}
