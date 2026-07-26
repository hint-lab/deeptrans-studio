import assert from 'node:assert/strict';
import test from 'node:test';
import {
    completePostEditOutcome,
    failedPostEditOutcome,
    idlePostEditOutcome,
    postEditDisplayOutcome,
    postEditOutcomeForItem,
} from './post-edit-query-outcome';
import { MEMORY_SEARCH_UNAVAILABLE_MESSAGE } from './memory-search';

test('keeps idle, successful-empty, and successful query outcomes distinct', () => {
    assert.deepEqual(idlePostEditOutcome('segment-a'), {
        itemId: 'segment-a',
        status: 'idle',
    });
    assert.deepEqual(completePostEditOutcome('segment-a', []), {
        itemId: 'segment-a',
        status: 'success-empty',
    });
    assert.deepEqual(completePostEditOutcome('segment-a', [{ id: 'reference-1' }]), {
        itemId: 'segment-a',
        status: 'success',
    });
});

test('returns idle rather than another segment outcome', () => {
    const outcome = failedPostEditOutcome(
        'segment-a',
        'query',
        new Error(MEMORY_SEARCH_UNAVAILABLE_MESSAGE),
        'Post-editing failed'
    );

    assert.equal(postEditOutcomeForItem({ 'segment-a': outcome }, 'segment-b').status, 'idle');
    assert.equal(postEditOutcomeForItem({ 'segment-a': outcome }, 'segment-a').status, 'error');
});

test('does not present a successful outcome until its output belongs to the active segment', () => {
    const outcomes = {
        'segment-a': completePostEditOutcome('segment-a', [{ id: 'reference-1' }]),
    };

    assert.deepEqual(postEditDisplayOutcome(outcomes, 'segment-a', 'segment-b'), {
        itemId: 'segment-a',
        status: 'loading',
        phase: 'restore',
    });
    assert.equal(postEditDisplayOutcome(outcomes, 'segment-a', 'segment-a').status, 'success');
});

test('keeps only the public retrieval error vocabulary in a browser-visible outcome', () => {
    const publicFailure = failedPostEditOutcome(
        'segment-a',
        'query',
        new Error(MEMORY_SEARCH_UNAVAILABLE_MESSAGE),
        'Post-editing failed'
    );
    const privateFailure = failedPostEditOutcome(
        'segment-a',
        'persist',
        new Error('database password rejected for internal-host'),
        'Post-editing failed'
    );

    assert.equal(publicFailure.message, MEMORY_SEARCH_UNAVAILABLE_MESSAGE);
    assert.equal(privateFailure.message, 'Post-editing failed');
});
