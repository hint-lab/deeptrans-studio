import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clampDictionaryEntryPage,
    dictionaryEntryPageCount,
    normalizeDictionaryEntryOriginFilter,
    normalizeDictionaryEntryPage,
    normalizeDictionaryEntryPageSize,
} from './dictionary-entry-pagination';

test('dictionary entry paging normalizes untrusted numeric values before database offsets', () => {
    assert.equal(normalizeDictionaryEntryPage(undefined), 1);
    assert.equal(normalizeDictionaryEntryPage(0), 1);
    assert.equal(normalizeDictionaryEntryPage(-4), 1);
    assert.equal(normalizeDictionaryEntryPage(2.9), 2);
    assert.equal(normalizeDictionaryEntryPage(Number.POSITIVE_INFINITY), 1);
    assert.equal(normalizeDictionaryEntryPage(9_999_999), 1_000_000);

    assert.equal(normalizeDictionaryEntryPageSize(undefined), 50);
    assert.equal(normalizeDictionaryEntryPageSize(0), 50);
    assert.equal(normalizeDictionaryEntryPageSize(-1), 50);
    assert.equal(normalizeDictionaryEntryPageSize(20.9), 20);
    assert.equal(normalizeDictionaryEntryPageSize(900), 500);
});

test('dictionary entry paging clamps an emptied final page to the remaining result range', () => {
    assert.equal(dictionaryEntryPageCount(0, 50), 1);
    assert.equal(dictionaryEntryPageCount(51, 50), 2);
    assert.equal(clampDictionaryEntryPage(4, 101, 50), 3);
    assert.equal(clampDictionaryEntryPage(2, 0, 50), 1);
});

test('dictionary entry origin filters never broaden an unknown client value', () => {
    assert.equal(normalizeDictionaryEntryOriginFilter('manual'), 'manual');
    assert.equal(normalizeDictionaryEntryOriginFilter(' import:xlsx '), 'import:xlsx');
    assert.equal(normalizeDictionaryEntryOriginFilter('import:client'), 'import:client');
    assert.equal(normalizeDictionaryEntryOriginFilter('apply:mt'), 'apply:mt');
    assert.equal(normalizeDictionaryEntryOriginFilter('all'), undefined);
    assert.equal(normalizeDictionaryEntryOriginFilter('unexpected-origin'), undefined);
});
