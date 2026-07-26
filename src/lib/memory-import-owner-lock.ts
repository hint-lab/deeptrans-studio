import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
    isTranslationMemoryImportPairCountAllowed,
    translationMemoryImportPairLimitMessage,
} from './memory-import-validation';

/**
 * The initial import authorization happens before the potentially long
 * embedding phase. This second, locked check is the write boundary: it makes
 * sure an ownership transfer or deletion that happened while embeddings were
 * being generated cannot receive any newly imported rows.
 */
export const MEMORY_IMPORT_OWNER_MISMATCH_ERROR = 'UNAUTHORIZED_MEMORY_AT_WRITE';
export const MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR =
    'MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH';
export const MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR = 'MEMORY_IMPORT_UNCONFIRMED_GATE';
export const MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR = 'MEMORY_IMPORT_RESERVATION_CONFLICT';
export const MEMORY_IMPORT_RESERVATION_MISMATCH_ERROR = 'MEMORY_IMPORT_RESERVATION_MISMATCH';
export const MEMORY_IMPORT_RESERVATION_MISSING_ERROR = 'MEMORY_IMPORT_RESERVATION_MISSING';
export const MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE_ERROR =
    'MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE';

export type MemoryImportEntryWriteData = {
    memoryId: string;
    sourceText: string;
    targetText: string;
    notes: string | null;
    sourceLang?: string;
    targetLang?: string;
    createdById: string;
    updatedById: string;
};

/**
 * Callers never choose the entry's memoryId. The locked parent row is the
 * authority for every row in this import, which prevents a future caller from
 * accidentally mixing entries from a different memory into the transaction.
 */
export type MemoryImportEntryInput = Omit<MemoryImportEntryWriteData, 'memoryId'>;

export type MemoryImportCreatedEntry = {
    id: string;
    memoryId: string;
    sourceText: string;
    targetText: string;
};

type MemoryImportEntryCreateData = MemoryImportEntryWriteData & { id: string };

export type MemoryImportReceipt = {
    jobId: string;
    inputFingerprint: string;
    memoryId: string;
    // The original user is provenance, not the ongoing authority. A memory
    // can outlive that account, so receipt rows are retained with userId null
    // after an ownership cleanup migration.
    userId: string | null;
    fileKey: string;
    total: number;
    indexed: number;
    completedAt?: Date;
};

export type MemoryImportReceiptInput = {
    jobId: string;
    inputFingerprint: string;
    fileKey: string;
    total: number;
    indexed: number;
};

export type MemoryImportReservation = {
    jobId: string;
    memoryId: string;
    userId: string | null;
    fileKey: string;
    inputFingerprint: string;
    createdAt?: Date;
};

export type MemoryImportReservationInput = {
    jobId: string;
    memoryId: string;
    userId: string;
    fileKey: string;
    inputFingerprint: string;
};

export type MemoryImportAmbiguity = {
    jobId: string;
    memoryId: string;
    userId: string | null;
    detectedAt?: Date;
    acknowledgedAt?: Date | null;
};

type MemoryImportReceiptWhere = {
    OR: Array<
        | { jobId: string }
        | {
              userId: string;
              memoryId: string;
              inputFingerprint: string;
          }
    >;
};

export type MemoryImportWriteTransaction = {
    $queryRaw<T>(query: Prisma.Sql): Promise<T>;
    $executeRaw(query: Prisma.Sql): Promise<unknown>;
    translationMemoryEntry: {
        createMany(input: { data: MemoryImportEntryCreateData[] }): Promise<{ count: number }>;
    };
    translationMemoryImportReceipt: {
        findFirst(input: { where: MemoryImportReceiptWhere }): Promise<MemoryImportReceipt | null>;
        create(input: { data: MemoryImportReceipt }): Promise<MemoryImportReceipt>;
    };
    // Optional only so focused unit tests can keep a small fake transaction.
    // Every generated Prisma transaction has both delegates after the paired
    // migrations; the reservation/gate helpers below fail closed if called
    // against an incomplete client.
    translationMemoryImportAmbiguity?: {
        findFirst(input: { where: Record<string, unknown> }): Promise<MemoryImportAmbiguity | null>;
        upsert(input: {
            where: { jobId: string };
            create: MemoryImportAmbiguity;
            update: Record<string, never>;
        }): Promise<MemoryImportAmbiguity>;
        updateMany?: (input: {
            where: Record<string, unknown>;
            data: { acknowledgedAt: Date };
        }) => Promise<{ count: number }>;
        deleteMany(input: { where: Record<string, unknown> }): Promise<{ count: number }>;
    };
    translationMemoryImportReservation?: {
        findFirst(input: { where: Record<string, unknown> }): Promise<MemoryImportReservation | null>;
        create(input: { data: MemoryImportReservation }): Promise<MemoryImportReservation>;
        deleteMany(input: { where: Record<string, unknown> }): Promise<{ count: number }>;
    };
};

