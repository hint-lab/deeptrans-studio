import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const page = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', '(app)', 'dashboard', 'memories', 'page.tsx'),
    'utf8'
);

test('memory deletion opens a confirmation dialog before invoking the server action', () => {
    const requestStart = page.indexOf('const requestDelete');
    const confirmStart = page.indexOf('const confirmDelete');
    const exportStart = page.indexOf('const handleExport');
    const requestDelete = page.slice(requestStart, confirmStart);
    const confirmDelete = page.slice(confirmStart, exportStart);

    assert.ok(requestStart >= 0 && confirmStart > requestStart && exportStart > confirmStart);
    assert.match(requestDelete, /setDeleteCandidate\(memory\)/);
    assert.doesNotMatch(requestDelete, /deleteMemoryAction/);
    assert.match(confirmDelete, /await deleteMemoryAction\(memory\.id\)/);
});

test('memory deletion dialog names the memory and entry count, and blocks duplicate clicks', () => {
    assert.match(page, /t\('DeleteDialog\.description', \{/);
    assert.match(page, /name: deleteCandidate\.name/);
    assert.match(page, /deleteCandidate\._count\?\.entries \?\? 0/);
    assert.match(page, /disabled=\{deletingMemoryId !== null \|\| !deleteCandidate\}/);
    assert.match(page, /onClick=\{\(\) => setDeleteCandidate\(null\)\}/);
    assert.match(page, /if \(!open && !deletingMemoryId\) setDeleteCandidate\(null\);/);
});
