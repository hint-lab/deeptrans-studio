import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isSameMemoryImportAmbiguityIdentity,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
} from './memory-import-ambiguity';

const identity = {
    jobId: 'memory-import-job-a',
    memoryId: 'memory-a',
    userId: 'user-a',
};

test('an import ambiguity is tied to one job, memory, and owner', () => {
    assert.equal(isSameMemoryImportAmbiguityIdentity(identity, identity), true);
    assert.equal(
        isSameMemoryImportAmbiguityIdentity(identity, { ...identity, jobId: 'job-b' }),
        false
    );
    assert.equal(
        isSameMemoryImportAmbiguityIdentity(identity, { ...identity, memoryId: 'memory-b' }),
        false
    );
    assert.equal(
        isSameMemoryImportAmbiguityIdentity(identity, { ...identity, userId: 'user-b' }),
        false
    );
    assert.equal(MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE, 'MEMORY_IMPORT_COMPLETION_UNCONFIRMED');
    assert.match(MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE, /完成回执/);
});
