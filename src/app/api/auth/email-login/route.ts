export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { normalizeInternalCallback } from '@/lib/auth-callback';
import {
    classifyCredentialsSignInRedirect,
    parseEmailCodeLoginInput,
} from '@/lib/email-code-login';
import { createLogger } from '@/lib/logger';
import { DEFAULT_LOGIN_REDIRECT } from '@/routes';

const logger = createLogger(
    { type: 'api:auth:email-login' },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

async function readLoginFields(request: NextRequest): Promise<Record<string, unknown>> {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('INVALID_LOGIN_BODY');
        }
        return body as Record<string, unknown>;
    }

    return Object.fromEntries((await request.formData()).entries());
}

export async function POST(req: NextRequest) {
    let fields: Record<string, unknown>;
    try {
        fields = await readLoginFields(req);
    } catch (error) {
        logger.warn('Invalid email-login request body', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
    }

    const parsed = parseEmailCodeLoginInput({
        email: fields.email,
        code: fields.code,
        // callbackUrl is the public API parameter; redirectTo is accepted as a
        // compatibility alias and is still constrained to an internal path.
        callbackUrl: fields.callbackUrl ?? fields.redirectTo,
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const redirectTo = normalizeInternalCallback(parsed.value.callbackUrl, DEFAULT_LOGIN_REDIRECT);

    try {
        const redirectUrl = await signIn('credentials', {
            email: parsed.value.email,
            code: parsed.value.code,
            redirect: false,
            redirectTo,
        });
        const result = classifyCredentialsSignInRedirect(
            redirectUrl,
            req.nextUrl.origin,
            redirectTo
        );

        if (result === 'success') {
            return NextResponse.json({ success: true, redirectTo });
        }
        if (result === 'invalid-credentials') {
            return NextResponse.json({ error: '邮箱或验证码错误' }, { status: 401 });
        }

        logger.error('Credentials sign-in returned an unexpected destination');
        return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
    } catch (error) {
        logger.error('Credentials sign-in failed', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
    }
}
