import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('the completed initialization state uses the established success icon instead of emoji', () => {
    assert.match(page, /<SquareCheckBig\s+className="size-4 shrink-0"\s+aria-hidden="true"/);
    assert.doesNotMatch(page, /\u{1F389}/u);
});
