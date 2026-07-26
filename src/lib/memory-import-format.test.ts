import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMemoryImportFormat } from './memory-import-format';

test('memory import format resolves equivalent filename and MIME spellings to one parser', () => {
    assert.equal(resolveMemoryImportFormat('legal.csv'), 'csv');
    assert.equal(resolveMemoryImportFormat('TEXT/CSV; charset=utf-8'), 'csv');
    assert.equal(resolveMemoryImportFormat('legal.tsv'), 'tsv');
    assert.equal(resolveMemoryImportFormat('text/tab-separated-values'), 'tsv');
    assert.equal(resolveMemoryImportFormat('translation.tmx'), 'tmx');
    assert.equal(resolveMemoryImportFormat('text/xml'), 'tmx');
    assert.equal(resolveMemoryImportFormat('application/xml; charset=utf-8'), 'tmx');
    assert.equal(resolveMemoryImportFormat('legal.xlsx'), 'spreadsheet');
    assert.equal(resolveMemoryImportFormat('application/vnd.ms-excel'), 'spreadsheet');
    assert.equal(
        resolveMemoryImportFormat(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ),
        'spreadsheet'
    );
});

test('memory import format refuses unknown parser inputs before queueing work', () => {
    assert.equal(resolveMemoryImportFormat('application/pdf'), null);
    assert.equal(resolveMemoryImportFormat('legal.pdf'), null);
    assert.equal(resolveMemoryImportFormat(''), null);
});
