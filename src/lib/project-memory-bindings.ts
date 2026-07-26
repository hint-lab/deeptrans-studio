type ProjectMemoryBindingRow = {
    memoryId?: unknown;
    memory?: { userId?: unknown } | null;
};

/**
 * Project-memory links predate strict per-user ownership. Keep foreign ids on
 * the server only: they are neither selectable nor usable by the current
 * account, while their count tells the UI that a legacy link needs cleanup.
 */
export function resolveOwnedProjectMemoryBindings(rows: unknown, ownerId: string) {
    if (!Array.isArray(rows)) return null;

    const ids = new Set<string>();
    let inaccessibleBindingCount = 0;

    for (const row of rows as ProjectMemoryBindingRow[]) {
        const memoryId = typeof row?.memoryId === 'string' ? row.memoryId.trim() : '';
        if (!memoryId || row?.memory?.userId !== ownerId) {
            inaccessibleBindingCount += 1;
            continue;
        }
        ids.add(memoryId);
    }

    return { memoryIds: [...ids], inaccessibleBindingCount };
}
