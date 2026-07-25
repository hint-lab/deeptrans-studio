import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('translation-memory UI uses a durable queue instead of the long SSE request', () => {
    const component = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'import-memory-dialog.tsx'
    );

    assert.match(component, /fetch\('\/api\/upload-proxy'/);
    assert.match(component, /fetch\('\/api\/memories\/import'/);
    assert.match(component, /\/api\/memories\/import\/status\?jobId=/);
    assert.doesNotMatch(component, /\/api\/memories\/import-progress/);
});

test('memory import requires an owned target and enqueues retryable work', () => {
    const route = read('src', 'app', 'api', 'memories', 'import', 'route.ts');

    assert.match(route, /if \(!memoryId\) throw new GuardError\(400, '请选择目标记忆库'\)/);
    assert.match(route, /requireOwnedMemory\(memoryId, authCtx\)/);
    assert.match(route, /defaultJobOpts/);
    assert.doesNotMatch(route, /默认记忆库|默认导入/);
});

test('memory import validates embeddings before creating rows and compensates failed writes', () => {
    const worker = read('src', 'worker', 'index.ts');
    const importStart = worker.indexOf("'memory-import'");
    const backfillStart = worker.indexOf("'memory-vector-backfill'", importStart);
    const memoryImport = worker.slice(importStart, backfillStart);

    const validate = memoryImport.indexOf('assertEmbeddingBatch(vectors, texts.length');
    const create = memoryImport.indexOf('translationMemoryEntry.create');
    const upsert = memoryImport.indexOf('await upsertVectors');
    const cleanup = memoryImport.indexOf('translationMemoryEntry.deleteMany');

    assert.ok(validate >= 0 && validate < create);
    assert.ok(create < upsert);
    assert.ok(upsert < cleanup);
    assert.match(
        memoryImport,
        /return \{ total: pairs\.length, indexed: points\.length, memoryId \}/
    );
});

test('memory vector backfill only processes missing vectors and exposes remaining work', () => {
    const worker = read('src', 'worker', 'index.ts');
    const backfill = worker.slice(worker.indexOf("'memory-vector-backfill'"));

    assert.match(backfill, /embedding IS NULL/g);
    assert.match(backfill, /ORDER BY id ASC/);
    assert.match(backfill, /assertEmbeddingBatch\(/);
    assert.match(backfill, /return \{ memoryId: memory\.id, total, indexed, remaining \}/);
});
