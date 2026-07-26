const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

export type EmailCodeLoginInput = {
    email: string;
    code: string;
    callbackUrl?: string;
};

export type EmailCodeLoginInputResult =
    | { ok: true; value: EmailCodeLoginInput }
    | { ok: false; error: string };

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Keep the API boundary aligned with the six-digit codes issued by
 * /api/auth/send-email. Authentication itself remains in the Credentials
 * provider; this only rejects malformed requests before invoking it.
 */
export function parseEmailCodeLoginInput(values: {
    email?: unknown;
    code?: unknown;
    callbackUrl?: unknown;
}): EmailCodeLoginInputResult {
    const email = stringValue(values.email).toLowerCase();
    const code = stringValue(values.code);
    const callbackUrl = stringValue(values.callbackUrl);

    if (!email) return { ok: false, error: '缺少邮箱' };
    if (!EMAIL_PATTERN.test(email)) return { ok: false, error: '邮箱格式不正确' };
    if (!code) return { ok: false, error: '缺少验证码' };
    if (!VERIFICATION_CODE_PATTERN.test(code)) {
        return { ok: false, error: '验证码必须为 6 位数字' };
    }

    return {
        ok: true,
        value: {
            email,
            code,
            ...(callbackUrl ? { callbackUrl } : {}),
        },
    };
}

export type CredentialsSignInRedirectResult = 'success' | 'invalid-credentials' | 'unexpected';

/**
 * Auth.js server-side signIn returns a redirect URL instead of an HTTP result.
 * A credentials rejection is redirected to the configured sign-in page; only
 * the exact, already-normalized callback destination proves a signed-in session.
 */
export function classifyCredentialsSignInRedirect(
    redirectUrl: unknown,
    requestOrigin: string,
    expectedRedirectTo: string
): CredentialsSignInRedirectResult {
    if (typeof redirectUrl !== 'string') return 'unexpected';

    try {
        const destination = new URL(redirectUrl, requestOrigin);
        if (destination.searchParams.get('error') === 'CredentialsSignin') {
            return 'invalid-credentials';
        }

        const expected = new URL(expectedRedirectTo, requestOrigin);
        if (
            destination.origin === expected.origin &&
            destination.pathname === expected.pathname &&
            destination.search === expected.search &&
            destination.hash === expected.hash
        ) {
            return 'success';
        }
    } catch {
        // An unparseable result cannot prove that Auth.js established a session.
    }

    return 'unexpected';
}
