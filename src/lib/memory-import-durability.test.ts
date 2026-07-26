import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('translation-memory UI uses a durable queue instead of the long SSE request', () => {
    const component = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'import-memory-dialog.tsx'
    );

    assert.match(component, /fetch\('\/api\/upload-proxy'/);
    assert.match(component, /fetch\('\/api\/memories\/import'/);
    assert.match(component, /\/api\/memories\/import\/status\?jobId=/);
    assert.doesNotMatch(component, /\/api\/memories\/import-progress/);
});

test('memory import requires an owned target and enqueues retryable work', () => {
    const route = read('src', 'app', 'api', 'memories', 'import', 'route.ts');

    assert.match(route, /if \(!memoryId\) throw new GuardError\(400, '请选择目标记忆库'\)/);
    assert.match(route, /requireOwnedMemory\(memoryId, authCtx\)/);
    assert.match(route, /defaultJobOpts/);
    assert.doesNotMatch(route, /默认记忆库|默认导入/);
});

test('memory import fingerprints every effective input and uses durable reservations before queue work', () => {
    const route = read('src', 'app', 'api', 'memories', 'import', 'route.ts');
    const status = read('src', 'app', 'api', 'memories', 'import', 'status', 'route.ts');
    const component = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'memories',
        'components',
        'import-memory-dialog.tsx'
    );

    assert.match(route, /memoryImportJobId\(identity\)/);
    assert.match(route, /memoryImportInputFingerprint\(identity\)/);
    assert.match(route, /resolveMemoryImportFormat\(fileType\)/);
    assert.match(route, /reserveMemoryImportForCurrentOwner\(prisma, reservationInput\)/);
    assert.match(route, /resolveMemoryImportAsUnconfirmedForCurrentOwner/);
    assert.match(route, /MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION/);
    assert.match(route, /receiptProtocolVersion: MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION/);
    assert.match(route, /await queue\.getJob\(jobId\)/);
    assert.match(route, /isSameMemoryImportJob\(reusableJob\.data, identity\)/);
    assert.match(route, /legacyMemoryImportJobId\(identity\)/);
    assert.match(route, /if \(state === 'completed'\)/);
    assert.match(route, /translationMemoryImportReservation\.findMany/);
    assert.match(route, /MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE/);
    assert.match(route, /translationMemoryImportAmbiguity\.findMany/);
    assert.match(route, /recoveryScope: authCtx\.userId/);
    assert.match(route, /\{ \.\.\.defaultJobOpts, jobId \}/);
    assert.doesNotMatch(route, /recordOpenImportAmbiguity|findOpenImportAmbiguity/);
    assert.match(status, /receiptForCurrentOwner/);
    assert.match(status, /requireOwnedMemory\(receipt\.memoryId, authCtx\)/);
    assert.match(status, /state: 'completed'/);
    assert.match(status, /durable: true/);
    assert.match(status, /if \(state === 'completed'\)/);
    assert.match(status, /translationMemoryImportReservation\.findFirst/);
    assert.match(status, /RESERVATION_QUEUE_GRACE_MS/);
    assert.match(status, /if \(!reservation\) throw new GuardError\(404/);
    assert.match(status, /usesMemoryImportReceiptProtocol/);
    assert.match(status, /resolveMemoryImportAsUnconfirmedForCurrentOwner/);
    assert.match(status, /translationMemoryImportAmbiguity\.findFirst/);
    assert.match(status, /MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE/);
    assert.doesNotMatch(status, /result: state === 'completed' \? job\.returnvalue : null/);
    assert.doesNotMatch(status, /recordImportAmbiguity|requestedMemoryId/);
    assert.match(component, /fetch\('\/api\/memories\/import', \{ cache: 'no-store' \}\)/);
    assert.match(component, /memoryImportRecoveryStorageKey\(scope\)/);
    assert.match(component, /unconfirmedImports/);
    assert.match(component, /memoryImportBlocksNewSubmission\(recoveryJobs, memoryId\)/);
    assert.match(component, /\/api\/memories\/import\/acknowledge/);
    assert.match(component, /memoryId=\$\{encodeURIComponent\(record\.memoryId\)\}/);
    assert.match(component, /'unconfirmed'/);
    assert.match(component, /await trackImportJob\(record\)/);
    assert.match(component, /setFileInputNonce\(value => value \+ 1\)/);
});

test('memory import validates embeddings then atomically commits entries, vectors, and a receipt', () => {
    const worker = read('src', 'worker', 'index.ts');
    const ownerLock = read('src', 'lib', 'memory-import-owner-lock.ts');
    const importStart = worker.indexOf('const memoryImportWorker = createWorker');
    const backfillStart = worker.indexOf(
        'const memoryVectorBackfillWorker = createWorker',
        importStart
    );
    const memoryImport = worker.slice(importStart, backfillStart);

    const validate = memoryImport.indexOf('assertEmbeddingBatch(vectors, texts.length');
    const commit = memoryImport.indexOf('commitMemoryImportWithReceiptForCurrentOwner');
    const upsert = memoryImport.indexOf('await upsertTranslationMemoryVectorsWithClient');
    const cleanup = memoryImport.indexOf('translationMemoryEntry.deleteMany');

    assert.ok(validate >= 0 && validate < commit);
    assert.ok(commit < upsert);
    assert.equal(cleanup, -1);
    assert.match(memoryImport, /inputFingerprint/);
    assert.match(memoryImport, /receipt: \{/);
    assert.match(memoryImport, /return \{[\s\S]*total: committed\.receipt\.total/);
    assert.match(ownerLock, /FOR UPDATE/);
    assert.match(ownerLock, /MEMORY_IMPORT_OWNER_MISMATCH_ERROR/);
    assert.match(ownerLock, /transaction\.translationMemoryEntry\.createMany/);
    assert.match(ownerLock, /transaction\.translationMemoryImportReceipt\.create/);
    assert.match(ownerLock, /MEMORY_IMPORT_TRANSACTION_OPTIONS/);
    assert.match(ownerLock, /assertMemoryImportEntryCount\(input\.entries\)/);
    assert.match(ownerLock, /MEMORY_IMPORT_UNCONFIRMED_GATE_ERROR/);
    assert.match(ownerLock, /MEMORY_IMPORT_ACKNOWLEDGED_TOMBSTONE_ERROR/);
    assert.match(ownerLock, /acknowledgeMemoryImportAmbiguityForCurrentOwner/);
    assert.match(ownerLock, /requireReservation\?: boolean/);
    assert.match(ownerLock, /deleteMatchingReservation/);
    assert.match(memoryImport, /requireReservation: usesMemoryImportReceiptProtocol\(job\.data\)/);
    assert.match(memoryImport, /throw new Error\(EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE\)/);
    assert.match(memoryImport, /isTranslationMemoryImportPairCountAllowed\(pairs\.length\)/);
    assert.match(memoryImport, /translationMemoryImportPairLimitMessage\(pairs\.length\)/);
    assert.doesNotMatch(memoryImport, /return \{ total: 0, indexed: 0, memoryId \}/);
});

test('import receipt migration keeps both user and memory ownership referentially intact', () => {
    const schema = read('prisma', 'schema.prisma');
    const migration = read(
        'prisma',
        'migrations',
        '20260726150000_add_translation_memory_import_receipts',
        'migration.sql'
    );
    const preservation = read(
        'prisma',
        'migrations',
        '20260726160000_preserve_translation_memory_import_receipts',
        'migration.sql'
    );

    assert.match(schema, /memoryImportReceipts\s+TranslationMemoryImportReceipt\[\]/);
    assert.match(schema, /@@unique\(\[userId, memoryId, inputFingerprint\]\)/);
    assert.match(schema, /TranslationMemoryImportReceiptUser/);
    assert.match(schema, /userId\s+String\?/);
    assert.match(migration, /TranslationMemoryImportReceipt_userId_fkey/);
    assert.match(migration, /TranslationMemoryImportReceipt_memoryId_fkey/);
    assert.match(migration, /userId_memoryId_inputFingerprint_key/);
    assert.match(preservation, /ALTER COLUMN "userId" DROP NOT NULL/);
    assert.match(preservation, /ON DELETE SET NULL/);
});

test('unconfirmed legacy imports have a persistent memory-scoped gate, reservation, and acknowledgement tombstone', () => {
    const schema = read('prisma', 'schema.prisma');
    const migration = read(
        'prisma',
        'migrations',
        '20260726153000_add_translation_memory_import_ambiguities',
        'migration.sql'
    );
    const acknowledge = read(
        'src',
        'app',
        'api',
        'memories',
        'import',
        'acknowledge',
        'route.ts'
    );
    const reservationMigration = read(
        'prisma',
        'migrations',
        '20260726154500_add_translation_memory_import_reservations',
        'migration.sql'
    );

    assert.match(schema, /model TranslationMemoryImportAmbiguity/);
    assert.match(schema, /acknowledgedAt\s+DateTime\?/);
    assert.match(schema, /TranslationMemoryImportAmbiguityUser/);
    assert.match(schema, /model TranslationMemoryImportReservation/);
    assert.match(schema, /importReservation\s+TranslationMemoryImportReservation\?/);
    assert.match(migration, /TranslationMemoryImportAmbiguity_userId_fkey/);
    assert.match(migration, /TranslationMemoryImportAmbiguity_memoryId_fkey/);
    assert.match(migration, /userId", "memoryId", "acknowledgedAt/);
    assert.match(reservationMigration, /TranslationMemoryImportAmbiguity_userId_fkey/);
    assert.match(reservationMigration, /ON DELETE SET NULL/);
    assert.match(reservationMigration, /TranslationMemoryImportReservation_memoryId_key/);
    assert.match(acknowledge, /requireOwnedMemory\(memoryId, authCtx\)/);
    assert.match(acknowledge, /release-unconfirmed-import/);
    assert.match(acknowledge, /acknowledgeMemoryImportAmbiguityForCurrentOwner/);
    assert.match(acknowledge, /state !== 'completed' && state !== 'failed'/);
    assert.doesNotMatch(acknowledge, /job\.data\?\.userId !== authCtx\.userId/);
});

test('legacy BullMQ upgrades require an explicit snapshot review and write-gated audit', () => {
    const audit = read('scripts', 'memory-import-upgrade-audit.ts');
    const packageJson = JSON.parse(read('package.json'));
    const zhReadme = read('README_ZH.md');

    assert.equal(
        packageJson.scripts['memory-import:upgrade:audit'],
        'tsx scripts/memory-import-upgrade-audit.ts'
    );
    assert.match(audit, /process\.argv\.includes\('--live'\)/);
    assert.match(audit, /process\.argv\.includes\('--apply'\)/);
    assert.match(audit, /queue-snapshot-and-pruned-history-reviewed/);
    assert.match(audit, /LEGACY_SNAPSHOT_REFERENCE_PREFIX/);
    assert.match(audit, /LEGACY_SNAPSHOT_SHA256_PREFIX/);
    assert.match(audit, /legacySnapshotEvidence/);
    assert.match(audit, /translationMemoryImportAmbiguity\.create/);
    assert.match(audit, /legacy memory-import jobs need gates/);
    const liveGuard = audit.indexOf('if (!live)');
    const prismaConnection = audit.indexOf('const prisma = new PrismaClient()');
    const redisConnection = audit.indexOf('new IORedis(');
    assert.ok(liveGuard >= 0 && liveGuard < prismaConnection);
    assert.ok(liveGuard < redisConnection);
    assert.match(zhReadme, /memory-import-upgrade-audit\.ts/);
    assert.match(zhReadme, /停止入口和旧 worker/);
    assert.match(zhReadme, /--live/);
    assert.match(zhReadme, /legacy-queue-snapshot/);
    assert.match(zhReadme, /升级后的 worker/);
});

test('the legacy streaming import endpoint and stale Server Actions are explicitly retired', () => {
    const action = read('src', 'actions', 'memories.ts');
    const route = read('src', 'app', 'api', 'memories', 'import-progress', 'route.ts');
    const importStart = action.indexOf('export async function importMemoryAction');
    const formActionStart = action.indexOf(
        'export async function importMemoryFromForm',
        importStart
    );
    const memoryImport = action.slice(importStart, formActionStart);
    const formImport = action.slice(
        formActionStart,
        action.indexOf('export async function listMemoriesAction')
    );

    assert.match(memoryImport, /if \(legacyDirectMemoryImportIsRetired\(\)\)/);
    assert.match(formImport, /if \(legacyDirectMemoryImportIsRetired\(\)\)/);
    assert.match(memoryImport, /RETIRED_DIRECT_MEMORY_IMPORT_MESSAGE/);
    assert.match(route, /status: 410/);
    assert.match(route, /Deprecation: 'true'/);
    assert.doesNotMatch(route, /importMemoryFromForm/);
    assert.doesNotMatch(route, /ReadableStream/);
});

test('memory vector backfill only processes missing vectors and exposes remaining work', () => {
    const worker = read('src', 'worker', 'index.ts');
    const backfill = worker.slice(
        worker.indexOf('const memoryVectorBackfillWorker = createWorker')
    );

    assert.match(backfill, /embedding IS NULL/g);
    assert.match(backfill, /ORDER BY id ASC/);
    assert.match(backfill, /assertEmbeddingBatch\(/);
    assert.match(backfill, /return \{ memoryId: memory\.id, total, indexed, remaining \}/);
});
