import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const route = readFileSync(
    resolve(process.cwd(), 'src', 'app', 'api', 'memories', '[id]', 'vectors', 'route.ts'),
    'utf8'
);

test('memory vector status keeps owner and initiator job boundaries while exposing idle coverage', () => {
    assert.match(route, /const memory = await requireOwnedMemory\(id, authCtx\);/);
    assert.match(route, /const coverage = await coverageForMemory\(memory\.id\);/);
    assert.match(route, /if \(!job\) \{[\s\S]*?state: 'idle'/);
    assert.match(route, /if \(job\.data\?\.userId !== authCtx\.userId\)/);
    assert.match(route, /coverage,/);
    assert.match(route, /readWorkerReadiness\(getQueueConnection\(\), queueName\)/);
});

test('memory vector status keeps deterministic queue de-duplication and safe failures', () => {
    assert.match(route, /const jobId = jobIdForMemory\(memory\.id\);/);
    assert.match(route, /state === 'waiting' \|\| state === 'active' \|\| state === 'delayed'/);
    assert.match(route, /completedVectorBackfillResult\(job\.returnvalue, memory\.id\)/);
    assert.match(route, /memoryImportJobFailureMessage\(/);
    assert.match(route, /MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE/);
    assert.doesNotMatch(route, /error:\s*job\.failedReason/);
    assert.doesNotMatch(route, /result:\s*state === 'completed' \? job\.returnvalue : null/);
});
