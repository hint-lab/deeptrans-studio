import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acknowledgeMemoryImportAmbiguityForCurrentOwner,
    commitMemoryImportWithReceiptForCurrentOwner,
    MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE_ERROR,
    MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR,
    MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR,
    MEMORY_IMPORT_RESERVATION_MISSING_ERROR,
    MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR,
    reserveMemoryImportForCurrentOwner,
    resolveMemoryImportAsUnconfirmedForCurrentOwner,
    type MemoryImportAmbiguity,
    type MemoryImportEntryInput,
    type MemoryImportReceipt,
    type MemoryImportReservation,
    type MemoryImportWriteClient,
    type MemoryImportWriteTransaction,
} from './memory-import-owner-lock';

const baseReservation = {
    jobId: 'memory-import-job-a',
    memoryId: 'memory-a',
    userId: 'user-a',
    fileKey: 'users/user-a/uploads/legal.csv',
    inputFingerprint: 'f'.repeat(64),
};

const entry: MemoryImportEntryInput = {
    sourceText: '源文',
    targetText: 'Target',
    notes: null,
    createdById: 'user-a',
    updatedById: 'user-a',
};

function ownsWhere(record: { jobId: string; memoryId: string }, where: Record<string, unknown>) {
    return (
        (!where.jobId || where.jobId === record.jobId) &&
        (!where.memoryId || where.memoryId === record.memoryId)
    );
}

function createClient(options?: {
    reservation?: MemoryImportReservation | null;
    ambiguity?: MemoryImportAmbiguity | null;
    receipt?: MemoryImportReceipt | null;
}) {
    let reservation = options?.reservation ?? null;
    let ambiguity = options?.ambiguity ?? null;
    let receipt = options?.receipt ?? null;
    const writes: unknown[] = [];

    const client: MemoryImportWriteClient = {
        $transaction: async callback => {
            const transaction: MemoryImportWriteTransaction = {
                $queryRaw: async () => [{ id: 'memory-a' }] as never,
                $executeRaw: async () => 0,
                translationMemoryEntry: {
                    createMany: async ({ data }) => {
                        writes.push(...data);
                        return { count: data.length };
                    },
                },
                translationMemoryImportReceipt: {
                    findFirst: async ({ where }) => {
                        if (!receipt) return null;
                        return where.OR.some(condition => {
                            if ('jobId' in condition) return condition.jobId === receipt?.jobId;
                            return (
                                condition.userId === receipt?.userId &&
                                condition.memoryId === receipt?.memoryId &&
                                condition.inputFingerprint === receipt?.inputFingerprint
                            );
                        })
                            ? receipt
                            : null;
                    },
                    create: async ({ data }) => {
                        receipt = { ...data };
                        return receipt;
                    },
                },
                translationMemoryImportAmbiguity: {
                    findFirst: async ({ where }) => {
                        if (!ambiguity || !ownsWhere(ambiguity, where)) return null;
                        if (where.acknowledgedAt === null && ambiguity.acknowledgedAt) return null;
                        return ambiguity;
                    },
                    upsert: async ({ create }) => {
                        if (!ambiguity) ambiguity = { ...create };
                        return ambiguity;
                    },
                    updateMany: async ({ where, data }) => {
                        if (
                            ambiguity &&
                            ownsWhere(ambiguity, where) &&
                            where.acknowledgedAt === null &&
                            !ambiguity.acknowledgedAt
                        ) {
                            ambiguity = { ...ambiguity, acknowledgedAt: data.acknowledgedAt };
                            return { count: 1 };
                        }
                        return { count: 0 };
                    },
                    deleteMany: async ({ where }) => {
                        if (ambiguity && ownsWhere(ambiguity, where)) {
                            ambiguity = null;
                            return { count: 1 };
                        }
                        return { count: 0 };
                    },
                },
                translationMemoryImportReservation: {
                    findFirst: async ({ where }) =>
                        reservation && ownsWhere(reservation, where) ? reservation : null,
                    create: async ({ data }) => {
                        reservation = { ...data };
                        return reservation;
                    },
                    deleteMany: async ({ where }) => {
                        if (reservation && ownsWhere(reservation, where)) {
                            reservation = null;
                            return { count: 1 };
                        }
                        return { count: 0 };
                    },
                },
            };
            return callback(transaction);
        },
    };

    return {
        client,
        writes,
        get reservation() {
            return reservation;
        },
        get ambiguity() {
            return ambiguity;
        },
    };
}

