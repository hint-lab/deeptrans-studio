import assert from 'node:assert/strict';
import test from 'node:test';
import { Job } from 'bullmq';
import {
    documentTermsBatchPointerKey,
    documentTermsJobId,
    normalizeDocumentTermJobOptions,
    resolveDocumentTermsStatus,
} from './document-term-job';

test('keeps a document-scoped pointer to the recoverable terms batch', () => {
    assert.equal(documentTermsBatchPointerKey('document-1'), 'project-init:terms-batch:document-1');
    assert.throws(() => documentTermsBatchPointerKey(''), /missing document id/);
});

test('encodes project-scoped batch IDs for BullMQ custom IDs', () => {
    const scopedBatchId = 'cmryu7fmc0004pa019bk29uxl:cmryu7fmc0004pa019bk29uxl.1784891319255';
    const jobId = documentTermsJobId(scopedBatchId);

    assert.equal(jobId.includes(':'), false);
    assert.equal(jobId, documentTermsJobId(scopedBatchId));
    assert.notEqual(documentTermsJobId('project:batch'), documentTermsJobId('project.batch'));

    const validate = (Job.prototype as any).validateOptions;
    assert.throws(
        () => validate.call({ opts: { jobId: `docTerms.${scopedBatchId}.all` } }, { data: '{}' }),
        /Custom Id cannot contain :/
    );
    assert.doesNotThrow(() => validate.call({ opts: { jobId } }, { data: '{}' }));
});

test('only accepts term extraction options from request data', () => {
    assert.deepEqual(
        normalizeDocumentTermJobOptions({
            maxTerms: '120',
            chunkSize: 8000,
            overlap: 300,
            prompt: ' 法律术语 ',
            batchId: 'attacker-batch',
            userId: 'attacker-user',
            text: 'attacker-text',
        }),
        { maxTerms: 120, chunkSize: 8000, overlap: 300, prompt: '法律术语' }
    );
});

test('reports a failed term job instead of leaving it running at zero percent', () => {
    assert.equal(resolveDocumentTermsStatus('1', '0', '1'), 'failed');
    assert.equal(resolveDocumentTermsStatus('1', '0', '0'), 'running');
    assert.equal(resolveDocumentTermsStatus('1', '1', '0'), 'completed');
    assert.equal(resolveDocumentTermsStatus(null, null, null), 'idle');
});
