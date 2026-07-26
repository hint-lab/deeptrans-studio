import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { GET } from './route';

test('web health probe only reports the Web responder scope', async () => {
    const response = GET();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok', scope: 'web' });
});

test('health endpoint is public and the container probes the Web route without a shell tool', () => {
    const middleware = fs.readFileSync(path.join(process.cwd(), 'src', 'middleware.ts'), 'utf8');
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');

    assert.match(middleware, /'\/api\/health'/);
    assert.match(dockerfile, /HEALTHCHECK[^\n]*node -e[^\n]*\/api\/health/);
    assert.doesNotMatch(dockerfile, /HEALTHCHECK[^\n]*(?:curl|wget)/);
});
