import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createWorkerHeartbeat,
    deriveWorkerReadiness,
    memoryImportWorkerProblem,
    staleWorkerHeartbeatIds,
} from './worker-readiness';

const NOW = 1_750_000_000_000;

function heartbeat(queues: string[], updatedAt = NOW) {
    return JSON.stringify(createWorkerHeartbeat(queues, NOW - 1_000, updatedAt));
}

test('worker readiness is ready only for a fresh heartbeat that serves the requested queue', () => {
    assert.deepEqual(
        deriveWorkerReadiness(
            {
                one: heartbeat(['memory-import']),
                two: heartbeat(['pretranslate']),
            },
            { queue: 'memory-import', now: NOW }
        ),
        { status: 'ready', freshWorkers: 1, staleWorkers: 0 }
    );
});

test('worker readiness distinguishes stale, unavailable, and malformed heartbeats safely', () => {
    assert.deepEqual(
        deriveWorkerReadiness(
            { one: heartbeat(['memory-import'], NOW - 45_001) },
            { queue: 'memory-import', now: NOW }
        ),
        { status: 'stale', freshWorkers: 0, staleWorkers: 1 }
    );
    assert.deepEqual(
        deriveWorkerReadiness({ one: '{not-json' }, { queue: 'memory-import', now: NOW }),
        { status: 'unavailable', freshWorkers: 0, staleWorkers: 0 }
    );
});

test('memory-import polling only treats an unhealthy worker as blocking before a terminal job state', () => {
    assert.equal(memoryImportWorkerProblem('waiting', 'unavailable'), 'unavailable');
    assert.equal(memoryImportWorkerProblem('active', 'stale'), 'stale');
    assert.equal(memoryImportWorkerProblem('completed', 'stale'), null);
    assert.equal(memoryImportWorkerProblem('failed', 'unavailable'), null);
    assert.equal(memoryImportWorkerProblem('waiting', 'ready'), null);
});

test('only well-formed stale worker fields are eligible for heartbeat cleanup', () => {
    assert.deepEqual(
        staleWorkerHeartbeatIds(
            {
                stale: heartbeat(['memory-import'], NOW - 45_001),
                fresh: heartbeat(['memory-import']),
                malformed: '{not-json',
            },
            { now: NOW }
        ),
        ['stale']
    );
});
