export type PostEditResults = {
    query?: unknown;
    evaluation?: unknown;
    rewrite?: unknown;
};

type PostEditDiscourseEnvelope = {
    version: 1;
    query: unknown | null;
    evaluation: unknown | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The schema intentionally has two post-edit JSON columns. Keep the complete
 * workflow payload in `postEditDiscourse` and the generated rewrite in
 * `postEditEmbedded`, rather than writing non-existent Prisma fields.
 */
export function serializePostEditResults(results: PostEditResults) {
    const hasResults = Object.values(results).some(value => value !== undefined && value !== null);
    if (!hasResults) {
        return { hasResults: false as const };
    }

    return {
        hasResults: true as const,
        postEditDiscourse: {
            version: 1,
            query: results.query ?? null,
            evaluation: results.evaluation ?? null,
        } satisfies PostEditDiscourseEnvelope,
        postEditEmbedded: typeof results.rewrite === 'string' ? results.rewrite : null,
    };
}

/**
 * Read both the versioned payload and pre-existing rows, where
 * `postEditDiscourse` contained only the evaluation and
 * `postEditEmbedded` contained the rewrite.
 */
export function deserializePostEditResults(postEditDiscourse: unknown, postEditEmbedded: unknown) {
    const rewrite = typeof postEditEmbedded === 'string' ? postEditEmbedded : undefined;

    if (isRecord(postEditDiscourse) && postEditDiscourse.version === 1) {
        return {
            query: postEditDiscourse.query ?? undefined,
            evaluation: postEditDiscourse.evaluation ?? undefined,
            rewrite,
        };
    }

    return {
        query: undefined,
        evaluation: postEditDiscourse ?? undefined,
        rewrite,
    };
}
