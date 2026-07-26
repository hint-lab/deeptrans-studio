import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workerSource = () =>
    fs.readFileSync(path.join(process.cwd(), 'src', 'worker', 'index.ts'), 'utf8');

test('memory-import worker uses the shared strict CSV/TSV parser before any vectors or entries', () => {
    const source = workerSource();
    const importStart = source.indexOf('const memoryImportWorker = createWorker');
    const importEnd = source.indexOf("'memory-vector-backfill'", importStart);
    const memoryImport = source.slice(importStart, importEnd);

    const parse = memoryImport.indexOf('parseMemoryImportDelimited(buf.toString');
    const pairLimit = memoryImport.indexOf('isTranslationMemoryImportPairCountAllowed');
    const vector = memoryImport.indexOf('embedBatchForOwner');
    // The worker delegates the final write to one receipt-backed ownership
    // boundary; entries and vectors are no longer committed separately.
    const entry = memoryImport.indexOf('commitMemoryImportWithReceiptForCurrentOwner');

    assert.match(
        source,
        /import \{ parseMemoryImportDelimited \} from '@\/lib\/memory-import-delimited'/
    );
    assert.ok(parse >= 0 && parse < pairLimit && pairLimit < vector && parse < entry);
    assert.match(
        source,
        /import \{ resolveMemoryImportFormat \} from '@\/lib\/memory-import-format'/
    );
    assert.match(memoryImport, /const importFormat = resolveMemoryImportFormat\(fileType\)/);
    assert.match(memoryImport, /format: importFormat/);
    assert.match(memoryImport, /mapping: \{ sourceKey, targetKey, notesKey \}/);
    assert.match(memoryImport, /MALFORMED_DELIMITED_IMPORT/);
    assert.match(memoryImport, /translationMemoryImportPairLimitMessage\(pairs\.length\)/);
    assert.match(memoryImport, /commitMemoryImportWithReceiptForCurrentOwner\(prisma/);
    assert.match(memoryImport, /upsertTranslationMemoryVectorsWithClient\(transaction, points\)/);
    assert.doesNotMatch(memoryImport, /headerLine\.split\(\/,\|\\t\/\)/);
    assert.doesNotMatch(memoryImport, /line\.split\(\/,\|\\t\/\)/);
});

test('memory-import worker delegates filename and MIME format choice to the shared resolver', () => {
    const source = workerSource();
    const importStart = source.indexOf('const memoryImportWorker = createWorker');
    const importEnd = source.indexOf("'memory-vector-backfill'", importStart);
    const memoryImport = source.slice(importStart, importEnd);

    assert.match(memoryImport, /importFormat === 'csv' \|\| importFormat === 'tsv'/);
    assert.match(memoryImport, /importFormat === 'tmx'/);
    assert.match(memoryImport, /importFormat === 'spreadsheet'/);
    assert.doesNotMatch(memoryImport, /const ext = String\(fileType/);
    assert.doesNotMatch(memoryImport, /const mediaType =/);
});
