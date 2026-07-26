export type ProjectResourceBindingLoadState = 'idle' | 'loading' | 'ready' | 'error';

type ActionResult = {
    success?: unknown;
    data?: unknown;
    error?: unknown;
};

export type ResolvedProjectResourceBindings<T> =
    | { success: true; items: T[]; selected: string[] }
    | { success: false; error: string };

function asActionResult(value: unknown): ActionResult | null {
    return value && typeof value === 'object' ? (value as ActionResult) : null;
}

function safeErrorMessage(_result: ActionResult | null, fallback: string): string {
    // Action failures can originate in guards, storage, or database clients.
    // This dialog only needs an actionable retry state, never a serialized
    // internal error message.
    return fallback;
}

/**
 * A dialog becomes saveable only after both its choices and existing bindings
 * have loaded successfully. An empty result is valid only in the ready state.
 */
export function canSaveProjectResourceBindings(
    state: ProjectResourceBindingLoadState,
    saving: boolean
): boolean {
    return state === 'ready' && !saving;
}

export function resolveProjectResourceBindings<T extends object>(
    resourcesResponse: unknown,
    bindingsResponse: unknown,
    mapResource: (resource: unknown) => T | null,
    fallbackError: string
): ResolvedProjectResourceBindings<T> {
    const resources = asActionResult(resourcesResponse);
    const bindings = asActionResult(bindingsResponse);

    if (resources?.success !== true) {
        return { success: false, error: safeErrorMessage(resources, fallbackError) };
    }
    if (bindings?.success !== true) {
        return { success: false, error: safeErrorMessage(bindings, fallbackError) };
    }
    if (!Array.isArray(resources.data) || !Array.isArray(bindings.data)) {
        return { success: false, error: fallbackError };
    }

    const items = resources.data.map(mapResource).filter((item): item is T => item !== null);
    const selected = Array.from(
        new Set(
            bindings.data.filter(
                (id): id is string => typeof id === 'string' && id.trim().length > 0
            )
        )
    );

    return { success: true, items, selected };
}
