import { createHash } from 'node:crypto';

export function sourceRevision(sourceText: unknown): string {
    return createHash('sha256').update(String(sourceText || ''), 'utf8').digest('hex');
}

export function withSourceRevisions(
    metadata: Record<string, unknown> | null | undefined,
    sourceText: unknown,
    writes: { preTranslate?: boolean; target?: boolean }
): Record<string, unknown> {
    const next = { ...(metadata || {}) };
    const revision = sourceRevision(sourceText);
    if (writes.preTranslate) next.preTranslateSourceRevision = revision;
    if (writes.target) next.targetSourceRevision = revision;
    return next;
}
