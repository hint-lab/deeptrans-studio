export function scopedProjectBatchId(projectId: string, batchId: string): string {
    return `${projectId}:${batchId}`;
}

export function initStructuredKey(batchId: string): string {
    return `init.${batchId}.structured`;
}

export function initLegacyDocxStructuredKey(batchId: string): string {
    return `init.${batchId}.docx.structured`;
}

export async function readInitStructuredRaw(
    redis: { get: (key: string) => Promise<unknown> },
    batchId: string
): Promise<unknown> {
    const current = await redis.get(initStructuredKey(batchId));
    if (current) return current;
    return redis.get(initLegacyDocxStructuredKey(batchId));
}
