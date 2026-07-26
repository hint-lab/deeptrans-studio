import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (...segments: string[]) =>
    readFileSync(resolve(process.cwd(), 'src', ...segments), 'utf8');

test('document intelligence parses the authorized uploaded object key, never a browser URL', () => {
    const action = readSource('actions', 'parse-docx.ts');
    const page = readSource('app', '(app)', 'dashboard', 'document-intelligence', 'page.tsx');

    assert.match(action, /getReadableUploadedObjectBufferForOwner/);
    assert.match(action, /extractDocxFromBuffer/);
    assert.doesNotMatch(action, /extractDocxFromUrl/);
    assert.doesNotMatch(action, /fetch\(/);
    assert.match(page, /parseDocxAction\(fileToTranslate\.fileName\)/);
    assert.doesNotMatch(page, /parseDocxAction\(fileToTranslate\.fileUrl\)/);
});
