import assert from 'node:assert/strict';
import test from 'node:test';
import {
    hasCurrentPersistedPostEditResult,
    isAllowedDocumentItemStatusTransition,
} from './translation-stage-transitions';
import { sourceRevision } from './source-revision';

test('allows only repeated or adjacent regular workflow transitions', () => {
    assert.equal(isAllowedDocumentItemStatusTransition('NOT_STARTED', 'MT'), true);
    assert.equal(isAllowedDocumentItemStatusTransition('QA_REVIEW', 'POST_EDIT'), true);
    assert.equal(isAllowedDocumentItemStatusTransition('SIGN_OFF', 'POST_EDIT_REVIEW'), true);
    assert.equal(isAllowedDocumentItemStatusTransition('POST_EDIT', 'POST_EDIT'), true);

    assert.equal(isAllowedDocumentItemStatusTransition('NOT_STARTED', 'QA'), false);
    assert.equal(isAllowedDocumentItemStatusTransition('MT_REVIEW', 'QA_REVIEW'), false);
    assert.equal(isAllowedDocumentItemStatusTransition('POST_EDIT', 'COMPLETED'), false);
    assert.equal(isAllowedDocumentItemStatusTransition('COMPLETED', 'POST_EDIT_REVIEW'), false);
});

test('only recovers worker error and cancellation states through NOT_STARTED', () => {
    assert.equal(isAllowedDocumentItemStatusTransition('ERROR', 'NOT_STARTED'), true);
    assert.equal(isAllowedDocumentItemStatusTransition('CANCELED', 'NOT_STARTED'), true);
    assert.equal(isAllowedDocumentItemStatusTransition('ERROR', 'MT'), false);
    assert.equal(isAllowedDocumentItemStatusTransition('QA_REVIEW', 'ERROR'), false);
    assert.equal(isAllowedDocumentItemStatusTransition('NOT_STARTED', 'unknown'), false);
});

test('requires a fresh persisted post-edit result, including an applied rewrite', () => {
    const sourceText = '原文';
    const baseTarget = 'base target';
    const rewrite = 'revised target';
    const item = {
        sourceText,
        targetText: baseTarget,
        postEditDiscourse: { version: 1, query: [], evaluation: { score: 1 } },
        postEditEmbedded: rewrite,
        metadata: {
            postEditSourceRevision: sourceRevision(sourceText),
            postEditTargetRevision: sourceRevision(baseTarget),
        },
    };

    assert.equal(hasCurrentPersistedPostEditResult(item), true);
    assert.equal(
        hasCurrentPersistedPostEditResult({ ...item, targetText: rewrite }),
        true,
        'an explicitly applied rewrite remains reviewable'
    );
    assert.equal(
        hasCurrentPersistedPostEditResult({ ...item, targetText: 'another target' }),
        false
    );
    assert.equal(
        hasCurrentPersistedPostEditResult({
            ...item,
            metadata: { ...item.metadata, postEditSourceRevision: sourceRevision('new source') },
        }),
        false
    );
    assert.equal(
        hasCurrentPersistedPostEditResult({
            ...item,
            postEditDiscourse: null,
            postEditEmbedded: null,
        }),
        false
    );
});
