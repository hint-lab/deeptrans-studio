import assert from 'node:assert/strict';
import test from 'node:test';

import { MemorySearchError, memoryHitsFromSearchResponse } from './memory';

test('does not turn a failed memory search response into an empty hit list', () => {
    assert.throws(
        () =>
            memoryHitsFromSearchResponse({
                success: false,
                error: 'database connection refused at internal-host',
                data: [],
            }),
        error => {
            assert.ok(error instanceof MemorySearchError);
            assert.equal(error.message, '检索服务暂不可用，请稍后重试');
            return true;
        }
    );
});

test('keeps a successful empty search distinguishable from an outage', () => {
    assert.deepEqual(memoryHitsFromSearchResponse({ success: true, data: [] }), []);
});

test('preserves raw retrieval evidence for a successful memory hit', () => {
    assert.deepEqual(
        memoryHitsFromSearchResponse({
            success: true,
            data: [
                {
                    id: 'entry-a',
                    source: 'source',
                    target: 'target',
                    score: 0.2,
                    keywordScore: 0.9,
                    searchMode: 'keyword',
                },
            ],
        }),
        [
            {
                id: 'entry-a',
                source: 'source',
                target: 'target',
                score: 0.2,
                keywordScore: 0.9,
                vectorScore: undefined,
                searchMode: 'keyword',
            },
        ]
    );
});
