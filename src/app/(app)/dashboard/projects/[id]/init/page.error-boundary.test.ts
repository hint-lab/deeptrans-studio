import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('project initialization does not render raw caught or API error messages', () => {
    assert.match(page, /createProjectInitApiError/);
    assert.match(page, /resolveSafeErrorDescription/);
    assert.doesNotMatch(page, /(?:error|e)\?\.message/);
    assert.doesNotMatch(page, /String\((?:error|e)\?\.message/);
    assert.doesNotMatch(page, /result\?\.error\s*\|\|/);
});

test('project initialization keeps explicit cancel, conflict, and parse states', () => {
    assert.match(page, /termsCancelUpdated/);
    assert.match(page, /segmentConflict/);
    assert.match(page, /resolveProjectInitParseFailureCode\(error\)/);
});
