import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('email login returns a generic sign-in failure without serializing the thrown error', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'src', 'actions', 'email-login.ts'),
        'utf8'
    );

    assert.match(source, /return \{ error: '登录失败，请重试' \};/);
    assert.doesNotMatch(source, /登录失败，请重试'\s*\+\s*error/);
});
