import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isMemoryVectorBackfillPendingState,
    isMemoryVectorBackfillWorkerProblem,
    normalizeMemoryVectorCoverage,
} from './memory-vector-backfill';

test('memory vector coverage accepts empty libraries without treating them as a failure', () => {
    assert.deepEqual(normalizeMemoryVectorCoverage({ total: 0, indexed: 0, remaining: 0 }), {
        total: 0,
        indexed: 0,
        remaining: 0,
    });
});

test('memory vector coverage normalizes safe Postgres count values', () => {
    assert.deepEqual(
        normalizeMemoryVectorCoverage({ total: 500n, indexed: '420', remaining: 80 }),
        { total: 500, indexed: 420, remaining: 80 }
    );
});

test('memory vector coverage rejects malformed and contradictory aggregates', () => {
    assert.equal(normalizeMemoryVectorCoverage({ total: 4, indexed: 3, remaining: 2 }), null);
    assert.equal(
        normalizeMemoryVectorCoverage({ total: 'not-a-number', indexed: 0, remaining: 0 }),
        null
    );
    assert.equal(
        normalizeMemoryVectorCoverage({
            total: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
            indexed: 0,
            remaining: 0,
        }),
        null
    );
});

test('only active queue states block another vector-backfill click', () => {
    assert.equal(isMemoryVectorBackfillPendingState('waiting'), true);
    assert.equal(isMemoryVectorBackfillPendingState('active'), true);
    assert.equal(isMemoryVectorBackfillPendingState('delayed'), true);
    assert.equal(isMemoryVectorBackfillPendingState('completed'), false);
    assert.equal(isMemoryVectorBackfillPendingState('failed'), false);
    assert.equal(isMemoryVectorBackfillPendingState('idle'), false);
});

test('worker warnings use the bounded readiness vocabulary only', () => {
    assert.equal(isMemoryVectorBackfillWorkerProblem('unavailable'), 'unavailable');
    assert.equal(isMemoryVectorBackfillWorkerProblem('stale'), 'stale');
    assert.equal(isMemoryVectorBackfillWorkerProblem('ready'), null);
    assert.equal(isMemoryVectorBackfillWorkerProblem('anything else'), null);
});
