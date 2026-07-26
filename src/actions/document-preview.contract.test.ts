import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('document preview signs the stored object server-side and keeps the display name separate', () => {
    const action = source('src/actions/document.ts');
    const preview = source('src/app/(app)/ide/[id]/components/preview.tsx');

    assert.match(action, /getReadableDocumentSourceUrlForOwner\(doc\.name, authCtx\)/);
    assert.match(action, /fileUrl,/);
    assert.match(action, /name: doc\.originalName \|\| doc\.name/);
    assert.doesNotMatch(preview, /getFileUrlAction/);
    assert.match(preview, /info\.fileUrl/);
});
