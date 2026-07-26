import assert from 'node:assert/strict';
import test from 'node:test';
import { isBatchQAReviewReady, partitionBatchQAWorkflowItems } from './batch-qa-stage-eligibility';

test('recognizes MT_REVIEW, not MT, as the only batch QA-ready stage', () => {
    assert.equal(isBatchQAReviewReady('MT_REVIEW'), true);
    assert.equal(isBatchQAReviewReady('MT'), false);
    assert.equal(isBatchQAReviewReady('QA_REVIEW'), false);
});

test('only sends MT_REVIEW segments to automatic batch QA', () => {
    const { reviewReadyItems, unfinishedMtItems } = partitionBatchQAWorkflowItems([
        { id: 'mt', status: 'MT' },
        { id: 'review', status: 'MT_REVIEW' },
        { id: 'qa', status: 'QA_REVIEW' },
    ]);

    assert.deepEqual(
        reviewReadyItems.map(item => item.id),
        ['review']
    );
    assert.deepEqual(
        unfinishedMtItems.map(item => item.id),
        ['mt']
    );
});

test('keeps an unfinished MT segment visible instead of treating the workflow as QA-ready', () => {
    const { reviewReadyItems, unfinishedMtItems } = partitionBatchQAWorkflowItems([
        { id: 'interrupted', status: 'MT' },
    ]);

    assert.equal(reviewReadyItems.length, 0);
    assert.deepEqual(
        unfinishedMtItems.map(item => item.id),
        ['interrupted']
    );
});
