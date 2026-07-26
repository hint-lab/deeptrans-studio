import assert from 'node:assert/strict';
import test from 'node:test';
import {
    decideMemoryImportTracking,
    memoryImportRecoveryStorageKey,
    memoryImportBlocksNewSubmission,
    parseMemoryImportRecoveryRecords,
    removeMemoryImportRecoveryRecord,
    upsertMemoryImportRecoveryRecord,
} from './memory-import-recovery';

const first = {
    version: 1 as const,
    jobId: 'memory-import-1',
    memoryId: 'memory-a',
    createdAt: 1_750_000_000_000,
};

test('memory import recovery records are strict, deduplicated, and preserve active jobs', () => {
    const records = parseMemoryImportRecoveryRecords([
        first,
        { ...first, createdAt: first.createdAt + 1 },
        { version: 1, jobId: '', memoryId: 'memory-b', createdAt: first.createdAt },
        '{not-a-record}',
    ]);

    assert.deepEqual(records, [{ ...first, createdAt: first.createdAt + 1 }]);
    const withSecond = upsertMemoryImportRecoveryRecord(records, {
        ...first,
        jobId: 'memory-import-2',
        memoryId: 'memory-b',
    });
    assert.equal(memoryImportBlocksNewSubmission(withSecond, 'memory-a'), true);
    assert.equal(memoryImportBlocksNewSubmission(withSecond, 'memory-b'), true);
    assert.equal(
        memoryImportBlocksNewSubmission([{ ...first, lastState: 'failed' }], 'memory-a'),
        false
    );
    assert.equal(
        memoryImportBlocksNewSubmission([{ ...first, lastState: 'unconfirmed' }], 'memory-a'),
        true
    );
    assert.deepEqual(removeMemoryImportRecoveryRecord(withSecond, 'memory-import-1'), [
        { ...first, jobId: 'memory-import-2', memoryId: 'memory-b' },
    ]);
});

test('memory import recovery keeps an optional display-only memory name', () => {
    const [record] = parseMemoryImportRecoveryRecords([{ ...first, memoryName: '中国法律语料库' }]);

    assert.equal(record?.memoryName, '中国法律语料库');
    assert.equal(
        upsertMemoryImportRecoveryRecord([record!], {
            ...record!,
            lastState: 'unconfirmed',
        })[0]?.memoryName,
        '中国法律语料库'
    );
});

test('memory import recovery storage is explicitly namespaced per authenticated user scope', () => {
    assert.notEqual(
        memoryImportRecoveryStorageKey('user-a'),
        memoryImportRecoveryStorageKey('user-b')
    );
    assert.equal(memoryImportRecoveryStorageKey(''), '');
});

test('memory import tracking stops safely for terminal jobs, worker loss, and bounded polling', () => {
    assert.deepEqual(
        decideMemoryImportTracking({ state: 'completed', workerStatus: 'stale', pollAttempt: 0 }),
        { kind: 'completed' }
    );
    assert.deepEqual(
        decideMemoryImportTracking({
            state: 'acknowledged',
            workerStatus: 'stale',
            pollAttempt: 0,
        }),
        { kind: 'acknowledged' }
    );
    assert.deepEqual(
        decideMemoryImportTracking({
            state: 'failed',
            workerStatus: 'unavailable',
            pollAttempt: 0,
        }),
        { kind: 'failed' }
    );
    assert.deepEqual(
        decideMemoryImportTracking({
            state: 'waiting',
            workerStatus: 'unavailable',
            pollAttempt: 0,
        }),
        { kind: 'awaiting-worker', problem: 'unavailable' }
    );
    assert.deepEqual(
        decideMemoryImportTracking({
            state: 'active',
            workerStatus: 'ready',
            pollAttempt: 2,
            pollLimit: 2,
        }),
        { kind: 'background' }
    );
    assert.deepEqual(
        decideMemoryImportTracking({
            state: 'waiting',
            workerStatus: 'ready',
            pollAttempt: 1,
            pollLimit: 2,
        }),
        { kind: 'continue' }
    );
});
