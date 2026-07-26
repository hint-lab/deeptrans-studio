import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'send-email', 'route.ts'),
    'utf8'
);

test('verification sending keeps the demo bypass scoped and requires SMTP acceptance', () => {
    assert.match(route, /if \(isDemoAccount\(email\)\)/);
    assert.match(route, /if \(process\.env\.IS_DEMO === 'yes'\)/);
    assert.doesNotMatch(route, /DEMO_CODE/);
    assert.match(route, /isVerificationRecipientAccepted\(info, email\)/);
    assert.match(route, /success: true/);
});