export type MemoryImportWriteClient = {
    $transaction<T>(
        callback: (transaction: MemoryImportWriteTransaction) => Promise<T>,
        options?: { maxWait?: number; timeout?: number }
    ): Promise<T>;
};

const MEMORY_IMPORT_TRANSACTION_OPTIONS = {
    // A 500-row import updates vectors in ten bounded batches. Keep the
    // model call outside this transaction, but give the final atomic commit
    // enough time for pgvector/HNSW work under ordinary local load.
    maxWait: 5_000,
    timeout: 60_000,
} as const;

function requiredString(value: unknown, name: string) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`MISSING_MEMORY_IMPORT_${name}`);
    return normalized;
}

function validCount(value: number, name: string) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`INVALID_MEMORY_IMPORT_RECEIPT_${name}`);
    }
    return value;
}

function assertMemoryImportEntryCount(entries: readonly MemoryImportEntryInput[]) {
    if (!isTranslationMemoryImportPairCountAllowed(entries.length)) {
        throw new Error(translationMemoryImportPairLimitMessage(entries.length));
    }
}

function normalizeReceiptInput(input: MemoryImportReceiptInput) {
    const total = validCount(input.total, 'TOTAL');
    const indexed = validCount(input.indexed, 'INDEXED');
    if (indexed > total) throw new Error('INVALID_MEMORY_IMPORT_RECEIPT_INDEXED_RANGE');
    return {
        jobId: requiredString(input.jobId, 'JOB_ID'),
        inputFingerprint: requiredString(input.inputFingerprint, 'INPUT_FINGERPRINT'),
        fileKey: requiredString(input.fileKey, 'FILE'),
        total,
        indexed,
    };
}

function normalizeReservationInput(input: MemoryImportReservationInput) {
    return {
        jobId: requiredString(input.jobId, 'JOB_ID'),
        memoryId: requiredString(input.memoryId, 'MEMORY'),
        userId: requiredString(input.userId, 'USER'),
        fileKey: requiredString(input.fileKey, 'FILE'),
        inputFingerprint: requiredString(input.inputFingerprint, 'INPUT_FINGERPRINT'),
    };
}

export type MemoryImportReceiptIdentity = Pick<
    MemoryImportReceipt,
    'memoryId' | 'userId' | 'fileKey' | 'inputFingerprint'
>;

export function isSameMemoryImportReceiptIdentity(
    receipt: MemoryImportReceipt,
    identity: MemoryImportReceiptIdentity
) {
    return (
        receipt.userId === identity.userId &&
        receipt.memoryId === identity.memoryId &&
        receipt.fileKey === identity.fileKey &&
        receipt.inputFingerprint === identity.inputFingerprint
    );
}

export function isSameMemoryImportReservationIdentity(
    reservation: MemoryImportReservation,
    identity: MemoryImportReservationInput
) {
    return (
        reservation.jobId === identity.jobId &&
        reservation.memoryId === identity.memoryId &&
        reservation.userId === identity.userId &&
        reservation.fileKey === identity.fileKey &&
        reservation.inputFingerprint === identity.inputFingerprint
    );
}

