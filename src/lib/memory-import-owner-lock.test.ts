import assert from 'node:assert/strict';
import test from 'node:test';
import {
    commitMemoryImportWithReceiptForCurrentOwner,
    createMemoryImportEntriesForCurrentOwner,
    MEMORY_IMPORT_OWNER_MISMATCH_ERROR,
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
    type MemoryImportCreatedEntry,
    type MemoryImportEntryInput,
    type MemoryImportReceipt,
    type MemoryImportWriteClient,
    type MemoryImportWriteTransaction,
} from './memory-import-owner-lock';
import { MAX_TRANSLATION_MEMORY_IMPORT_PAIRS } from './memory-import-validation';

const entry: MemoryImportEntryInput = {
    sourceText: '源文',
    targetText: 'Target',
    notes: null,
    sourceLang: 'zh',
    targetLang: 'en',
    createdById: 'user-a',
    updatedById: 'user-a',
};

const receipt = {
    jobId: 'memory-import-job-a',
    inputFingerprint: 'f'.repeat(64),
    fileKey: 'users/user-a/uploads/legal.csv',
    total: 2,
    indexed: 2,
};

type CreatedData = {
    id: string;
    memoryId: string;
    sourceText: string;
    targetText: string;
};

function createClient(options: {
    lockedMemories: Array<{ id: string }>;
    existingReceipt?: MemoryImportReceipt | null;
    receiptAfterUniqueError?: MemoryImportReceipt | null;
    uniqueErrorOnReceiptCreate?: boolean;
    createCount?: number;
}) {
    const queries: unknown[] = [];
    const writes: CreatedData[] = [];
    const committedReceipts: MemoryImportReceipt[] = [];
    const operations: string[] = [];
    let transactions = 0;
    let uniqueErrorRaised = false;

    const client: MemoryImportWriteClient = {
        $transaction: async callback => {
            transactions += 1;
            const stagedWrites: CreatedData[] = [];
            const stagedReceipts: MemoryImportReceipt[] = [];
            const transaction: MemoryImportWriteTransaction = {
                $queryRaw: async query => {
                    queries.push(query);
                    return options.lockedMemories as unknown as never;
                },
                $executeRaw: async () => 0,
                translationMemoryEntry: {
                    createMany: async ({ data }) => {
                        operations.push('entries');
                        stagedWrites.push(
                            ...data.map(value => ({
                                id: value.id,
                                memoryId: value.memoryId,
                                sourceText: value.sourceText,
                                targetText: value.targetText,
                            }))
                        );
                        return { count: options.createCount ?? data.length };
                    },
                },
                translationMemoryImportReceipt: {
                    findFirst: async () =>
                        options.existingReceipt ??
                        (uniqueErrorRaised ? (options.receiptAfterUniqueError ?? null) : null),
                    create: async ({ data }) => {
                        operations.push('receipt');
                        if (options.uniqueErrorOnReceiptCreate && !uniqueErrorRaised) {
                            uniqueErrorRaised = true;
                            throw Object.assign(new Error('receipt already committed'), {
                                code: 'P2002',
                            });
                        }
                        const committed = {
                            ...data,
                            completedAt: new Date('2026-07-26T00:00:00Z'),
                        };
                        stagedReceipts.push(committed);
                        return committed;
                    },
                },
            };

            const result = await callback(transaction);
            writes.push(...stagedWrites);
            committedReceipts.push(...stagedReceipts);
            return result;
        },
    };

    return {
        client,
        queries,
        writes,
        committedReceipts,
        operations,
        get transactions() {
            return transactions;
        },
    };
}

test('memory import rejects an owner mismatch before creating any entry or vector candidate', async () => {
    const fake = createClient({ lockedMemories: [] });

    await assert.rejects(
        createMemoryImportEntriesForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry],
        }),
        new RegExp(MEMORY_IMPORT_OWNER_MISMATCH_ERROR)
    );

    assert.equal(fake.transactions, 1);
    assert.deepEqual(fake.writes, []);
    const query = fake.queries[0] as { strings?: readonly string[] } | undefined;
    const sql = query?.strings?.join('') ?? '';
    assert.match(sql, /FROM "TranslationMemory"/);
    assert.match(sql, /"userId"/);
    assert.match(sql, /FOR UPDATE/);
});

test('memory import writes generated entry IDs only after its owner row is locked in one transaction', async () => {
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }] });

    const created = await createMemoryImportEntriesForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry, { ...entry, sourceText: '第二句', targetText: 'Second sentence' }],
    });

    assert.equal(fake.transactions, 1);
    assert.equal(fake.queries.length, 1);
    assert.equal(created.length, 2);
    assert.deepEqual(
        fake.writes.map(value => value.memoryId),
        ['memory-a', 'memory-a']
    );
    assert.equal(new Set(fake.writes.map(value => value.id)).size, 2);
});

