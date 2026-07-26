import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getPreviewRequestScope,
    isCurrentPreviewRequest,
    shouldClearPreview,
} from './preview-request';

test('accepts preview output only for the current request and current document', () => {
    const projectADocument = getPreviewRequestScope('project-a', 'document-a')!;
    const projectBDocument = getPreviewRequestScope('project-b', 'document-a')!;
    assert.equal(isCurrentPreviewRequest(3, 3, projectADocument, projectADocument), true);
    assert.equal(isCurrentPreviewRequest(2, 3, projectADocument, projectADocument), false);
    assert.equal(isCurrentPreviewRequest(3, 3, projectADocument, projectBDocument), false);
    assert.equal(isCurrentPreviewRequest(3, 3, projectADocument, null), false);
});

test('scopes preview output to both project and document and clears an incomplete scope', () => {
    assert.notEqual(
        getPreviewRequestScope('project-a', 'document-a'),
        getPreviewRequestScope('project-b', 'document-a')
    );
    assert.equal(getPreviewRequestScope('', 'document-a'), null);
    assert.equal(getPreviewRequestScope('project-a', ''), null);
    assert.equal(shouldClearPreview(getPreviewRequestScope('project-a', 'document-a')), false);
    assert.equal(shouldClearPreview(null), true);
});
