import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUploadContentType } from './upload-validation';

test('accepts supported upload extensions and canonicalizes generic browser MIME types', () => {
    assert.equal(resolveUploadContentType('contract.PDF', 'application/pdf'), 'application/pdf');
    assert.equal(resolveUploadContentType('draft.md', 'application/octet-stream'), 'text/markdown');
    assert.equal(resolveUploadContentType('photo.JPG', ''), 'image/jpeg');
    assert.equal(
        resolveUploadContentType(
            'translation.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
});

test('rejects unsupported extensions and conflicting declared types', () => {
    assert.equal(resolveUploadContentType('payload.exe', 'application/octet-stream'), null);
    assert.equal(resolveUploadContentType('contract.pdf', 'image/png'), null);
    assert.equal(resolveUploadContentType('notes', 'text/plain'), null);
});
