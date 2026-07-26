/**
 * Keeps an in-memory value attached to the document segment that produced it.
 *
 * React effects clear local state after a segment switch, but the first render
 * for the next segment happens before that effect. Resolve through this helper
 * at render time so an old segment can never flash as the current result.
 */
export type ItemScopedValue<T> = {
    itemId: string;
    value: T;
};

export function getItemScopedValue<T>(
    state: ItemScopedValue<T> | null | undefined,
    activeItemId: string
): T | undefined {
    if (!activeItemId || state?.itemId !== activeItemId) return undefined;
    return state.value;
}
