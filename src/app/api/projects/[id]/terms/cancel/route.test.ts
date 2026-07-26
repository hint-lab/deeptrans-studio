import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const route = readFileSync(
    resolve(process.cwd(), 'src/app/api/projects/[id]/terms/cancel/route.ts'),
    'utf8'
);

test('document-term cancellation derives owner and document scope on the server', () => {
    assert.match(route, /requireUser\(\)/);
    assert.match(route, /requireWritableProject\(projectId, authCtx\)/);
    assert.match(
        route,
        /const activeDocumentId = String\(project\.documents\?\.\[0\]\?\.id \|\| ''\)/
    );
    assert.match(route, /requireOwnedProjectDocument\(/);
    assert.match(route, /documentTermsJobId\(scopedBatchId\)/);
    assert.doesNotMatch(route, /body\?\.userId|body\?\.tenantId|body\?\.documentId/);
});

test('document-term cancellation uses the atomic request helper before removing a queued job', () => {
    assert.match(route, /requestDocumentTermsCancelWithRedis\(redis, scopedBatchId, TTL_BATCH\)/);
    assert.match(route, /REMOVABLE_JOB_STATES\.has\(jobState\)/);
    assert.match(route, /releaseOwnedRedisLock/);
});
