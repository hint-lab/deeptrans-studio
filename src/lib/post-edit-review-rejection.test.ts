import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildPostEditReviewRejectionUpdate,
    clearPostEditReviewMetadata,
    rejectPostEditReviewWithUpdate,
} from './post-edit-review-rejection';

const updatedAt = new Date('2026-07-26T00:00:00.000Z');

function reviewItem(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        status: 'POST_EDIT_REVIEW',
        updatedAt,
        metadata: {
            targetSourceRevision: 'target-source',
            postEditSourceRevision: 'post-edit-source',
            postEditTargetRevision: 'post-edit-target',
            other: 'keep',
        },
        ...overrides,
    };
}

test('builds an exact-status optimistic reset that clears only post-edit state', () => {
    const dbNull = Symbol('db-null');
    const update = buildPostEditReviewRejectionUpdate(reviewItem(), dbNull);

    assert.deepEqual(update, {
        where: {
            id: 'item-1',
            status: 'POST_EDIT_REVIEW',
            updatedAt,
        },
        data: {
            status: 'QA_REVIEW',
            postEditDiscourse: dbNull,
            postEditEmbedded: dbNull,
            metadata: {
                targetSourceRevision: 'target-source',
                other: 'keep',
            },
        },
    });
});

test('does not permit the reset outside post-edit review', () => {
    assert.throws(
        () => buildPostEditReviewRejectionUpdate(reviewItem({ status: 'QA_REVIEW' }), null),
        /不处于译后复核/
    );
});

test('reports an optimistic-concurrency conflict without a follow-up write', async () => {
    let calls = 0;
    const reset = await rejectPostEditReviewWithUpdate(reviewItem(), null, async update => {
        calls += 1;
        assert.equal(update.where.status, 'POST_EDIT_REVIEW');
        assert.equal(update.where.updatedAt, updatedAt);
        return { count: 0 };
    });

    assert.equal(reset, false);
    assert.equal(calls, 1);
});

test('tolerates legacy non-object metadata without preserving a stale marker', () => {
    assert.deepEqual(clearPostEditReviewMetadata(['legacy']), {});
});
