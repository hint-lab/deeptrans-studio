export type MemoryImportFormat = 'csv' | 'tsv' | 'tmx' | 'spreadsheet';

/**
 * Resolves the actual parser behaviour from either a filename/extension or a
 * browser MIME value. This is shared by request validation, job identity, and
 * the worker so one uploaded object cannot be deduplicated as one format then
 * rejected or parsed as another format later.
 */
export function resolveMemoryImportFormat(value: unknown): MemoryImportFormat | null {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!normalized) return null;
    const mediaType = normalized.split(';', 1)[0]?.trim() || normalized;

    if (
        normalized === 'tsv' ||
        normalized.endsWith('.tsv') ||
        mediaType === 'text/tab-separated-values'
    ) {
        return 'tsv';
    }
    if (normalized === 'csv' || normalized.endsWith('.csv') || mediaType === 'text/csv') {
        return 'csv';
    }
    if (
        normalized === 'tmx' ||
        normalized.endsWith('.tmx') ||
        normalized.includes('tmx') ||
        normalized === 'xml' ||
        normalized.endsWith('.xml') ||
        mediaType === 'application/xml' ||
        mediaType === 'text/xml'
    ) {
        return 'tmx';
    }
    if (
        normalized === 'xlsx' ||
        normalized === 'xls' ||
        normalized.endsWith('.xlsx') ||
        normalized.endsWith('.xls') ||
        mediaType.includes('spreadsheet') ||
        mediaType.includes('excel')
    ) {
        return 'spreadsheet';
    }
    return null;
}
