import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('project-init requests are scoped to the project and batch that started them', () => {
    assert.match(page, /createProjectInitRequestScopeGate\(\)/);
    assert.match(page, /requestScopeGateRef\.current\.sync\(projectId, batchId\)/);
    assert.match(page, /return \{ projectId, batchId, version: current\.version \}/);
    assert.match(page, /if \(!isRequestCurrent\(scope\)\) return false;/);
});

test('slow parse, term preview, and status responses cannot write after scope changes', () => {
    assert.match(page, /const requestId = \+\+parseRequestRef\.current/);
    assert.match(page, /const requestId = \+\+termPreviewRequestRef\.current/);
    assert.match(page, /if \(stopped \|\| !isRequestCurrent\(scope\)\) return;/);
    assert.match(page, /moveCanceledTermsToRetryBatch\(batchId, scope\)/);
});

test('changing projects clears local results before the next project renders them', () => {
    assert.match(page, /if \(localProjectId === projectId\) return;/);
    assert.match(page, /setPreviewHtml\(''\)/);
    assert.match(page, /setTerms\(\[\]\)/);
    assert.match(page, /const hasCurrentProjectView = localProjectId === projectId;/);
    assert.match(page, /<ParsePanel previewHtml=\{visiblePreviewHtml\} \/>/);
});
