export const PROJECT_DICTIONARY_CLEANUP_STATUS = {
    ELIGIBLE: 'eligible',
    NOT_PROJECT_DICTIONARY: 'not-project-dictionary',
    DIFFERENT_OWNER: 'different-owner',
    DIFFERENT_TENANT: 'different-tenant',
    NOT_BOUND_TO_PROJECT: 'not-bound-to-project',
    SHARED: 'shared',
    NOT_AUTOMATIC: 'not-automatic',
} as const;

export type ProjectDictionaryCleanupStatus =
    (typeof PROJECT_DICTIONARY_CLEANUP_STATUS)[keyof typeof PROJECT_DICTIONARY_CLEANUP_STATUS];

export type ProjectDictionaryForCleanup = {
    id: string;
    name: string;
    visibility: string;
    userId: string | null;
    tenantId: string | null;
    entryCount: number;
    projectBindings: Array<{ projectId: string }>;
};

export type ProjectDictionaryCleanupBinding = {
    dictionary: Omit<ProjectDictionaryForCleanup, 'entryCount'> & {
        _count: { entries: number };
    };
};

export type ProjectDictionaryCleanupItem = {
    id: string;
    name: string;
    entryCount: number;
    cleanupStatus: ProjectDictionaryCleanupStatus;
    eligibleForCleanup: boolean;
    selectedForDeletion: boolean;
};

export type ProjectDictionaryCleanupPlan = {
    dictionaries: ProjectDictionaryCleanupItem[];
    deleteDictionaryIds: string[];
    summary: {
        totalBound: number;
        eligibleForCleanup: number;
        selectedForDeletion: number;
        retained: number;
        statusCounts: Record<ProjectDictionaryCleanupStatus, number>;
    };
};

export function projectDictionaryForCleanupFromBinding(
    binding: ProjectDictionaryCleanupBinding
): ProjectDictionaryForCleanup {
    return {
        id: binding.dictionary.id,
        name: binding.dictionary.name,
        visibility: binding.dictionary.visibility,
        userId: binding.dictionary.userId,
        tenantId: binding.dictionary.tenantId,
        entryCount: binding.dictionary._count.entries,
        projectBindings: binding.dictionary.projectBindings,
    };
}

function createStatusCounts(): Record<ProjectDictionaryCleanupStatus, number> {
    return {
        [PROJECT_DICTIONARY_CLEANUP_STATUS.ELIGIBLE]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_PROJECT_DICTIONARY]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_OWNER]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_TENANT]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_BOUND_TO_PROJECT]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.SHARED]: 0,
        [PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_AUTOMATIC]: 0,
    };
}

/**
 * Project dictionaries created by the product use the "术语清单" naming convention.
 * This is intentionally conservative: a dictionary has to satisfy every ownership
 * and exclusivity check before it can be selected for automatic cleanup.
 */
export function classifyProjectDictionaryForCleanup(
    dictionary: ProjectDictionaryForCleanup,
    context: { projectId: string; ownerId: string; tenantId: string | null }
): ProjectDictionaryCleanupStatus {
    if (dictionary.visibility !== 'PROJECT') {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_PROJECT_DICTIONARY;
    }

    if (dictionary.userId !== context.ownerId) {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_OWNER;
    }

    if (dictionary.tenantId !== context.tenantId) {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_TENANT;
    }

    if (!dictionary.projectBindings.some(binding => binding.projectId === context.projectId)) {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_BOUND_TO_PROJECT;
    }

    if (dictionary.projectBindings.some(binding => binding.projectId !== context.projectId)) {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.SHARED;
    }

    if (!dictionary.name.includes('术语清单')) {
        return PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_AUTOMATIC;
    }

    return PROJECT_DICTIONARY_CLEANUP_STATUS.ELIGIBLE;
}

export function buildProjectDictionaryCleanupPlan(input: {
    projectId: string;
    ownerId: string;
    tenantId: string | null;
    deleteEligibleDictionaries: boolean;
    dictionaries: ProjectDictionaryForCleanup[];
}): ProjectDictionaryCleanupPlan {
    const statusCounts = createStatusCounts();
    const dictionaries = input.dictionaries.map(dictionary => {
        const cleanupStatus = classifyProjectDictionaryForCleanup(dictionary, input);
        const eligibleForCleanup = cleanupStatus === PROJECT_DICTIONARY_CLEANUP_STATUS.ELIGIBLE;
        const selectedForDeletion = input.deleteEligibleDictionaries && eligibleForCleanup;

        statusCounts[cleanupStatus] += 1;

        return {
            id: dictionary.id,
            name: dictionary.name,
            entryCount: dictionary.entryCount,
            cleanupStatus,
            eligibleForCleanup,
            selectedForDeletion,
        };
    });

    const deleteDictionaryIds = dictionaries
        .filter(dictionary => dictionary.selectedForDeletion)
        .map(dictionary => dictionary.id);

    return {
        dictionaries,
        deleteDictionaryIds,
        summary: {
            totalBound: dictionaries.length,
            eligibleForCleanup: statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.ELIGIBLE],
            selectedForDeletion: deleteDictionaryIds.length,
            retained: dictionaries.length - deleteDictionaryIds.length,
            statusCounts,
        },
    };
}