function hasSameMemoryImportReservationPayload(
    reservation: MemoryImportReservation,
    identity: Pick<
        MemoryImportReservationInput,
        'jobId' | 'memoryId' | 'fileKey' | 'inputFingerprint'
    >
) {
    return (
        reservation.jobId === identity.jobId &&
        reservation.memoryId === identity.memoryId &&
        reservation.fileKey === identity.fileKey &&
        reservation.inputFingerprint === identity.inputFingerprint
    );
}

function receiptMatches(
    receipt: MemoryImportReceipt,
    input: {
        memoryId: string;
        userId: string;
        receipt: ReturnType<typeof normalizeReceiptInput>;
    }
) {
    return (
        isSameMemoryImportReceiptIdentity(receipt, {
            userId: input.userId,
            memoryId: input.memoryId,
            fileKey: input.receipt.fileKey,
            inputFingerprint: input.receipt.inputFingerprint,
        }) &&
        receipt.total === input.receipt.total &&
        receipt.indexed === input.receipt.indexed
    );
}

function entryRowsForLockedMemory(memoryId: string, entries: MemoryImportEntryInput[]) {
    return entries.map(entry => ({
        ...entry,
        id: randomUUID(),
        memoryId,
    }));
}

function isUniqueConstraintError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: unknown }).code;
    return code === 'P2002';
}

async function createEntriesForLockedMemory(
    transaction: MemoryImportWriteTransaction,
    memoryId: string,
    entries: MemoryImportEntryInput[]
): Promise<MemoryImportCreatedEntry[]> {
    const rows = entryRowsForLockedMemory(memoryId, entries);
    if (!rows.length) return [];

    const result = await transaction.translationMemoryEntry.createMany({ data: rows });
    if (result.count !== rows.length) {
        throw new Error(`MEMORY_IMPORT_ENTRY_WRITE_COUNT_MISMATCH:${result.count}/${rows.length}`);
    }

    return rows.map(({ id, sourceText, targetText }) => ({
        id,
        memoryId,
        sourceText,
        targetText,
    }));
}

async function findReceiptByJobOrLogicalIdentityValues(
    transaction: MemoryImportWriteTransaction,
    input: {
        memoryId: string;
        userId: string;
        jobId: string;
        inputFingerprint: string;
    }
) {
    const byJobId = await transaction.translationMemoryImportReceipt.findFirst({
        where: { OR: [{ jobId: input.jobId }] },
    });
    if (byJobId) return byJobId;
    return transaction.translationMemoryImportReceipt.findFirst({
        where: {
            OR: [
                {
                    userId: input.userId,
                    memoryId: input.memoryId,
                    inputFingerprint: input.inputFingerprint,
                },
            ],
        },
    });
}

async function findReceiptByJobOrLogicalIdentity(
    transaction: MemoryImportWriteTransaction,
    input: {
        memoryId: string;
        userId: string;
        receipt: ReturnType<typeof normalizeReceiptInput>;
    }
) {
    return findReceiptByJobOrLogicalIdentityValues(transaction, {
        memoryId: input.memoryId,
        userId: input.userId,
        jobId: input.receipt.jobId,
        inputFingerprint: input.receipt.inputFingerprint,
    });
}

function ambiguityDelegate(transaction: MemoryImportWriteTransaction) {
    const delegate = transaction.translationMemoryImportAmbiguity;
    if (!delegate) throw new Error('MEMORY_IMPORT_AMBIGUITY_STORE_UNAVAILABLE');
    return delegate;
}

function reservationDelegate(transaction: MemoryImportWriteTransaction) {
    const delegate = transaction.translationMemoryImportReservation;
    if (!delegate) throw new Error('MEMORY_IMPORT_RESERVATION_STORE_UNAVAILABLE');
    return delegate;
}

async function findOpenMemoryImportAmbiguity(
    transaction: MemoryImportWriteTransaction,
    memoryId: string
) {
    // The optional branch keeps existing focused receipt tests minimal. In a
    // deployed client this delegate is generated from the migration and is
    // always present; reserve/resolve explicitly fail closed if it is not.
    if (!transaction.translationMemoryImportAmbiguity) return null;
    return transaction.translationMemoryImportAmbiguity.findFirst({
        where: { memoryId, acknowledgedAt: null },
    });
}

