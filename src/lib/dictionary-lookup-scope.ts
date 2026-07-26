export type DictionaryLookupOwner = {
    userId: string;
};

/**
 * Build the visibility filter after the server has authenticated the caller
 * and, when present, resolved the current project's bound dictionary IDs.
 *
 * A missing project scope is intentionally not widened to every dictionary in
 * the same tenant. Standalone translation can still use public and the
 * caller's private dictionaries; project dictionaries require an explicit,
 * authorized project binding.
 */
export function buildDictionaryLookupScopes(
    owner: DictionaryLookupOwner,
    projectDictionaryIds: readonly string[] = []
) {
    const ids = [
        ...new Set(projectDictionaryIds.map(value => String(value || '').trim()).filter(Boolean)),
    ];

    return [
        { visibility: 'PUBLIC' as const },
        ...(ids.length
            ? [
                  {
                      visibility: 'PROJECT' as const,
                      id: { in: ids },
                  },
              ]
            : []),
        { visibility: 'PRIVATE' as const, userId: owner.userId },
    ];
}
