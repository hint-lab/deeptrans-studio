/**
 * A selected dictionary is an explicit user constraint, not an optional hint.
 * If it cannot be read, callers must stop before sending an unconstrained
 * translation request to the model.
 */
export class SelectedDictionaryEntriesLoadError extends Error {
    constructor() {
        super('SELECTED_DICTIONARY_ENTRIES_UNAVAILABLE');
        this.name = 'SelectedDictionaryEntriesLoadError';
    }
}

type DictionaryEntriesActionResult = {
    success?: unknown;
    data?: unknown;
    error?: unknown;
};

/**
 * Only an explicit successful array response is safe to use as a selected
 * dictionary. `success: false`, malformed data, and a database-null response
 * all mean that translation must stop rather than silently omit the glossary.
 */
export function requireSelectedDictionaryEntries<T>(
    result: DictionaryEntriesActionResult
): T[] {
    if (result?.success !== true || !Array.isArray(result.data)) {
        throw new SelectedDictionaryEntriesLoadError();
    }

    return result.data as T[];
}
