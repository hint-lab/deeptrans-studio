import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { memorySearchFailurePayload } from '@/lib/memory-search';

const route = readFileSync(
    resolve(process.cwd(), 'src/app/api/memories/hybrid-search/route.ts'),
    'utf8'
);

test('serializes unexpected hybrid-search API failures as the safe retrieval payload', () => {
    const payload = memorySearchFailurePayload(
        new Error('database connection refused at postgres.internal:5432')
    );

    assert.deepEqual(payload, {
        success: false,
        error: '检索服务暂不可用，请稍后重试',
        data: [],
    });
    assert.doesNotMatch(payload.error, /postgres|5432|connection refused/i);
});

test('hybrid-search route preserves GuardError handling while routing other errors through the safe payload', () => {
    assert.match(route, /error instanceof GuardError/);
    assert.match(route, /memorySearchFailurePayload\(error\)/);
    assert.match(route, /status:\s*500/);
    assert.match(route, /export async function GET\(\)[\s\S]*?catch \(error\)[\s\S]*?failureResponse\(error\)/);
});
