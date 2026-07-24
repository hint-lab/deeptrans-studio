import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { DICTIONARY_TEMPLATE_HEADERS } from './dictionary-template';

test('dictionary template matches the production import contract', () => {
    const templatePath = path.join(
        process.cwd(),
        'public',
        'templates',
        'deeptrans-dictionary-template.xlsx'
    );

    assert.equal(fs.existsSync(templatePath), true);

    const workbook = XLSX.read(fs.readFileSync(templatePath), { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['词条', '填写说明']);

    const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    assert.ok(firstSheet);

    const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
        header: 1,
        blankrows: false,
    });
    assert.deepEqual(rows[0], [...DICTIONARY_TEMPLATE_HEADERS]);

    const importRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    assert.deepEqual(importRows, []);
});
