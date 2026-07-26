import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isSameMemoryImportJob,
    memoryImportInputFingerprint,
    memoryImportJobId,
    MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION,
    usesMemoryImportReceiptProtocol,
} from './memory-import-job';

const identity = {
    userId: 'user-a',
    memoryId: 'memory-a',
    fileKey: 'users/user-a/uploads/legal.csv',
    tenantId: 'tenant-a',
    fileType: 'legal.csv',
    sourceLang: 'zh',
    targetLang: 'en',
    sourceKey: 'source',
    targetKey: 'target',
    notesKey: 'notes',
};

test('memory import job IDs are stable, scoped, and opaque', () => {
    const jobId = memoryImportJobId(identity);
    assert.equal(jobId, memoryImportJobId(identity));
    assert.notEqual(jobId, memoryImportJobId({ ...identity, memoryId: 'memory-b' }));
    assert.notEqual(jobId, memoryImportJobId({ ...identity, userId: 'user-b' }));
    assert.match(jobId, /^memory-import-[a-f0-9]{40}$/);
    assert.equal(jobId.includes(identity.userId), false);
    assert.equal(jobId.includes(identity.memoryId), false);
    assert.match(memoryImportInputFingerprint(identity), /^[a-f0-9]{64}$/);
});

test('memory import job reuse requires every parser and owner input', () => {
    assert.equal(isSameMemoryImportJob(identity, identity), true);
    assert.equal(isSameMemoryImportJob({ ...identity, fileKey: 'other.csv' }, identity), false);
    assert.equal(isSameMemoryImportJob({ ...identity, userId: 'user-b' }, identity), false);
    assert.equal(isSameMemoryImportJob({ ...identity, sourceKey: 'source_2' }, identity), false);
    assert.equal(isSameMemoryImportJob({ ...identity, targetLang: 'de' }, identity), false);
    assert.equal(isSameMemoryImportJob({ ...identity, tenantId: 'Tenant-A' }, identity), false);
    assert.notEqual(
        memoryImportJobId(identity),
        memoryImportJobId({ ...identity, fileType: 'legal.tsv' })
    );
});

test('equivalent parser defaults and presentation-only type spellings share an identity', () => {
    const equivalent = {
        ...identity,
        fileType: 'TEXT/CSV; charset=utf-8',
        sourceLang: ' ZH ',
        sourceKey: '',
        targetKey: ' TARGET ',
        notesKey: '',
    };

    assert.equal(memoryImportInputFingerprint(equivalent), memoryImportInputFingerprint(identity));
    assert.equal(isSameMemoryImportJob(equivalent, identity), true);
});

test('only the explicit receipt protocol marker declares a failed job safe to retry', () => {
    assert.equal(
        usesMemoryImportReceiptProtocol({
            ...identity,
            receiptProtocolVersion: MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION,
        }),
        true
    );
    assert.equal(usesMemoryImportReceiptProtocol(identity), false);
    assert.equal(usesMemoryImportReceiptProtocol({ receiptProtocolVersion: 2 }), false);
    assert.equal(usesMemoryImportReceiptProtocol(null), false);
});
