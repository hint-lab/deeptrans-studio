import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('document preview streams the owner-scoped object through a same-origin route', () => {
    const preview = source('src/app/(app)/ide/[id]/components/preview.tsx');
    const route = source('src/app/api/document/preview/[itemId]/route.ts');
    const uploadedObject = source('src/server/uploaded-object.ts');

    assert.doesNotMatch(preview, /getFileUrlAction/);
    assert.doesNotMatch(preview, /fetchDocumentPreviewByDocIdAction/);
    assert.match(preview, /\/api\/document\/preview\/\$\{encodeURIComponent\(previewItemId\)\}/);
    assert.match(route, /requireOwnedDocumentItem\(itemId, authCtx\)/);
    assert.match(route, /getReadableDocumentSourceBufferForOwner\(doc\.name, authCtx\)/);
    assert.doesNotMatch(route, /NextResponse\.redirect/);
    assert.match(uploadedObject, /getReadableUploadedObjectBufferForOwner\(fileName, authCtx\)/);
});
