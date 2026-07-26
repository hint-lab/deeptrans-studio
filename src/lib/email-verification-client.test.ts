import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getEmailVerificationFailureCode,
    getEmailVerificationFailureMessage,
    isEmailRegistrationCompleted,
    isEmailVerificationSent,
} from './email-verification-client';

test('a verification request succeeds only with an explicit success acknowledgement', () => {
    assert.equal(isEmailVerificationSent({ success: true }), true);
    assert.equal(isEmailVerificationSent({ success: false }), false);
    assert.equal(isEmailVerificationSent({}), false);
    assert.equal(isEmailVerificationSent(null), false);
});

test('a registration request succeeds only with a created user acknowledgement', () => {
    assert.equal(isEmailRegistrationCompleted({ user: { id: 'user-1' } }), true);
    assert.equal(isEmailRegistrationCompleted({ success: true }), false);
    assert.equal(isEmailRegistrationCompleted({ user: { id: '' } }), false);
    assert.equal(isEmailRegistrationCompleted(null), false);
});

test('only known, bounded public verification failures reach the UI', () => {
    const fallback = '发送失败';
    assert.equal(
        getEmailVerificationFailureMessage(
            {
                code: 'EMAIL_AUTHENTICATION_FAILED',
                error: '邮件服务认证失败，请联系管理员确认 SMTP 设置。',
            },
            fallback
        ),
        '邮件服务认证失败，请联系管理员确认 SMTP 设置。'
    );
    assert.equal(
        getEmailVerificationFailureMessage(
            { code: 'INTERNAL_ERROR', error: 'smtp://user:secret@example.test' },
            fallback
        ),
        fallback
    );
    assert.equal(
        getEmailVerificationFailureMessage(
            { code: 'EMAIL_DELIVERY_UNAVAILABLE', error: 'first line\nsecret line' },
            fallback
        ),
        fallback
    );
    assert.equal(getEmailVerificationFailureCode({ code: 'USER_NOT_FOUND' }), 'USER_NOT_FOUND');
    assert.equal(getEmailVerificationFailureCode({ code: 'INTERNAL_ERROR' }), undefined);
});
