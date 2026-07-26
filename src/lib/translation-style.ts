export const TRANSLATION_STYLE_KEYS = [
    'formal',
    'casual',
    'technical',
    'creative',
    'academic',
] as const;

export type TranslationStyleKey = (typeof TRANSLATION_STYLE_KEYS)[number];

const TRANSLATION_STYLE_INSTRUCTIONS: Record<TranslationStyleKey, string> = {
    formal: 'Use a formal register appropriate for professional written communication.',
    casual: 'Use a natural, conversational register while preserving the source meaning.',
    technical: 'Use precise, domain-appropriate terminology and a technical register.',
    creative: 'Use fluent, expressive wording while preserving the source meaning.',
    academic: 'Use a clear, rigorous academic register with consistent terminology.',
};

export function isTranslationStyleKey(value: unknown): value is TranslationStyleKey {
    return TRANSLATION_STYLE_KEYS.includes(value as TranslationStyleKey);
}

/**
 * Style is a bounded product control, not a free-form client prompt. Resolve
 * it on the server before it is merged with a user's stored node instruction.
 */
export function resolveTranslationStyleInstruction(value: unknown): string | undefined {
    return isTranslationStyleKey(value) ? TRANSLATION_STYLE_INSTRUCTIONS[value] : undefined;
}
