import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCredentialsSignInRedirect, parseEmailCodeLoginInput } from './email-code-login';

test('parses only valid email and six-digit verification-code login requests', () => {
    assert.deepEqual(
        parseEmailCodeLoginInput({
            email: ' User@Example.com ',
            code: ' 123456 ',
            callbackUrl: '/dashboard/projects?desktop=1',
        }),
        {
            ok: true,
            value: {
                email: 'user@example.com',
                code: '123456',
                callbackUrl: '/dashboard/projects?desktop=1',
            },
        }
    );

    assert.deepEqual(parseEmailCodeLoginInput({ code: '123456' }), {
        ok: false,
        error: '缺少邮箱',
    });
    assert.deepEqual(parseEmailCodeLoginInput({ email: 'not-an-email', code: '123456' }), {
        ok: false,
        error: '邮箱格式不正确',
    });
    assert.deepEqual(parseEmailCodeLoginInput({ email: 'user@example.com' }), {
        ok: false,
        error: '缺少验证码',
    });
    assert.deepEqual(parseEmailCodeLoginInput({ email: 'user@example.com', code: 'abc123' }), {
        ok: false,
        error: '验证码必须为 6 位数字',
    });
});

test('only accepts the exact safe callback destination as a credentials sign-in success', () => {
    const origin = 'https://www.deeptrans.studio';
    const redirectTo = '/dashboard/projects?desktop=1';

    assert.equal(
        classifyCredentialsSignInRedirect(
            'https://www.deeptrans.studio/dashboard/projects?desktop=1',
            origin,
            redirectTo
        ),
        'success'
    );
    assert.equal(
        classifyCredentialsSignInRedirect(
            'https://www.deeptrans.studio/auth/login?error=CredentialsSignin&code=credentials',
            origin,
            redirectTo
        ),
        'invalid-credentials'
    );
    assert.equal(
        classifyCredentialsSignInRedirect('/api/auth/callback/credentials', origin, redirectTo),
        'unexpected'
    );
    assert.equal(classifyCredentialsSignInRedirect('not a url', origin, redirectTo), 'unexpected');
});
