import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const route = readFileSync(
    resolve(process.cwd(), 'src/app/api/projects/[id]/terms/route.ts'),
    'utf8'
);

test('a canceled document-term batch cannot be retried in the same Redis namespace', () => {
    assert.match(route, /docTerms\.\$\{scopedBatchId\}\.cancel/);
    assert.match(route, /requiresNewBatch:\s*true/);
    assert.match(route, /Never recycle a canceled namespace/);
    assert.ok(
        route.indexOf('docTerms.${scopedBatchId}.cancel') < route.indexOf('await redis.del('),
        'the canceled-batch fence must run before a retry clears job keys'
    );
});
