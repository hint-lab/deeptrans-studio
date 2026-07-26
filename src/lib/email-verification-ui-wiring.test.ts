import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string) {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('email login and registration acknowledge only explicit delivery and hide raw client errors', () => {
    for (const file of [
        'src/app/(app)/auth/login/components/email-login-form.tsx',
        'src/app/(app)/auth/register/components/register-card.tsx',
    ]) {
        const component = source(file);
        assert.match(component, /isEmailVerificationSent\(payload\)/);
        assert.match(component, /getEmailVerificationFailureMessage\(payload, t\('sendFailed'\)\)/);
        assert.match(component, /AbortController/);
        assert.doesNotMatch(component, /errorData\.message/);
        assert.doesNotMatch(component, /e\.message/);
    }

    const registration = source('src/app/(app)/auth/register/components/register-card.tsx');
    assert.match(registration, /isEmailRegistrationCompleted\(payload\)/);
    assert.doesNotMatch(registration, /j\?\.error/);
});
