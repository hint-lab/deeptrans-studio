import { ActionableActionError } from '@/lib/actionable-action-error';
import { GuardError } from '@/lib/guards';

/**
 * Server Actions may serialize returned or rethrown errors to the browser.
 * Only guards and deliberately-authored actionable failures are safe to pass
 * through; infrastructure details must be replaced by the caller's fallback.
 */
export function publicActionErrorMessage(error: unknown, fallback: string) {
    if (error instanceof GuardError || error instanceof ActionableActionError) {
        return error.message;
    }
    return fallback;
}

export function rethrowPublicActionError(error: unknown, fallback: string): never {
    if (error instanceof GuardError || error instanceof ActionableActionError) {
        throw error;
    }
    throw new Error(fallback);
}
