import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'actions', 'document-item.ts'),
    'utf8'
);

test('document content reads do not rethrow infrastructure errors to the IDE', () => {
    const start = source.indexOf('export const getContentByIdAction');
    const end = source.indexOf('export async function getDocumentPreviewByItemIdAction');
    const action = source.slice(start, end);

    assert.match(action, /requireOwnedDocumentItem\(id\)/);
    assert.match(action, /rethrowPublicActionError\(error, '无法获取当前分段内容，请刷新后重试'\)/);
    assert.doesNotMatch(action, /throw error/);
});
