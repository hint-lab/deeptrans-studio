export const EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE =
    '未解析到有效的原文/译文对，请检查文件内容和列映射后重试';

/**
 * The final receipt-backed transaction deliberately commits the text rows and
 * their pgvector updates together. Keep that unit bounded: larger files need
 * a separately designed, resumable chunk protocol rather than an accidental
 * multi-minute transaction.
 */
export const MAX_TRANSLATION_MEMORY_IMPORT_PAIRS = 500;

export function translationMemoryImportPairLimitMessage(pairCount: number) {
    return `单次最多导入 ${MAX_TRANSLATION_MEMORY_IMPORT_PAIRS} 条有效原文/译文对；当前解析到 ${pairCount} 条。请拆分文件后重试。`;
}

export function isTranslationMemoryImportPairCountAllowed(pairCount: unknown) {
    return (
        Number.isSafeInteger(pairCount) &&
        Number(pairCount) >= 0 &&
        Number(pairCount) <= MAX_TRANSLATION_MEMORY_IMPORT_PAIRS
    );
}

/**
 * An import with no complete source/target rows is not a successful zero-row
 * import. Treat it as an actionable input failure so callers do not report a
 * completed job that changed nothing.
 */
export function hasImportableTranslationMemoryPairs(
    pairs: ReadonlyArray<{ source?: unknown; target?: unknown }> | null | undefined
): boolean {
    return Boolean(
        pairs?.some(
            pair =>
                String(pair?.source ?? '').trim().length > 0 &&
                String(pair?.target ?? '').trim().length > 0
        )
    );
}
