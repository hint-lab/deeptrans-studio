import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseOwnedUploadedObjectKey } from './uploaded-object-key';

test('recognizes only generated owner-scoped uploaded object keys', () => {
    assert.deepEqual(parseOwnedUploadedObjectKey('users/user-a/uploads/uuid.docx', 'user-a'), {
        kind: 'user',
        fileName: 'users/user-a/uploads/uuid.docx',
    });
    assert.deepEqual(parseOwnedUploadedObjectKey('projects/project-a/uuid.docx', 'user-a'), {
        kind: 'project',
        projectId: 'project-a',
        fileName: 'projects/project-a/uuid.docx',
    });
});

test('rejects foreign, nested, and arbitrary URL object references', () => {
    for (const fileName of [
        'users/user-b/uploads/uuid.docx',
        'users/user-a/uploads/nested/uuid.docx',
        'projects/project-a/nested/uuid.docx',
        'https://internal.service/doc.docx',
        '/projects/project-a/uuid.docx',
        '',
    ]) {
        assert.equal(parseOwnedUploadedObjectKey(fileName, 'user-a'), null, fileName);
    }
});

test('document source resolution rejects legacy URL-only records instead of fetching them', () => {
    const source = readFileSync(
        resolve(process.cwd(), 'src', 'server', 'uploaded-object.ts'),
        'utf8'
    );

    assert.match(source, /getReadableDocumentSourceUrlForOwner/);
    assert.match(source, /parseOwnedUploadedObjectKey\(fileName, authCtx\.userId\)/);
    assert.match(source, /DOCUMENT_SOURCE_UNAVAILABLE_MESSAGE/);
    assert.match(source, /getReadableUploadedObjectUrlForOwner\(fileName, authCtx\)/);
});
