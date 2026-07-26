import { isPublicMemorySearchErrorMessage } from '@/lib/memory-search';

/**
 * A post-edit run has more than two meaningful states. In particular, an
 * unsuccessful retrieval must not collapse into the same presentation as an
 * untouched segment or a successful query with zero references.
 */
export type PostEditOutcomeStatus = 'idle' | 'loading' | 'success' | 'success-empty' | 'error';

export type PostEditOutcomePhase = 'restore' | 'query' | 'evaluation' | 'rewrite' | 'persist';

export type PostEditOutcome = {
    itemId: string;
    status: PostEditOutcomeStatus;
    phase?: PostEditOutcomePhase;
    /** A deliberately public, actionable message only. */
    message?: string;
};

export type PostEditOutcomeByItem = Record<string, PostEditOutcome>;

export function idlePostEditOutcome(itemId: string): PostEditOutcome {
    return { itemId, status: 'idle' };
}

export function completePostEditOutcome(
    itemId: string,
    references: readonly unknown[] | undefined | null
): PostEditOutcome {
    return {
        itemId,
        status: Array.isArray(references) && references.length > 0 ? 'success' : 'success-empty',
    };
}

/**
 * Select an outcome only when it belongs to the currently open document item.
 * This protects the panel from a late result for another segment.
 */
export function postEditOutcomeForItem(
    outcomes: PostEditOutcomeByItem | undefined,
    itemId: string
): PostEditOutcome {
    const outcome = outcomes?.[itemId];
    return outcome?.itemId === itemId ? outcome : idlePostEditOutcome(itemId);
}

/**
 * The workflow store keeps one set of output fields, so an outcome alone is
 * not proof that those fields already belong to the currently rendered item.
 * While a saved result is being restored, prefer a loading state over showing
 * an old segment's successful/empty result.
 */
export function postEditDisplayOutcome(
    outcomes: PostEditOutcomeByItem | undefined,
    itemId: string,
    outputItemId: string | undefined
): PostEditOutcome {
    const outcome = postEditOutcomeForItem(outcomes, itemId);
    const ownsVisibleOutput = Boolean(itemId) && outputItemId === itemId;

    if (!ownsVisibleOutput && (outcome.status === 'success' || outcome.status === 'success-empty')) {
        return { itemId, status: 'loading', phase: 'restore' };
    }

    return outcome;
}

/**
 * Do not retain raw provider, database, or authorization details in the
 * browser-visible workflow state. Retrieval errors already have a constrained
 * public vocabulary; every other failure gets the caller's generic fallback.
 */
export function failedPostEditOutcome(
    itemId: string,
    phase: PostEditOutcomePhase,
    error: unknown,
    fallbackMessage: string
): PostEditOutcome {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

    return {
        itemId,
        status: 'error',
        phase,
        message: isPublicMemorySearchErrorMessage(message) ? message : fallbackMessage,
    };
}
