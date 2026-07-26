import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'email-login', 'route.ts'),
    'utf8'
);

test('email login route uses the registered Credentials provider and reports its outcome', () => {
    assert.match(route, /signIn\('credentials',\s*\{/);
    assert.match(route, /redirect:\s*false/);
    assert.match(route, /classifyCredentialsSignInRedirect/);
    assert.doesNotMatch(route, /signIn\('email'/);
    assert.match(route, /status:\s*401/);
    assert.match(route, /status:\s*500/);
});
