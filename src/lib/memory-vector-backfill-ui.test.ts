import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(
        process.cwd(),
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        '[memoryId]',
        'page.tsx'
    ),
    'utf8'
);

test('memory detail UI reads the owned vector status before offering a backfill action', () => {
    assert.match(page, /\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}\/vectors/);
    assert.match(page, /method: 'POST'/);
    assert.match(page, /parseVectorBackfillStatus\(payload\.data\)/);
    assert.match(page, /disabled=\{!canStartVectorBackfill\}/);
    assert.match(page, /isMemoryVectorBackfillPendingState\(vectorBackfillData\.state\)/);
});

test('memory detail UI distinguishes empty, complete, queued, and failed vector states', () => {
    assert.match(page, /vectorCoverage\?\.total === 0/);
    assert.match(page, /vectorCoverage\?\.remaining === 0/);
    assert.match(page, /VectorIndex\.empty/);
    assert.match(page, /VectorIndex\.complete/);
    assert.match(page, /VectorIndex\.queued/);
    assert.match(page, /VectorIndex\.failed/);
    assert.match(page, /VECTOR_BACKFILL_POLL_LIMIT/);
    assert.doesNotMatch(page, /payload\?\.error/);
});
