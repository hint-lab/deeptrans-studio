import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('the terms modal sends a server cancellation request after a job starts', () => {
    assert.match(page, /fetch\(`\/api\/projects\/\$\{projectId\}\/terms\/cancel`/);
    assert.match(page, /body: JSON\.stringify\(\{ batchId: cancelBatchId \}\)/);
    assert.match(page, /if \(termStartInFlightRef\.current\) return;/);
    assert.match(page, /await requestStartedTermsCancellation\(activeBatchId(?:, scope)?\)/);
});

test('a confirmed stop moves the UI to a new batch instead of reusing the canceled namespace', () => {
    assert.match(page, /createDocumentTermsRetryBatchId\(projectId\)/);
    assert.match(page, /termCancellationHoldRef\.current = true/);
    assert.match(page, /phase === 'ERROR' \|\|\s*phase === 'CANCELED'/);
});
