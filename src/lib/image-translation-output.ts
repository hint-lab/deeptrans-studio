/** A blank model response is not a translation and must never be shown as one. */
export function nonBlankImageTranslation(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value;
}
