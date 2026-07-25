import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canFinalizeDocumentInitialization,
    canPersistDocumentParseArtifacts,
    canWriteDocumentParseStatus,
    canWriteDocumentSegmentStatus,
    canWriteDocumentTermsStatus,
    resolveProjectInitResumeTarget,
} from './document-init-status';

test('parse status writes are limited to early initialization states', () => {
    for (const status of ['WAITING', 'PARSING', 'ERROR']) {
        assert.equal(canWriteDocumentParseStatus(status), true, status);
    }
    for (const status of [
        'SEGMENTING',
        'TERMS_EXTRACTING',
        'PREPROCESSED',
        'TRANSLATING',
        'COMPLETED',
    ]) {
        assert.equal(canWriteDocumentParseStatus(status), false, status);
    }
});

test('adjacent initialization stages cannot mutate a completed document', () => {
    assert.equal(canPersistDocumentParseArtifacts('PARSING'), true);
    assert.equal(canPersistDocumentParseArtifacts('COMPLETED'), false);
    assert.equal(canWriteDocumentSegmentStatus('PARSING'), true);
    assert.equal(canWriteDocumentSegmentStatus('SEGMENTING'), true);
    assert.equal(canWriteDocumentSegmentStatus('COMPLETED'), false);
    assert.equal(canWriteDocumentTermsStatus('SEGMENTING'), true);
    assert.equal(canWriteDocumentTermsStatus('TERMS_EXTRACTING'), true);
    assert.equal(canWriteDocumentTermsStatus('COMPLETED'), false);
    assert.equal(canFinalizeDocumentInitialization('SEGMENTING'), true);
    assert.equal(canFinalizeDocumentInitialization('TERMS_EXTRACTING'), true);
    assert.equal(canFinalizeDocumentInitialization('COMPLETED'), false);
});

test('project initialization resumes from the server document status', () => {
    assert.equal(resolveProjectInitResumeTarget('WAITING'), 'parse');
    assert.equal(resolveProjectInitResumeTarget('PARSING'), 'parse');
    assert.equal(resolveProjectInitResumeTarget('SEGMENTING'), 'segment');
    assert.equal(resolveProjectInitResumeTarget('TERMS_EXTRACTING'), 'terms');
    assert.equal(resolveProjectInitResumeTarget('PREPROCESSED'), 'ide');
    assert.equal(resolveProjectInitResumeTarget('TRANSLATING'), 'ide');
    assert.equal(resolveProjectInitResumeTarget('COMPLETED'), 'ide');
    assert.equal(resolveProjectInitResumeTarget('ERROR'), 'error');
    assert.equal(resolveProjectInitResumeTarget('unexpected'), 'error');
});
