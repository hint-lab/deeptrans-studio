export type BatchSignoffInput = {
    expectedSourceText: string;
    expectedTargetText: string;
    targetText: string;
};

/**
 * A batch has no editor-local draft to apply. It must therefore sign off the
 * exact source/target pair just read from the server, then let the protected
 * server action reject any intervening write with its own CAS predicate.
 */
export function buildBatchSignoffInput(
    content:
        | {
              sourceText?: unknown;
              targetText?: unknown;
          }
        | null
        | undefined
): BatchSignoffInput {
    const sourceText = String(content?.sourceText || '');
    const targetText = String(content?.targetText || '');
    if (!sourceText.trim() || !targetText.trim()) {
        throw new Error('原文或译文为空，无法批量签发');
    }

    return {
        expectedSourceText: sourceText,
        expectedTargetText: targetText,
        targetText,
    };
}
