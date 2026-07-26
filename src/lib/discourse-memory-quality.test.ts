import assert from 'node:assert/strict';
import test from 'node:test';

import { meetsDiscourseMemoryQuality } from './memory-search';

test('keeps a strong keyword reference when hybrid fusion applies a small keyword weight', () => {
    assert.equal(
        meetsDiscourseMemoryQuality({
            score: 0.18,
            keywordScore: 0.9,
        }),
        true
    );
});

test('keeps the normal similarity threshold for genuinely weak results', () => {
    assert.equal(
        meetsDiscourseMemoryQuality({ score: 0.1, vectorScore: 0.2, keywordScore: 0.3 }),
        false
    );
});

test('accepts a useful raw vector similarity even if the fused score is lower', () => {
    assert.equal(meetsDiscourseMemoryQuality({ score: 0.32, vectorScore: 0.4 }), true);
});
