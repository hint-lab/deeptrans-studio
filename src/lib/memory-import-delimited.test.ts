import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canonicalizeMemoryImportColumnName,
    memoryImportDelimitedDelimiter,
    parseMemoryImportDelimited,
} from './memory-import-delimited';

test('parses BOM CSV fields, escaped quotes, embedded CRLF and a trailing empty field', () => {
    const result = parseMemoryImportDelimited(
        '\uFEFFsource,target,notes\r\n"原文, 带逗号","A ""quoted"" translation","line one\r\nline two"\r\n尾列,has trailing,\r\n',
        { format: 'csv' }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.headers, ['source', 'target', 'notes']);
    assert.deepEqual(result.records, [
        ['原文, 带逗号', 'A "quoted" translation', 'line one\nline two'],
        ['尾列', 'has trailing', ''],
    ]);
    assert.deepEqual(result.pairs, [
        {
            source: '原文, 带逗号',
            target: 'A "quoted" translation',
            notes: 'line one\nline two',
        },
        { source: '尾列', target: 'has trailing', notes: undefined },
    ]);
});

test('uses the exact TSV delimiter and selected custom mapping', () => {
    const result = parseMemoryImportDelimited(
        ' Chinese \tEnglish\tComment\n"申请\t材料"\t"The applicant, shall file."\t"first\nsecond"',
        {
            format: 'tsv',
            mapping: { sourceKey: 'chinese', targetKey: 'ENGLISH', notesKey: 'comment' },
        }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.delimiter, '\t');
    assert.deepEqual(result.columns, {
        sourceKey: ' Chinese ',
        targetKey: 'English',
        notesKey: 'Comment',
        sourceIndex: 0,
        targetIndex: 1,
        notesIndex: 2,
    });
    assert.deepEqual(result.pairs, [
        {
            source: '申请\t材料',
            target: 'The applicant, shall file.',
            notes: 'first\nsecond',
        },
    ]);
});

test('canonical aliases are used, blank physical rows are skipped, and incomplete pairs are omitted', () => {
    const result = parseMemoryImportDelimited(
        '\n 原文 , 译文 , 备注 \n\n保留,keep,note\n只原文,,missing target\n,只译文,missing source\n',
        { format: 'csv' }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.headers, [' 原文 ', ' 译文 ', ' 备注 ']);
    assert.deepEqual(result.records, [
        ['保留', 'keep', 'note'],
        ['只原文', '', 'missing target'],
        ['', '只译文', 'missing source'],
    ]);
    assert.deepEqual(result.pairs, [{ source: '保留', target: 'keep', notes: 'note' }]);
});

test('never splits a CSV tab or a TSV comma as another delimiter', () => {
    const csv = parseMemoryImportDelimited('source,target\n"a\tb",c', { format: 'csv' });
    const tsv = parseMemoryImportDelimited('source\ttarget\na,b\tc', { format: 'tsv' });

    assert.equal(csv.ok, true);
    assert.equal(tsv.ok, true);
    if (!csv.ok || !tsv.ok) return;
    assert.deepEqual(csv.pairs, [{ source: 'a\tb', target: 'c', notes: undefined }]);
    assert.deepEqual(tsv.pairs, [{ source: 'a,b', target: 'c', notes: undefined }]);
});

test('returns an explicit error rather than importing a partial unclosed quoted record', () => {
    const result = parseMemoryImportDelimited('source,target\nvalid,ok\n"unfinished,target', {
        format: 'csv',
    });

    assert.deepEqual(result, {
        ok: false,
        error: {
            code: 'UNTERMINATED_QUOTE',
            message: '第 3 行第 19 列的引号未闭合',
            line: 3,
            column: 19,
        },
    });
});

test('exports stable canonicalization and format delimiters for all callers', () => {
    assert.equal(canonicalizeMemoryImportColumnName('\uFEFF  SOURCE  '), 'source');
    assert.equal(memoryImportDelimitedDelimiter('csv'), ',');
    assert.equal(memoryImportDelimitedDelimiter('tsv'), '\t');
});
