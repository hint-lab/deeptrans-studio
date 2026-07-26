/**
 * Server actions accept values from more than the visible form. Keep the
 * dictionary-entry invariants in one small, dependency-free module so imports
 * and manual edits cannot drift apart.
 */
export const DICTIONARY_ENTRY_LIMITS = {
    sourceText: 2_000,
    targetText: 4_000,
    notes: 8_000,
} as const;

export type DictionaryEntryInput = {
    sourceText?: unknown;
    targetText?: unknown;
    notes?: unknown;
};

export type NormalizedDictionaryEntry = {
    sourceText: string;
    targetText: string;
    notes?: string;
};

export type DictionaryImportOrigin = 'import:xlsx' | 'import:tbx';

function text(value: unknown) {
    return value === undefined || value === null ? '' : String(value).trim();
}

function requireWithinLimit(value: string, field: keyof typeof DICTIONARY_ENTRY_LIMITS) {
    const maxLength = DICTIONARY_ENTRY_LIMITS[field];
    if (value.length > maxLength) {
        throw new Error(`${field} 不能超过 ${maxLength} 个字符`);
    }
    return value;
}

/**
 * Normalizes a complete terminology pair. A term without a translation is not
 * a usable dictionary result, so ordinary create/update/import flows reject
 * it. The term-application flow has its own explicit pending-entry path.
 */
export function normalizeDictionaryEntry(input: DictionaryEntryInput): NormalizedDictionaryEntry {
    const sourceText = requireWithinLimit(text(input.sourceText), 'sourceText');
    const targetText = requireWithinLimit(text(input.targetText), 'targetText');
    const notes = requireWithinLimit(text(input.notes), 'notes');

    if (!sourceText) throw new Error('词条原文不能为空');
    if (!targetText) throw new Error('词条译文不能为空');

    return { sourceText, targetText, ...(notes ? { notes } : {}) };
}

/**
 * Imports use source text as the stable identity until a database uniqueness
 * migration can be staged safely. Exact duplicate rows are folded, but two
 * different translations for one source are rejected before any data changes.
 */
export function normalizeAndDeduplicateDictionaryEntries(inputs: DictionaryEntryInput[]) {
    const bySource = new Map<string, NormalizedDictionaryEntry>();
    let duplicateCount = 0;

    for (const input of inputs) {
        const entry = normalizeDictionaryEntry(input);
        const existing = bySource.get(entry.sourceText);
        if (existing) {
            if (existing.targetText !== entry.targetText || existing.notes !== entry.notes) {
                throw new Error(`导入文件中“${entry.sourceText}”存在冲突的译文，请修正后重试`);
            }
            duplicateCount += 1;
            continue;
        }
        bySource.set(entry.sourceText, entry);
    }

    return { entries: Array.from(bySource.values()), duplicateCount };
}

/** Normalize a list of source terms for the pending-term application flow. */
export function normalizeDictionaryEntryTerms(inputs: unknown[]) {
    const terms = new Set<string>();
    let skipped = 0;

    for (const input of inputs) {
        const sourceText = requireWithinLimit(text(input), 'sourceText');
        if (!sourceText || terms.has(sourceText)) {
            skipped += 1;
            continue;
        }
        terms.add(sourceText);
    }

    return { terms: Array.from(terms), skipped };
}

/** The UI exposes file-type provenance, so imports must write the same value. */
export function dictionaryImportOriginForFilename(filename: unknown): DictionaryImportOrigin {
    const name = text(filename).toLowerCase();
    return name.endsWith('.tbx') || name.endsWith('.xml') ? 'import:tbx' : 'import:xlsx';
}
