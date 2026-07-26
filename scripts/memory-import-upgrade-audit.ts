import { Prisma, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { usesMemoryImportReceiptProtocol } from '../src/lib/memory-import-job';
import { resolveQueueRedisUrl } from '../src/worker/queue';

const PAGE_SIZE = 200;
const LEGACY_HISTORY_PROOF = 'queue-snapshot-and-pruned-history-reviewed';
const LEGACY_SNAPSHOT_REFERENCE_PREFIX = '--legacy-queue-snapshot=';
const LEGACY_SNAPSHOT_SHA256_PREFIX = '--legacy-queue-snapshot-sha256=';
const queueStates = [
    'active',
    'waiting',
    'waiting-children',
    'delayed',
    'prioritized',
    'paused',
    'completed',
    'failed',
] as const;

type LegacyQueueJob = {
    jobId: string;
    state: string;
    memoryId: string;
};

type AuditCounters = {
    receiptProtocolJobs: number;
    legacyJobs: number;
    receiptBackedLegacyJobs: number;
    unresolvedLegacyJobs: number;
    gatesCreated: number;
    existingGates: number;
    acknowledgedTombstones: number;
    missingMemories: number;
    malformedJobs: number;
    receiptMemoryMismatches: number;
};

const counters: AuditCounters = {
    receiptProtocolJobs: 0,
    legacyJobs: 0,
    receiptBackedLegacyJobs: 0,
    unresolvedLegacyJobs: 0,
    gatesCreated: 0,
    existingGates: 0,
    acknowledgedTombstones: 0,
    missingMemories: 0,
    malformedJobs: 0,
    receiptMemoryMismatches: 0,
};

// This audit touches both Redis and the production database. Requiring an
// explicit live flag makes an accidental local invocation harmless even when
// dotenv/tsx has supplied connection settings from a nearby environment file.
const live = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const historyProof = process.argv.find(argument =>
    argument.startsWith('--legacy-history-proof=')
);
const historyProofValue = historyProof?.slice('--legacy-history-proof='.length) || '';
const legacySnapshotReference =
    process.argv
        .find(argument => argument.startsWith(LEGACY_SNAPSHOT_REFERENCE_PREFIX))
        ?.slice(LEGACY_SNAPSHOT_REFERENCE_PREFIX.length) || '';
const legacySnapshotSha256 =
    process.argv
        .find(argument => argument.startsWith(LEGACY_SNAPSHOT_SHA256_PREFIX))
        ?.slice(LEGACY_SNAPSHOT_SHA256_PREFIX.length) || '';

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function report(message: string) {
    console.log(`${apply ? 'APPLY' : 'CHECK'} ${message}`);
}

function legacySnapshotEvidence() {
    const reference = legacySnapshotReference.trim();
    const sha256 = legacySnapshotSha256.trim().toLowerCase();
    // The reference is retained in deployment output. Do not let an operator
    // accidentally place a signed URL or credentials into that audit log.
    const safeReference =
        reference.length > 0 &&
        reference.length <= 512 &&
        !/[\r\n?@]/.test(reference);
    if (!safeReference || !/^[a-f0-9]{64}$/.test(sha256)) {
        throw new Error(
            '--apply requires --legacy-queue-snapshot=<credential-free-reference> and ' +
                '--legacy-queue-snapshot-sha256=<64-character-sha256> so the reviewed history is recorded in the audit output.'
        );
    }
    return { reference, sha256 };
}

async function listQueueJobs(queue: Queue<Record<string, unknown>>) {
    const jobs = new Map<string, { id?: string | number; data: Record<string, unknown>; state: string }>();
    for (const state of queueStates) {
        let start = 0;
        while (true) {
            const batch = await queue.getJobs([state as never], start, start + PAGE_SIZE - 1);
            for (const job of batch) {
                const jobId = text(job.id);
                if (!jobId) continue;
                jobs.set(jobId, { id: job.id, data: job.data, state });
            }
            if (batch.length < PAGE_SIZE) break;
            start += batch.length;
        }
    }
    return Array.from(jobs.values());
}

async function materializeLegacyGate(prisma: PrismaClient, job: LegacyQueueJob) {
    return prisma.$transaction(async transaction => {
        const memories = await transaction.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
                SELECT id
                FROM "TranslationMemory"
                WHERE id = ${job.memoryId}
                FOR UPDATE
            `
        );
        if (memories.length !== 1) return 'missing-memory' as const;

        const receipt = await transaction.translationMemoryImportReceipt.findFirst({
            where: { jobId: job.jobId },
            select: { memoryId: true },
        });
        if (receipt) {
            return receipt.memoryId === job.memoryId
                ? ('receipt' as const)
                : ('receipt-memory-mismatch' as const);
        }

        const existing = await transaction.translationMemoryImportAmbiguity.findFirst({
            where: { jobId: job.jobId },
            select: { memoryId: true, acknowledgedAt: true },
        });
        if (existing) {
            if (existing.memoryId !== job.memoryId) return 'ambiguity-memory-mismatch' as const;
            return existing.acknowledgedAt ? ('acknowledged' as const) : ('existing-gate' as const);
        }

        if (!apply) return 'needs-gate' as const;
        // Historical task ownership is not required for the durable gate and
        // may point to an account deleted since the old queue job was created.
        // The current TranslationMemory owner resolves the resulting gate.
        await transaction.translationMemoryImportAmbiguity.create({
            data: { jobId: job.jobId, memoryId: job.memoryId, userId: null },
        });
        return 'created-gate' as const;
    });
}

async function main() {
    if (!live) {
        console.error(
            'Refusing to connect to Redis or the database. Re-run with --live only in the stopped deployment window after preserving the required queue snapshot.'
        );
        process.exitCode = 2;
        return;
    }
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
    const snapshotEvidence = apply ? legacySnapshotEvidence() : null;
    if (apply && historyProofValue !== LEGACY_HISTORY_PROOF) {
        throw new Error(
            `--apply requires --legacy-history-proof=${LEGACY_HISTORY_PROOF}; ` +
                'only provide it after preserving a Redis/BullMQ snapshot and reviewing pruned legacy history.'
        );
    }

    const prisma = new PrismaClient();
    let connection: IORedis | null = null;
    let queue: Queue<Record<string, unknown>> | null = null;

    try {
        connection = new IORedis(resolveQueueRedisUrl(), {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
        queue = new Queue<Record<string, unknown>>('memory-import', { connection });
        if (snapshotEvidence) {
            report(
                `reviewed legacy queue snapshot: ${snapshotEvidence.reference} (sha256:${snapshotEvidence.sha256})`
            );
        }
        const queueJobs = await listQueueJobs(queue);
        const legacyJobs: LegacyQueueJob[] = [];
        for (const job of queueJobs) {
            if (usesMemoryImportReceiptProtocol(job.data)) {
                counters.receiptProtocolJobs += 1;
                continue;
            }
            counters.legacyJobs += 1;
            const jobId = text(job.id);
            const memoryId = text(job.data?.memoryId);
            if (!jobId || !memoryId) {
                counters.malformedJobs += 1;
                report(`legacy job ${jobId || '<missing-id>'} has no target memory`);
                continue;
            }
            legacyJobs.push({ jobId, memoryId, state: job.state });
        }

        for (const job of legacyJobs) {
            const result = await materializeLegacyGate(prisma, job);
            if (result === 'receipt') counters.receiptBackedLegacyJobs += 1;
            else if (result === 'created-gate') {
                counters.gatesCreated += 1;
                report(`legacy ${job.state} job ${job.jobId} -> durable gate for ${job.memoryId}`);
            } else if (result === 'existing-gate') counters.existingGates += 1;
            else if (result === 'acknowledged') counters.acknowledgedTombstones += 1;
            else if (result === 'needs-gate') {
                counters.unresolvedLegacyJobs += 1;
                report(`legacy ${job.state} job ${job.jobId} needs a durable gate for ${job.memoryId}`);
            } else {
                if (result === 'missing-memory') counters.missingMemories += 1;
                else counters.receiptMemoryMismatches += 1;
                report(`legacy job ${job.jobId} cannot be reconciled: ${result}`);
            }
        }

        console.log(
            JSON.stringify(
                snapshotEvidence ? { ...counters, legacySnapshotEvidence: snapshotEvidence } : counters,
                null,
                2
            )
        );
        const hasHardFailure =
            counters.malformedJobs > 0 ||
            counters.missingMemories > 0 ||
            counters.receiptMemoryMismatches > 0;
        if (hasHardFailure) {
            throw new Error('legacy memory-import audit has unreconciled jobs; deployment must remain stopped');
        }
        if (!apply && counters.unresolvedLegacyJobs > 0) {
            throw new Error('legacy memory-import jobs need gates; rerun with --apply after the required history review');
        }
    } finally {
        await queue?.close();
        await connection?.quit();
        await prisma.$disconnect();
    }
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