test('oversized imports are rejected before a direct write helper opens a transaction', async () => {
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }] });
    const entries = Array.from({ length: MAX_TRANSLATION_MEMORY_IMPORT_PAIRS + 1 }, () => entry);

    await assert.rejects(
        createMemoryImportEntriesForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries,
        }),
        /拆分文件/
    );

    assert.equal(fake.transactions, 0);
    assert.deepEqual(fake.writes, []);
});

test('matching durable receipt turns a retry into a read without entry or vector writes', async () => {
    const existing: MemoryImportReceipt = {
        ...receipt,
        memoryId: 'memory-a',
        userId: 'user-a',
    };
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }], existingReceipt: existing });
    let vectorsWritten = false;

    const result = await commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry, entry],
        receipt,
        writeVectors: async () => {
            vectorsWritten = true;
        },
    });

    assert.equal(result.status, 'already-committed');
    assert.equal(result.receipt.jobId, receipt.jobId);
    assert.equal(vectorsWritten, false);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.committedReceipts, []);
});

test('a receipt for the same logical input remains reusable if the queue job ID format evolves', async () => {
    const existing: MemoryImportReceipt = {
        ...receipt,
        jobId: 'legacy-memory-import-job-a',
        memoryId: 'memory-a',
        userId: 'user-a',
    };
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }], existingReceipt: existing });

    const result = await commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry, entry],
        receipt,
        writeVectors: async () => assert.fail('already-committed retries must not write vectors'),
    });

    assert.equal(result.status, 'already-committed');
    assert.equal(result.receipt.jobId, existing.jobId);
});

test('a job ID or fingerprint collision never reuses a different receipt', async () => {
    const fake = createClient({
        lockedMemories: [{ id: 'memory-a' }],
        existingReceipt: {
            ...receipt,
            inputFingerprint: 'a'.repeat(64),
            memoryId: 'memory-a',
            userId: 'user-a',
        },
    });

    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry, entry],
            receipt,
            writeVectors: async () => assert.fail('mismatched receipts must not write vectors'),
        }),
        new RegExp(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR)
    );

    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.committedReceipts, []);
});

test('entry rows, vector updates, and the success receipt share one atomic commit boundary', async () => {
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }] });

    const result = await commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry, entry],
        receipt,
        writeVectors: async (_transaction, created) => {
            assert.equal(created.length, 2);
            fake.operations.push('vectors');
        },
    });

    assert.equal(result.status, 'committed');
    assert.equal(fake.transactions, 1);
    assert.deepEqual(fake.operations, ['entries', 'vectors', 'receipt']);
    assert.equal(fake.writes.length, 2);
    assert.equal(fake.committedReceipts.length, 1);
    assert.equal(fake.committedReceipts[0]?.inputFingerprint, receipt.inputFingerprint);
});

test('receipt-backed writes reject an oversized new entry set before rows or vectors are created', async () => {
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }] });
    const entries = Array.from({ length: MAX_TRANSLATION_MEMORY_IMPORT_PAIRS + 1 }, () => entry);
    let vectorsWritten = false;

    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries,
            receipt: {
                ...receipt,
                total: entries.length,
                indexed: entries.length,
            },
            writeVectors: async () => {
                vectorsWritten = true;
            },
        }),
        /拆分文件/
    );

    assert.equal(fake.transactions, 1);
    assert.equal(vectorsWritten, false);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.committedReceipts, []);
});

test('a vector failure leaves neither entries nor a success receipt committed', async () => {
    const fake = createClient({ lockedMemories: [{ id: 'memory-a' }] });

    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry, entry],
            receipt,
            writeVectors: async () => {
                fake.operations.push('vectors');
                throw new Error('vector failed');
            },
        }),
        /vector failed/
    );

    assert.deepEqual(fake.operations, ['entries', 'vectors']);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.committedReceipts, []);
});

test('a unique receipt race re-locks and returns the matching committed receipt', async () => {
    const existing: MemoryImportReceipt = {
        ...receipt,
        memoryId: 'memory-a',
        userId: 'user-a',
    };
    const fake = createClient({
        lockedMemories: [{ id: 'memory-a' }],
        uniqueErrorOnReceiptCreate: true,
        receiptAfterUniqueError: existing,
    });

    const result = await commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry, entry],
        receipt,
        writeVectors: async () => undefined,
    });

    assert.equal(result.status, 'already-committed');
    assert.equal(result.receipt.jobId, receipt.jobId);
    assert.equal(fake.transactions, 2);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.committedReceipts, []);
});
