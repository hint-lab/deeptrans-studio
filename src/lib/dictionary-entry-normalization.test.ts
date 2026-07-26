import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DICTIONARY_ENTRY_LIMITS,
    dictionaryImportOriginForFilename,
    normalizeAndDeduplicateDictionaryEntries,
    normalizeDictionaryEntry,
    normalizeDictionaryEntryTerms,
} from './dictionary-entry-normalization';

test('dictionary entries are trimmed and reject incomplete pairs', () => {
    assert.deepEqual(
        normalizeDictionaryEntry({ sourceText: '  contract ', targetText: ' 合同 ', notes: '  legal ' }),
        { sourceText: 'contract', targetText: '合同', notes: 'legal' }
    );
    assert.throws(
        () => normalizeDictionaryEntry({ sourceText: 'contract', targetText: ' ' }),
        /词条译文不能为空/
    );
    assert.throws(
        () => normalizeDictionaryEntry({ sourceText: ' ', targetText: '合同' }),
        /词条原文不能为空/
    );
});

test('import rows fold exact duplicates but reject conflicting translations', () => {
    const result = normalizeAndDeduplicateDictionaryEntries([
        { sourceText: 'agreement', targetText: '协议' },
        { sourceText: 'agreement', targetText: '协议' },
        { sourceText: 'term', targetText: '术语' },
    ]);

    assert.equal(result.duplicateCount, 1);
    assert.deepEqual(result.entries, [
        { sourceText: 'agreement', targetText: '协议' },
        { sourceText: 'term', targetText: '术语' },
    ]);
    assert.throws(
        () =>
            normalizeAndDeduplicateDictionaryEntries([
                { sourceText: 'agreement', targetText: '协议' },
                { sourceText: 'agreement', targetText: '协定' },
            ]),
        /存在冲突的译文/
    );
});

test('pending term inputs deduplicate and retain the source length boundary', () => {
    assert.deepEqual(normalizeDictionaryEntryTerms([' term ', '', 'term', 'new']), {
        terms: ['term', 'new'],
        skipped: 2,
    });
    assert.throws(
        () => normalizeDictionaryEntryTerms(['x'.repeat(DICTIONARY_ENTRY_LIMITS.sourceText + 1)]),
        /sourceText 不能超过/
    );
});

test('import provenance follows the source file type', () => {
    assert.equal(dictionaryImportOriginForFilename('glossary.xlsx'), 'import:xlsx');
    assert.equal(dictionaryImportOriginForFilename('terms.TBX'), 'import:tbx');
    assert.equal(dictionaryImportOriginForFilename('legacy.xml'), 'import:tbx');
});
