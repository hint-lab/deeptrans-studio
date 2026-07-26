import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.join(process.cwd(), 'src', 'actions', 'login.ts'), 'utf8');

test('legacy login action scopes the fixed demo code to the explicit demo account', () => {
    assert.match(source, /isDemoAccount\(phone\)/);
    assert.match(source, /code !== DEMO_CODE/);
    assert.match(source, /process\.env\.IS_DEMO === 'yes'/);
    assert.doesNotMatch(source, /NODE_ENV === 'development' && code === '123456'/);
});
