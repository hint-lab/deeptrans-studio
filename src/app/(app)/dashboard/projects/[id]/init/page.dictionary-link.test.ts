import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('the term-review dictionary action opens the project-scoped dictionary page', () => {
    assert.match(
        page,
        /onViewDictionary=\{\(\) =>\s*router\.push\(`\/dashboard\/dictionaries\/project\/\$\{projectId\}`\)\s*\}/
    );
});
