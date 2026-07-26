/**
 * Shared page/query normalization for the dictionary detail surface. Server
 * actions are callable by the browser, so their pagination contract cannot
 * rely on the select options rendered in one client component.
 */
export const DICTIONARY_ENTRY_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export const DICTIONARY_ENTRY_ORIGIN_FILTERS = [
    'manual',
    'import:xlsx',
    'import:tbx',
    'import:client',
    'apply:new',
    'apply:copied',
    'apply:user',
    'apply:mt',
] as const;

export type DictionaryEntryOriginFilter = (typeof DICTIONARY_ENTRY_ORIGIN_FILTERS)[number];

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE = 1_000_000;
const MAX_PAGE_SIZE = 500;

function finiteInteger(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export function normalizeDictionaryEntryPage(value: unknown) {
    const page = finiteInteger(value);
    if (!page || page < 1) return DEFAULT_PAGE;
    return Math.min(MAX_PAGE, page);
}

export function normalizeDictionaryEntryPageSize(value: unknown) {
    const pageSize = finiteInteger(value);
    if (!pageSize || pageSize < 1) return DEFAULT_PAGE_SIZE;
    return Math.min(MAX_PAGE_SIZE, pageSize);
}

export function normalizeDictionaryEntryOriginFilter(
    value: unknown
): DictionaryEntryOriginFilter | undefined {
    const origin = String(value || '').trim();
    if (!origin) return undefined;
    return (DICTIONARY_ENTRY_ORIGIN_FILTERS as readonly string[]).includes(origin)
        ? (origin as DictionaryEntryOriginFilter)
        : undefined;
}

export function dictionaryEntryPageCount(total: number, pageSize: number) {
    const normalizedTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
    return Math.max(1, Math.ceil(normalizedTotal / normalizeDictionaryEntryPageSize(pageSize)));
}

export function clampDictionaryEntryPage(page: number, total: number, pageSize: number) {
    return Math.min(
        normalizeDictionaryEntryPage(page),
        dictionaryEntryPageCount(total, pageSize)
    );
}
