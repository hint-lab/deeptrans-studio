import assert from 'node:assert/strict';
import test from 'node:test';

import {
    requireSelectedDictionaryEntries,
    SelectedDictionaryEntriesLoadError,
} from './selected-dictionary-entries';

test('uses selected dictionary entries only after an explicit successful array response', () => {
    assert.deepEqual(
        requireSelectedDictionaryEntries<{ sourceText: string }>({
            success: true,
            data: [{ sourceText: 'contract' }],
        }),
        [{ sourceText: 'contract' }]
    );
});

test('rejects a selected dictionary action failure instead of allowing bare translation', () => {
    assert.throws(
        () => requireSelectedDictionaryEntries({ success: false, error: 'database unavailable' }),
        error => error instanceof SelectedDictionaryEntriesLoadError
    );
});

test('rejects malformed successful responses because they cannot prove the glossary loaded', () => {
    assert.throws(
        () => requireSelectedDictionaryEntries({ success: true, data: null }),
        error => error instanceof SelectedDictionaryEntriesLoadError
    );
});
