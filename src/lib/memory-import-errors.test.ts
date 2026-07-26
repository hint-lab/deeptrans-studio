import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
    MEMORY_IMPORT_FAILED_MESSAGE,
    MEMORY_IMPORT_FILE_FORMAT_MESSAGE,
    MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE,
    memoryImportJobFailureMessage,
} from './memory-import-errors';
import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    translationMemoryImportPairLimitMessage,
} from './memory-import-validation';

test('keeps bounded, user-actionable import failures visible', () => {
    assert.equal(
        memoryImportJobFailureMessage(EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE),
        EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE
    );
    const overLimit = translationMemoryImportPairLimitMessage(501);
    assert.equal(memoryImportJobFailureMessage(overLimit), overLimit);
    assert.equal(
        memoryImportJobFailureMessage('MALFORMED_DELIMITED_IMPORT: UNTERMINATED_QUOTE: row 7'),
        MEMORY_IMPORT_FILE_FORMAT_MESSAGE
    );
});

test('does not expose worker provider or database failures through import status', () => {
    const leaked = memoryImportJobFailureMessage(
        'connect ECONNREFUSED postgres.internal:5432 with password=not-safe'
    );

    assert.equal(leaked, MEMORY_IMPORT_FAILED_MESSAGE);
    assert.doesNotMatch(leaked, /postgres|5432|password|ECONNREFUSED/i);
    assert.equal(
        memoryImportJobFailureMessage('database password rejected', MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE),
        MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE
    );
});

test('memory import routes map unexpected failures and worker reasons through the safe boundary', () => {
    const statusRoute = readFileSync(
        resolve(process.cwd(), 'src/app/api/memories/import/status/route.ts'),
        'utf8'
    );
    const importRoute = readFileSync(
        resolve(process.cwd(), 'src/app/api/memories/import/route.ts'),
        'utf8'
    );

    assert.match(statusRoute, /memoryImportJobFailureMessage\(job\.failedReason\)/);
    assert.match(statusRoute, /MEMORY_IMPORT_UNAVAILABLE_MESSAGE/);
    assert.doesNotMatch(statusRoute, /function safeFailureReason/);
    assert.doesNotMatch(statusRoute, /guardMessage\(error\)/);
    assert.match(importRoute, /e instanceof GuardError \? e\.message : MEMORY_IMPORT_UNAVAILABLE_MESSAGE/);
});
