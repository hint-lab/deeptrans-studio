import assert from 'node:assert/strict';
import test from 'node:test';

import {
    failedQaReviewResults,
    idleQaReviewLoadState,
    loadingQaReviewResults,
    readyQaReviewResults,
    resolveQaReviewLoadState,
} from './qa-review-load-state';

test('a newly selected segment is loading instead of inheriting a prior result state', () => {
    assert.deepEqual(resolveQaReviewLoadState(readyQaReviewResults('segment-a'), 'segment-b'), {
        itemId: 'segment-b',
        status: 'loading',
    });
});

test('keeps the current segment load failure distinct from a not-run state', () => {
    assert.equal(
        resolveQaReviewLoadState(failedQaReviewResults('segment-a'), 'segment-a').status,
        'error'
    );
    assert.equal(resolveQaReviewLoadState(idleQaReviewLoadState, '').status, 'idle');
});

test('retry can put the failed segment back into a loading state', () => {
    assert.deepEqual(loadingQaReviewResults('segment-a'), {
        itemId: 'segment-a',
        status: 'loading',
    });
});
