import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workspaceRoot = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('upload server action returns safe coded failures instead of raw thrown messages', () => {
    const uploadAction = source('src/actions/upload.ts');

    assert.match(uploadAction, /uploadFailureFromError\(error\)/);
    assert.match(uploadAction, /UPLOAD_ERROR_CODES\.FILE_TYPE_UNSUPPORTED/);
    assert.match(uploadAction, /resolveUploadContentType\(file\.name, file\.type\)/);
    assert.match(uploadAction, /getReadableUploadedObjectUrlForOwner/);
    assert.doesNotMatch(uploadAction, /error instanceof Error \? error\.message/);
});

test('file upload invalidates old results and does not surface raw action throws', () => {
    const component = source('src/components/file-upload.tsx');

    assert.match(component, /uploadGenerationRef/);
    assert.match(component, /onUploadReset\?\.\(\)/);
    assert.match(component, /isUploadErrorCode/);
    assert.match(component, /commonT\('uploadUnavailable'\)/);
    assert.match(component, /role="alert"/);
    assert.match(component, /<input \{\.\.\.getInputProps\(\)\} \/>/);
    assert.doesNotMatch(component, /toast\.error\(error instanceof Error \? error\.message/);
});
