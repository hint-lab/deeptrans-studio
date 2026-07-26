export type MemoryLanguagePair = {
    sourceLang?: string | null;
    targetLang?: string | null;
};

export type MemoryLanguageUpdateInput = {
    sourceLang?: string;
    targetLang?: string;
};

export type NormalizedMemoryLanguagePair = {
    sourceLang: string;
    targetLang: string;
};

export function normalizeMemoryLanguage(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeMemoryLanguagePair(
    input: MemoryLanguagePair
): NormalizedMemoryLanguagePair {
    return {
        sourceLang: normalizeMemoryLanguage(input.sourceLang),
        targetLang: normalizeMemoryLanguage(input.targetLang),
    };
}

/**
 * Empty form fields are placeholders, not an instruction to erase language
 * metadata. This keeps an unopened or unchanged settings form write-safe.
 */
export function buildMemoryLanguageUpdateInput(
    initial: MemoryLanguagePair,
    current: MemoryLanguagePair
): MemoryLanguageUpdateInput {
    const initialPair = normalizeMemoryLanguagePair(initial);
    const currentPair = normalizeMemoryLanguagePair(current);
    const update: MemoryLanguageUpdateInput = {};

    if (currentPair.sourceLang && currentPair.sourceLang !== initialPair.sourceLang) {
        update.sourceLang = currentPair.sourceLang;
    }
    if (currentPair.targetLang && currentPair.targetLang !== initialPair.targetLang) {
        update.targetLang = currentPair.targetLang;
    }

    return update;
}

export function hasMemoryLanguageUpdate(
    initial: MemoryLanguagePair,
    current: MemoryLanguagePair
): boolean {
    return Object.keys(buildMemoryLanguageUpdateInput(initial, current)).length > 0;
}

/**
 * Server-side callers may bypass the dialog. Keep the same no-blank-write
 * contract at the action boundary.
 */
export function sanitizeMemoryLanguageUpdateInput(
    input: MemoryLanguagePair
): MemoryLanguageUpdateInput {
    const sourceLang = normalizeMemoryLanguage(input.sourceLang);
    const targetLang = normalizeMemoryLanguage(input.targetLang);

    return {
        ...(sourceLang ? { sourceLang } : {}),
        ...(targetLang ? { targetLang } : {}),
    };
}
