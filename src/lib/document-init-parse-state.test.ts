import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOCUMENT_INIT_EMPTY_DOCUMENT_CODE,
    DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER,
    DOCUMENT_INIT_PARSER_FAILED_MARKER,
    hasUsableDocumentText,
    isDocumentInitParsePreviewAdvanceable,
    resolveDocumentInitParseFailureMarker,
    resolveDocumentInitParseOutcome,
    resolveDocumentInitParsePreviewState,
} from './document-init-parse-state';

test('an empty document takes an explicit non-advanceable parse outcome', () => {
    assert.equal(hasUsableDocumentText(' \n\u00a0\u200b\ufeff '), false);
    assert.deepEqual(resolveDocumentInitParseOutcome(' \n\u00a0\u200b\ufeff '), {
        kind: 'empty-document',
        code: DOCUMENT_INIT_EMPTY_DOCUMENT_CODE,
        previewMarker: DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER,
    });
    assert.equal(
        resolveDocumentInitParsePreviewState(DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER),
        'empty-document'
    );
    assert.equal(isDocumentInitParsePreviewAdvanceable(DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER), false);
});

test('only a preview backed by usable source text can advance parsing', () => {
    assert.equal(hasUsableDocumentText('第一条：本协议适用。'), true);
    assert.deepEqual(resolveDocumentInitParseOutcome('第一条：本协议适用。'), { kind: 'parsed' });
    assert.equal(resolveDocumentInitParsePreviewState('<p>第一条：本协议适用。</p>'), 'ready');
    assert.equal(isDocumentInitParsePreviewAdvanceable('<p>第一条：本协议适用。</p>'), true);
    assert.equal(
        resolveDocumentInitParseFailureMarker('unexpected'),
        DOCUMENT_INIT_PARSER_FAILED_MARKER
    );
});
