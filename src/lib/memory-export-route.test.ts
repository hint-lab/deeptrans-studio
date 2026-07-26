import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'memories', 'export', 'route.ts'),
    'utf8'
);

test('memory export route requires authentication and exact memory ownership', () => {
    assert.match(route, /const authCtx = await requireUser\(\)/);
    assert.match(route, /requireOwnedMemory\(memoryId, authCtx\)/);
    assert.match(route, /memory:\s*\{\s*userId,/);
    assert.doesNotMatch(route, /tenantId:\s*authCtx\.tenantId/);
});

test('memory export route explicitly limits response size and disables cache', () => {
    assert.match(route, /MEMORY_EXPORT_MAX_ENTRIES/);
    assert.match(route, /take: MEMORY_EXPORT_MAX_ENTRIES \+ 1/);
    assert.match(route, /if \(rows\.length > MEMORY_EXPORT_MAX_ENTRIES\) throw tooLargeError\(\)/);
    assert.match(route, /Cache-Control': 'private, no-store, max-age=0'/);
    assert.match(route, /X-Content-Type-Options': 'nosniff'/);
    assert.match(route, /Content-Disposition/);
});
