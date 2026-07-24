export function normalizeKeyboardKey(key: unknown): string {
    return typeof key === 'string' ? key.toLowerCase() : '';
}
