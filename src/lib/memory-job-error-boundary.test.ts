import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8');

test('job actions keep explicit guard feedback and replace unexpected failures', () => {
    const action = read('src', 'actions', 'job.ts');

    assert.match(action, /publicActionErrorMessage\(error, JOB_ACTION_UNAVAILABLE_MESSAGE\)/);
    assert.match(action, /new GuardError\(400, '任务标识无效'\)/);
    assert.doesNotMatch(action, /String\((?:e|error)\)/);
    assert.doesNotMatch(action, /error\.message/);
});

test('memory task routes retain safe state details but do not echo queue or infrastructure payloads', () => {
    const importRoute = read('src', 'app', 'api', 'memories', 'import', 'route.ts');
    const vectorsRoute = read('src', 'app', 'api', 'memories', '[id]', 'vectors', 'route.ts');
    const exportRoute = read('src', 'app', 'api', 'memories', 'export', 'route.ts');

    assert.match(importRoute, /const protocolCode = e instanceof Error \? e\.message : null/);
    assert.match(importRoute, /MEMORY_IMPORT_UNAVAILABLE_MESSAGE/);
    assert.doesNotMatch(importRoute, /String\((?:e|error)\)/);
    assert.match(vectorsRoute, /function completedVectorBackfillResult\(/);
    assert.match(vectorsRoute, /completedVectorBackfillResult\(job\.returnvalue, memory\.id\)/);
    assert.doesNotMatch(vectorsRoute, /result: state === 'completed' \? job\.returnvalue : null/);
    assert.match(vectorsRoute, /memoryImportJobFailureMessage\(/);
    assert.match(vectorsRoute, /MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE/);
    assert.match(
        exportRoute,
        /error instanceof GuardError \|\| error instanceof MemoryExportLimitError/
    );
    assert.match(exportRoute, /: '导出失败'/);
    assert.doesNotMatch(exportRoute, /String\(error\)/);
});
