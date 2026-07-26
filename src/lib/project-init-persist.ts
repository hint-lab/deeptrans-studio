import {
    resolveProjectInitResumeTarget,
    type ProjectInitResumeTarget,
} from './document-init-status';

export type ProjectInitPersistOutcome =
    | { kind: 'advance-to-segment' }
    | {
          kind: 'resume';
          target: Extract<ProjectInitResumeTarget, 'segment' | 'terms' | 'ide'>;
      };

/**
 * The initialization UI may leave parsing only after the server has either
 * persisted its artifacts or proven that another request already advanced the
 * same document.  Treat every other response as a failed persistence attempt.
 */
export function resolveProjectInitPersistOutcome(
    payload: unknown
): ProjectInitPersistOutcome | null {
    if (!payload || typeof payload !== 'object') return null;
    const result = payload as Record<string, unknown>;
    if (result.ok !== true) return null;

    if (result.skipped === true) {
        const target = resolveProjectInitResumeTarget(result.status);
        if (target === 'segment' || target === 'terms' || target === 'ide') {
            return { kind: 'resume', target };
        }
        return null;
    }

    return result.step === 'persist' ? { kind: 'advance-to-segment' } : null;
}