async function findMemoryImportAmbiguityByJob(
    transaction: MemoryImportWriteTransaction,
    input: { jobId: string }
) {
    if (!transaction.translationMemoryImportAmbiguity) return null;
    return transaction.translationMemoryImportAmbiguity.findFirst({
        // jobId is the model primary key. Never scope this lookup to the
        // requested memory: a recycled legacy numeric job ID must fail closed
        // rather than bypass a tombstone created for a different memory.
        where: { jobId: input.jobId },
    });
}

async function findMemoryImportReservation(
    transaction: MemoryImportWriteTransaction,
    memoryId: string
) {
    if (!transaction.translationMemoryImportReservation) return null;
    return transaction.translationMemoryImportReservation.findFirst({ where: { memoryId } });
}

async function deleteMatchingReservation(
    transaction: MemoryImportWriteTransaction,
    input: Pick<MemoryImportReservationInput, 'jobId' | 'memoryId'>
) {
    if (!transaction.translationMemoryImportReservation) return { count: 0 };
    return transaction.translationMemoryImportReservation.deleteMany({
        where: { jobId: input.jobId, memoryId: input.memoryId },
    });
}

async function withLockedMemoryForCurrentOwner<T>(
    client: MemoryImportWriteClient,
    input: { memoryId: string; userId: string },
    callback: (transaction: MemoryImportWriteTransaction) => Promise<T>
): Promise<T> {
    const memoryId = requiredString(input.memoryId, 'MEMORY');
    const userId = requiredString(input.userId, 'USER');

    return client.$transaction(async transaction => {
        const lockedMemories = await transaction.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
                SELECT id
                FROM "TranslationMemory"
                WHERE id = ${memoryId}
                  AND "userId" = ${userId}
                FOR UPDATE
            `
        );

        if (lockedMemories.length !== 1) {
            throw new Error(MEMORY_IMPORT_OWNER_MISMATCH_ERROR);
        }

        return callback(transaction);
    }, MEMORY_IMPORT_TRANSACTION_OPTIONS);
}

export type MemoryImportReservationResult =
    | { status: 'reserved'; reservation: MemoryImportReservation }
    | { status: 'existing-reservation'; reservation: MemoryImportReservation }
    | { status: 'already-committed'; receipt: MemoryImportReceipt };

/**
 * Create the durable, one-per-memory reservation before a queue job is
 * accepted.  It is intentionally protected by the same parent-row lock as
 * the final write so a gate, ownership change, or second browser cannot slip
 * between the preflight and the transaction boundary.
 */
export async function reserveMemoryImportForCurrentOwner(
    client: MemoryImportWriteClient,
    input: MemoryImportReservationInput
): Promise<MemoryImportReservationResult> {
    const reservation = normalizeReservationInput(input);

    return withLockedMemoryForCurrentOwner(client, reservation, async transaction => {
        const existingReceipt = await findReceiptByJobOrLogicalIdentityValues(transaction, reservation);
        if (existingReceipt) {
            if (
                !isSameMemoryImportReceiptIdentity(existingReceipt, {
                    memoryId: reservation.memoryId,
                    userId: reservation.userId,
                    fileKey: reservation.fileKey,
                    inputFingerprint: reservation.inputFingerprint,
                })
            ) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            return { status: 'already-committed', receipt: existingReceipt };
        }

        const openGate = await findOpenMemoryImportAmbiguity(transaction, reservation.memoryId);
        if (openGate) throw new Error(MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR);

        const existingReservation = await findMemoryImportReservation(transaction, reservation.memoryId);
        if (existingReservation) {
            if (!isSameMemoryImportReservationIdentity(existingReservation, reservation)) {
                throw new Error(MEMORY_IMPORT_RESERVATION_CONFLICT_ERROR);
            }
            return { status: 'existing-reservation', reservation: existingReservation };
        }

        const created = await reservationDelegate(transaction).create({ data: reservation });
        return { status: 'reserved', reservation: created };
    });
}

export type MemoryImportUnconfirmedResolution =
    | { status: 'receipt'; receipt: MemoryImportReceipt }
    | { status: 'ambiguity'; ambiguity: MemoryImportAmbiguity };

/**
 * Turn a *known* terminal legacy attempt (or a persisted reservation whose
 * queue job disappeared) into a durable stop gate.  Callers must establish
 * that evidence before calling this helper; unknown browser job IDs must
 * return 404 rather than create a database record.
 */
export async function resolveMemoryImportAsUnconfirmedForCurrentOwner(
    client: MemoryImportWriteClient,
    input: { jobId: string; memoryId: string; userId: string }
): Promise<MemoryImportUnconfirmedResolution> {
    const jobId = requiredString(input.jobId, 'JOB_ID');
    const memoryId = requiredString(input.memoryId, 'MEMORY');
    const userId = requiredString(input.userId, 'USER');

    return withLockedMemoryForCurrentOwner(client, { memoryId, userId }, async transaction => {
        const receipt = await transaction.translationMemoryImportReceipt.findFirst({
            where: { OR: [{ jobId }] },
        });
        if (receipt) {
            if (receipt.memoryId !== memoryId) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            await deleteMatchingReservation(transaction, { jobId, memoryId });
            return { status: 'receipt', receipt };
        }

        const ambiguities = ambiguityDelegate(transaction);
        const byJobId = await ambiguities.findFirst({ where: { jobId } });
        if (byJobId) {
            if (byJobId.memoryId !== memoryId) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            await deleteMatchingReservation(transaction, { jobId, memoryId });
            return { status: 'ambiguity', ambiguity: byJobId };
        }

        // A memory has one unresolved outcome at a time.  Do not create a
        // stack of gates or allow a newer request to replace the original
        // outcome the owner still needs to review.
        const openGate = await findOpenMemoryImportAmbiguity(transaction, memoryId);
        if (openGate) {
            await deleteMatchingReservation(transaction, { jobId, memoryId });
            return { status: 'ambiguity', ambiguity: openGate };
        }

        const ambiguity = await ambiguities.upsert({
            where: { jobId },
            create: { jobId, memoryId, userId },
            update: {},
        });
        if (ambiguity.memoryId !== memoryId) {
            throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
        }
        await deleteMatchingReservation(transaction, { jobId, memoryId });
        return { status: 'ambiguity', ambiguity };
    });
}

export type MemoryImportAcknowledgementResult =
    | { status: 'receipt'; receipt: MemoryImportReceipt }
    | { status: 'acknowledged'; ambiguity: MemoryImportAmbiguity }
    | { status: 'not-found' };

/**
 * Acknowledge a legacy ambiguity while holding the same parent-memory lock
 * used by the final worker commit. The acknowledgement becomes a tombstone:
 * it permits a fresh upload, but it permanently rejects a manual retry of the
 * old queue job before that job can write any rows again.
 */
export async function acknowledgeMemoryImportAmbiguityForCurrentOwner(
    client: MemoryImportWriteClient,
    input: { jobId: string; memoryId: string; userId: string }
): Promise<MemoryImportAcknowledgementResult> {
    const jobId = requiredString(input.jobId, 'JOB_ID');
    const memoryId = requiredString(input.memoryId, 'MEMORY');
    const userId = requiredString(input.userId, 'USER');

    return withLockedMemoryForCurrentOwner(client, { memoryId, userId }, async transaction => {
        const receipt = await transaction.translationMemoryImportReceipt.findFirst({
            where: { OR: [{ jobId }] },
        });
        if (receipt) {
            if (receipt.memoryId !== memoryId) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            await transaction.translationMemoryImportAmbiguity?.deleteMany({
                where: { jobId, memoryId },
            });
            await deleteMatchingReservation(transaction, { jobId, memoryId });
            return { status: 'receipt', receipt };
        }

        const ambiguities = ambiguityDelegate(transaction);
        const ambiguity = await findMemoryImportAmbiguityByJob(transaction, { jobId });
        if (!ambiguity) return { status: 'not-found' };
        if (ambiguity.memoryId !== memoryId) {
            throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
        }
        if (ambiguity.acknowledgedAt) return { status: 'acknowledged', ambiguity };

        if (!ambiguities.updateMany) {
            throw new Error('MEMORY_IMPORT_AMBIGUITY_STORE_UNAVAILABLE');
        }
        const acknowledgedAt = new Date();
        const update = await ambiguities.updateMany({
            where: { jobId, memoryId, acknowledgedAt: null },
            data: { acknowledgedAt },
        });
        if (update.count === 1) {
            return {
                status: 'acknowledged',
                ambiguity: { ...ambiguity, acknowledgedAt },
            };
        }

        const current = await findMemoryImportAmbiguityByJob(transaction, { jobId });
        if (current && current.memoryId !== memoryId) {
            throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
        }
        if (current?.acknowledgedAt) return { status: 'acknowledged', ambiguity: current };
        return { status: 'not-found' };
    });
}

/**
 * New receipt-protocol jobs may fail before the final transaction.  Their
 * reservation can then be released safely because the worker has no
 * non-atomic write path.  The identity check prevents a stale status request
 * from deleting a newer reservation for the same memory.
 */
export async function releaseMemoryImportReservationForCurrentOwner(
    client: MemoryImportWriteClient,
    input: MemoryImportReservationInput
) {
    const reservation = normalizeReservationInput(input);
    return withLockedMemoryForCurrentOwner(client, reservation, async transaction => {
        const existing = await findMemoryImportReservation(transaction, reservation.memoryId);
        if (!existing) return { released: false };
        // `userId` is historical provenance and may change to null after its
        // original account is removed. Current ownership was just checked by
        // the parent-row lock, so match the immutable attempt payload here.
        if (!hasSameMemoryImportReservationPayload(existing, reservation)) {
            throw new Error(MEMORY_IMPORT_RESERVATION_MISMATCH_ERROR);
        }
        const removed = await deleteMatchingReservation(transaction, reservation);
        return { released: removed.count === 1 };
    });
}

/**
 * Re-check ownership while holding the parent-memory row lock, then create
 * every entry through that same transaction. `FOR UPDATE` blocks an owner
 * mutation or deletion until the complete row set is committed or rolled
 * back, so no import rows can be written after ownership has changed.
 */
export async function createMemoryImportEntriesForCurrentOwner(
    client: MemoryImportWriteClient,
    input: {
        memoryId: string;
        userId: string;
        entries: MemoryImportEntryInput[];
    }
): Promise<MemoryImportCreatedEntry[]> {
    // This direct-write helper is retained for safe stale-action responses.
    // Enforce the same bound before opening a transaction so a future caller
    // cannot bypass the Worker-side pre-embedding limit.
    assertMemoryImportEntryCount(input.entries);
    return withLockedMemoryForCurrentOwner(client, input, transaction =>
        createEntriesForLockedMemory(transaction, input.memoryId, input.entries)
    );
}

/**
 * Atomically creates import rows, applies their vector updates, and writes a
 * durable success receipt. A BullMQ retry that starts after this transaction
 * committed can safely return the receipt instead of importing the same file
 * again; any error before the receipt is written rolls all three writes back.
 */
export async function commitMemoryImportWithReceiptForCurrentOwner(
    client: MemoryImportWriteClient,
    input: {
        memoryId: string;
        userId: string;
        entries: MemoryImportEntryInput[];
        receipt: MemoryImportReceiptInput;
        /**
         * Required for jobs created by the durable reservation protocol.
         * Legacy workers can still drain without this marker, but they are
         * blocked by any reservation for a different import and by every
         * unresolved ambiguity gate.
         */
        requireReservation?: boolean;
        writeVectors: (
            transaction: MemoryImportWriteTransaction,
            entries: MemoryImportCreatedEntry[]
        ) => Promise<void>;
    }
): Promise<
    | { status: 'committed'; entries: MemoryImportCreatedEntry[]; receipt: MemoryImportReceipt }
    | { status: 'already-committed'; entries: []; receipt: MemoryImportReceipt }
> {
    const receipt = normalizeReceiptInput(input.receipt);
    const commit = () =>
        withLockedMemoryForCurrentOwner(client, input, async transaction => {
            const existing = await findReceiptByJobOrLogicalIdentity(transaction, {
                memoryId: input.memoryId,
                userId: input.userId,
                receipt,
            });
            if (existing) {
                if (
                    !receiptMatches(existing, {
                        memoryId: input.memoryId,
                        userId: input.userId,
                        receipt,
                    })
                ) {
                    throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
                }
                await deleteMatchingReservation(transaction, {
                    jobId: receipt.jobId,
                    memoryId: input.memoryId,
                });
                return {
                    status: 'already-committed' as const,
                    entries: [] as [],
                    receipt: existing,
                };
            }

            // An explicit acknowledgement releases the *memory* for a fresh
            // upload, not the old queue job for a manual retry. Keep the
            // tombstone check inside this write transaction so an old worker
            // cannot race an acknowledgement and write a second copy.
            const jobTombstone = await findMemoryImportAmbiguityByJob(transaction, {
                jobId: receipt.jobId,
            });
            if (jobTombstone && jobTombstone.memoryId !== input.memoryId) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            if (jobTombstone?.acknowledgedAt) {
                throw new Error(MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE_ERROR);
            }

            // The receipt is the only positive completion proof. An open
            // legacy gate wins over both a late worker and a fresh browser
            // submission, and this check shares the exact parent-row lock
            // with the write below to close the old TOCTOU window.
            const openGate = await findOpenMemoryImportAmbiguity(transaction, input.memoryId);
            if (openGate) throw new Error(MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR);

            const reservation = await findMemoryImportReservation(transaction, input.memoryId);
            const reservationIdentity: MemoryImportReservationInput = {
                jobId: receipt.jobId,
                memoryId: input.memoryId,
                userId: input.userId,
                fileKey: receipt.fileKey,
                inputFingerprint: receipt.inputFingerprint,
            };
            if (input.requireReservation && !reservation) {
                throw new Error(MEMORY_IMPORT_RESERVATION_MISSING_ERROR);
            }
            if (
                reservation &&
                !isSameMemoryImportReservationIdentity(reservation, reservationIdentity)
            ) {
                throw new Error(MEMORY_IMPORT_RESERVATION_MISMATCH_ERROR);
            }

            // A matching receipt above is still recoverable even if it came
            // from an older import. New writes remain bounded here as a
            // second line of defense after the Worker preflight.
            assertMemoryImportEntryCount(input.entries);
            const created = await createEntriesForLockedMemory(
                transaction,
                input.memoryId,
                input.entries
            );
            await input.writeVectors(transaction, created);
            const committedReceipt = await transaction.translationMemoryImportReceipt.create({
                data: {
                    ...receipt,
                    memoryId: input.memoryId,
                    userId: input.userId,
                },
            });
            if (reservation) {
                const released = await deleteMatchingReservation(transaction, reservationIdentity);
                if (released.count !== 1) {
                    throw new Error(MEMORY_IMPORT_RESERVATION_MISMATCH_ERROR);
                }
            }
            return { status: 'committed' as const, entries: created, receipt: committedReceipt };
        });

    try {
        return await commit();
    } catch (error) {
        // A second worker can lose the unique-key race after another process
        // has committed the same receipt. Re-lock/re-read before deciding
        // whether this is the same logical import or a true identity clash.
        if (!isUniqueConstraintError(error)) throw error;
        return withLockedMemoryForCurrentOwner(client, input, async transaction => {
            const existing = await findReceiptByJobOrLogicalIdentity(transaction, {
                memoryId: input.memoryId,
                userId: input.userId,
                receipt,
            });
            if (!existing) throw error;
            if (
                !receiptMatches(existing, {
                    memoryId: input.memoryId,
                    userId: input.userId,
                    receipt,
                })
            ) {
                throw new Error(MEMORY_IMPORT_RECEIPT_IDENTITY_MISMATCH_ERROR);
            }
            return { status: 'already-committed' as const, entries: [] as [], receipt: existing };
        });
    }
}
