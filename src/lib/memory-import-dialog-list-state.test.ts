import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const dialog = readFileSync(
    resolve(
        process.cwd(),
        'src/app/(app)/dashboard/memories/components/import-memory-dialog.tsx'
    ),
    'utf8'
);

test('memory import dialog distinguishes an unavailable library list from an empty list', () => {
    assert.match(dialog, /const \[memoryListLoadError, setMemoryListLoadError\]/);
    assert.match(dialog, /const refreshMemoryList = useCallback/);
    assert.match(dialog, /res\?\.success !== true \|\| !Array\.isArray\(res\.data\)/);
    assert.match(dialog, /setMemoryListLoadError\(t\('memoryListUnavailable'\)\)/);
    assert.match(dialog, /role="alert"/);
    assert.match(dialog, /refreshMemoryList\(\)/);
    assert.match(dialog, /Boolean\(memoryListLoadError\)/);
});
