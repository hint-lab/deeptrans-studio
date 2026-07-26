import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = (relativePath: string) =>
    fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('registration verifies the code, then Credentials consumes it only after an account exists', () => {
    const registration = source('src/app/api/auth/register/route.ts');
    const credentials = source('src/auth.ts');
    const emailLoginAction = source('src/actions/email-login.ts');

    assert.match(registration, /getVerificationCodeByEmail\(email\)/);
    assert.doesNotMatch(registration, /consumeEmailVerificationCode/);
    assert.match(
        credentials,
        /const user = await findUserByNormalizedEmailDB\(normalizedEmail\);[\s\S]*?if\s*\(\s*!user\s*\|\|\s*!\(await consumeEmailVerificationCode\(normalizedEmail, normalizedCode\)\)\s*\)/
    );
    assert.doesNotMatch(emailLoginAction, /getVerificationCodeByEmail/);
});