test('a durable reservation serializes imports for one memory and rejects a different attempt', async () => {
    const fake = createClient();
    const created = await reserveMemoryImportForCurrentOwner(fake.client, baseReservation);
    assert.equal(created.status, 'reserved');
    assert.equal(fake.reservation?.jobId, baseReservation.jobId);

    await assert.rejects(
        reserveMemoryImportForCurrentOwner(fake.client, {
            ...baseReservation,
            jobId: 'memory-import-job-b',
            fileKey: 'users/user-a/uploads/other.csv',
            inputFingerprint: 'b'.repeat(64),
        }),
        new RegExp(MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR)
    );
});

test('an unresolved ambiguity gate blocks both reservation and final write under the parent lock', async () => {
    const fake = createClient({
        ambiguity: {
            jobId: 'legacy-job',
            memoryId: 'memory-a',
            userId: 'former-user',
            acknowledgedAt: null,
        },
    });

    await assert.rejects(
        reserveMemoryImportForCurrentOwner(fake.client, baseReservation),
        new RegExp(MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR)
    );
    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry],
            receipt: { ...baseReservation, total: 1, indexed: 1 },
            requireReservation: true,
            writeVectors: async () => assert.fail('gate must be checked before vectors'),
        }),
        new RegExp(MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR)
    );
    assert.deepEqual(fake.writes, []);
});

test('new-protocol final writes require and atomically release their matching reservation', async () => {
    const missing = createClient();
    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(missing.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry],
            receipt: { ...baseReservation, total: 1, indexed: 1 },
            requireReservation: true,
            writeVectors: async () => undefined,
        }),
        new RegExp(MEMORY_IMPORT_RESERVATION_MISSING_ERROR)
    );
    assert.deepEqual(missing.writes, []);

    const fake = createClient({ reservation: baseReservation });
    const result = await commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
        memoryId: 'memory-a',
        userId: 'user-a',
        entries: [entry],
        receipt: { ...baseReservation, total: 1, indexed: 1 },
        requireReservation: true,
        writeVectors: async () => undefined,
    });
    assert.equal(result.status, 'committed');
    assert.equal(fake.reservation, null);
    assert.equal(fake.writes.length, 1);
});

test('a known vanished reservation becomes a memory-scoped gate for the current owner', async () => {
    const fake = createClient({
        reservation: { ...baseReservation, userId: 'former-user' },
    });
    const resolved = await resolveMemoryImportAsUnconfirmedForCurrentOwner(fake.client, {
        jobId: baseReservation.jobId,
        memoryId: 'memory-a',
        userId: 'current-owner',
    });

    assert.equal(resolved.status, 'ambiguity');
    assert.equal(fake.reservation, null);
    assert.equal(fake.ambiguity?.memoryId, 'memory-a');
    assert.equal(fake.ambiguity?.userId, 'current-owner');
});

test('an acknowledged legacy gate releases the memory but permanently rejects a manual retry', async () => {
    const fake = createClient({
        ambiguity: {
            jobId: baseReservation.jobId,
            memoryId: 'memory-a',
            userId: 'user-a',
            acknowledgedAt: null,
        },
    });
    const acknowledged = await acknowledgeMemoryImportAmbiguityForCurrentOwner(fake.client, {
        jobId: baseReservation.jobId,
        memoryId: 'memory-a',
        userId: 'user-a',
    });
    assert.equal(acknowledged.status, 'acknowledged');
    assert.ok(fake.ambiguity?.acknowledgedAt);

    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry],
            receipt: { ...baseReservation, total: 1, indexed: 1 },
            writeVectors: async () => assert.fail('an acknowledged retry must not write vectors'),
        }),
        new RegExp(MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE_ERROR)
    );
    assert.deepEqual(fake.writes, []);
});

test('a legacy job ID tombstone cannot be recycled onto a different memory', async () => {
    const fake = createClient({
        ambiguity: {
            jobId: baseReservation.jobId,
            memoryId: 'memory-b',
            userId: 'former-user',
            acknowledgedAt: new Date(),
        },
    });

    await assert.rejects(
        commitMemoryImportWithReceiptForCurrentOwner(fake.client, {
            memoryId: 'memory-a',
            userId: 'user-a',
            entries: [entry],
            receipt: { ...baseReservation, total: 1, indexed: 1 },
            writeVectors: async () => assert.fail('a recycled legacy job ID must not write vectors'),
        }),
        new RegExp(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR)
    );
    assert.deepEqual(fake.writes, []);
});
