import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    hasImportableTranslationMemoryPairs,
    isTranslationMemoryImportPairCountAllowed,
    MAX_TRANSLATION_MEMORY_IMPORT_PAIRS,
    translationMemoryImportPairLimitMessage,
} from './memory-import-validation';

test('rejects a translation-memory import with no complete source/target pair', () => {
    assert.equal(hasImportableTranslationMemoryPairs([]), false);
    assert.equal(
        hasImportableTranslationMemoryPairs([
            { source: 'only source', target: '' },
            { source: ' ', target: 'only target' },
        ]),
        false
    );
    assert.match(EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE, /原文\/译文/);
});

test('accepts an import only when it contains a complete pair', () => {
    assert.equal(
        hasImportableTranslationMemoryPairs([
            { source: '原文', target: 'translation' },
            { source: '', target: '' },
        ]),
        true
    );
});

test('keeps one receipt-backed import within its bounded transaction capacity', () => {
    assert.equal(MAX_TRANSLATION_MEMORY_IMPORT_PAIRS, 500);
    assert.equal(isTranslationMemoryImportPairCountAllowed(0), true);
    assert.equal(isTranslationMemoryImportPairCountAllowed(500), true);
    assert.equal(isTranslationMemoryImportPairCountAllowed(501), false);
    assert.equal(isTranslationMemoryImportPairCountAllowed(1.5), false);
    assert.match(translationMemoryImportPairLimitMessage(501), /500/);
    assert.match(translationMemoryImportPairLimitMessage(501), /501/);
    assert.match(translationMemoryImportPairLimitMessage(501), /拆分文件/);
});
