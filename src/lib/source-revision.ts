import { createHash } from 'node:crypto';

export function sourceRevision(sourceText: unknown): string {
    return createHash('sha256').update(String(sourceText || ''), 'utf8').digest('hex');
}
