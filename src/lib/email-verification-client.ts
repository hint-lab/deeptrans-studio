const PUBLIC_EMAIL_VERIFICATION_FAILURE_CODES = new Set([
    'DEMO_ACCOUNT_ONLY',
    'EMAIL_AUTHENTICATION_FAILED',
    'EMAIL_CODE_STORAGE_UNAVAILABLE',
    'EMAIL_CONFIGURATION_INVALID',
    'EMAIL_COOLDOWN',
    'EMAIL_DELIVERY_UNAVAILABLE',
    'EMAIL_INVALID',
    'EMAIL_REQUEST_FAILED',
    'EMAIL_REQUIRED',
    'EMAIL_VERIFICATION_INVALID',
    'DEMO_REGISTRATION_DISABLED',
    'REGISTRATION_FAILED',
    'USER_ALREADY_EXISTS',
    'USER_NOT_FOUND',
]);

export type EmailVerificationFailureCode =
    | 'DEMO_ACCOUNT_ONLY'
    | 'EMAIL_AUTHENTICATION_FAILED'
    | 'EMAIL_CODE_STORAGE_UNAVAILABLE'
    | 'EMAIL_CONFIGURATION_INVALID'
    | 'EMAIL_COOLDOWN'
    | 'EMAIL_DELIVERY_UNAVAILABLE'
    | 'EMAIL_INVALID'
    | 'EMAIL_REQUEST_FAILED'
    | 'EMAIL_REQUIRED'
    | 'EMAIL_VERIFICATION_INVALID'
    | 'DEMO_REGISTRATION_DISABLED'
    | 'REGISTRATION_FAILED'
    | 'USER_ALREADY_EXISTS'
    | 'USER_NOT_FOUND';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A 2xx response is not a delivery acknowledgement unless it says success. */
export function isEmailVerificationSent(payload: unknown): boolean {
    return isRecord(payload) && payload.success === true;
}

/** Registration has its own explicit acknowledgement, rather than a bare 2xx. */
export function isEmailRegistrationCompleted(payload: unknown): boolean {
    if (!isRecord(payload) || !isRecord(payload.user)) return false;
    return typeof payload.user.id === 'string' && payload.user.id.length > 0;
}

/**
 * Error text from a failed fetch is safe to display only when it is paired
 * with a response code that this client explicitly understands. This keeps a
 * proxy, framework, or future backend exception from becoming a user-facing
 * raw error while retaining the SMTP recovery guidance returned by this API.
 */
export function getEmailVerificationFailureMessage(payload: unknown, fallback: string): string {
    if (!isRecord(payload)) return fallback;

    const code = payload.code;
    const error = payload.error;
    if (
        typeof code !== 'string' ||
        !PUBLIC_EMAIL_VERIFICATION_FAILURE_CODES.has(code) ||
        typeof error !== 'string'
    ) {
        return fallback;
    }

    const message = error.trim();
    if (!message || message.length > 280 || /[\r\n\u0000]/.test(message)) return fallback;
    return message;
}

export function getEmailVerificationFailureCode(
    payload: unknown
): EmailVerificationFailureCode | undefined {
    if (!isRecord(payload) || typeof payload.code !== 'string') return undefined;
    return PUBLIC_EMAIL_VERIFICATION_FAILURE_CODES.has(payload.code)
        ? (payload.code as EmailVerificationFailureCode)
        : undefined;
}
