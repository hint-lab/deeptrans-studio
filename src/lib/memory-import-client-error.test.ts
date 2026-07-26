import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyMemoryImportClientFailure,
    memoryImportProtocolError,
    MEMORY_IMPORT_CLIENT_PROTOCOL_CODES,
} from './memory-import-client-error';
import {
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
} from './memory-import-ambiguity';
import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    translationMemoryImportPairLimitMessage,
} from './memory-import-validation';

test('memory import client failures retain only bounded input and receipt states', () => {
    assert.deepEqual(
        classifyMemoryImportClientFailure({ publicError: EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE }),
        { kind: 'empty-pairs' }
    );
    assert.deepEqual(
        classifyMemoryImportClientFailure({
            publicError: translationMemoryImportPairLimitMessage(501),
        }),
        { kind: 'pair-limit', pairCount: 501 }
    );
    assert.deepEqual(
        classifyMemoryImportClientFailure({ code: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE }),
        { kind: 'unconfirmed' }
    );
    assert.deepEqual(
        classifyMemoryImportClientFailure({
            publicError: MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
        }),
        { kind: 'unconfirmed' }
    );
});

test('memory import client failures map auth and unknown server payloads without returning them', () => {
    assert.deepEqual(classifyMemoryImportClientFailure({ status: 401 }), {
        kind: 'auth-required',
    });
    assert.deepEqual(classifyMemoryImportClientFailure({ status: 403 }), {
        kind: 'access-denied',
    });
    assert.deepEqual(
        classifyMemoryImportClientFailure({
            status: 502,
            publicError: 'redis://internal.example:6379 password=do-not-show',
        }),
        { kind: 'recovery-unavailable' }
    );
});

test('client-only protocol failures use stable codes instead of a displayable Error message', () => {
    const error = memoryImportProtocolError(MEMORY_IMPORT_CLIENT_PROTOCOL_CODES.MISSING_JOB_ID);

    assert.equal(error.message, '');
    assert.deepEqual(classifyMemoryImportClientFailure(error), { kind: 'missing-job-id' });
});
