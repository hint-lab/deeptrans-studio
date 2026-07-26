import { createHash } from 'node:crypto';
import { resolveMemoryImportFormat } from './memory-import-format';

/**
 * Jobs created after the durable-reservation rollout use one atomic write
 * protocol: entries, vectors and the completion receipt either all commit or
 * none do.  Keep the marker in the queue payload so status recovery can
 * distinguish those safe failures from legacy jobs that may have written
 * partially before failing.
 */
export const MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION = 1;

export function usesMemoryImportReceiptProtocol(data: unknown) {
    if (!data || typeof data !== 'object') return false;
    return (
        Number((data as { receiptProtocolVersion?: unknown }).receiptProtocolVersion) ===
        MEMORY_IMPORT_RECEIPT_PROTOCOL_VERSION
    );
}

export type MemoryImportJobIdentity = {
    userId: string;
    memoryId: string;
    fileKey: string;
    tenantId?: string | null;
    fileType: string;
    sourceLang?: string;
    targetLang?: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
};

type CanonicalMemoryImportJobIdentity = {
    userId: string;
    memoryId: string;
    fileKey: string;
    tenantId: string;
    fileType: string;
    sourceLang: string;
    targetLang: string;
    sourceKey: string;
    targetKey: string;
    notesKey: string;
};

function required(value: unknown, name: string) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`MISSING_MEMORY_IMPORT_${name}`);
    return normalized;
}

function optional(value: unknown) {
    return String(value ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase();
}

function optionalScopeId(value: unknown) {
    // IDs are opaque database/storage identifiers, not case-insensitive user
    // input. Do not collapse distinct tenant scopes into one import receipt.
    return String(value ?? '').trim();
}

/**
 * File names and MIME values have several equivalent spellings, but the
 * worker only has four parsing behaviours. Keep the idempotency key attached
 * to the actual parser selected rather than a presentation-only filename.
 */
function canonicalFileType(value: unknown) {
    const normalized = required(value, 'FILE_TYPE').toLowerCase();
    return resolveMemoryImportFormat(normalized) || normalized;
}

function canonicalColumnKey(value: unknown, defaultValue: string) {
    const normalized = optional(value);
    // An omitted mapping and the UI's default mapping resolve to exactly the
    // same alias-first parser behaviour. Treat them as one input identity.
    return normalized === defaultValue ? '' : normalized;
}

export function canonicalizeMemoryImportJobIdentity(
    identity: MemoryImportJobIdentity
): CanonicalMemoryImportJobIdentity {
    const fileType = canonicalFileType(identity.fileType);
    const mapsColumns = fileType === 'csv' || fileType === 'tsv' || fileType === 'spreadsheet';

    return {
        userId: required(identity.userId, 'USER'),
        memoryId: required(identity.memoryId, 'MEMORY'),
        fileKey: required(identity.fileKey, 'FILE'),
        tenantId: optionalScopeId(identity.tenantId),
        fileType,
        sourceLang: optional(identity.sourceLang),
        targetLang: optional(identity.targetLang),
        sourceKey: mapsColumns ? canonicalColumnKey(identity.sourceKey, 'source') : '',
        targetKey: mapsColumns ? canonicalColumnKey(identity.targetKey, 'target') : '',
        notesKey: mapsColumns ? canonicalColumnKey(identity.notesKey, 'notes') : '',
    };
}

/**
 * A full, versioned digest of every parser- and owner-relevant input. The
 * storage object key is intentionally part of this digest; it identifies the
 * exact uploaded object, not a content hash supplied by the browser.
 */
export function memoryImportInputFingerprint(identity: MemoryImportJobIdentity) {
    const canonical = canonicalizeMemoryImportJobIdentity(identity);
    return createHash('sha256')
        .update(
            JSON.stringify([
                'memory-import-input-v2',
                canonical.userId,
                canonical.memoryId,
                canonical.fileKey,
                canonical.tenantId,
                canonical.fileType,
                canonical.sourceLang,
                canonical.targetLang,
                canonical.sourceKey,
                canonical.targetKey,
                canonical.notesKey,
            ])
        )
        .digest('hex');
}

/**
 * BullMQ job IDs must not contain `:`. The full fingerprint remains in the
 * durable receipt, while this opaque prefix is suitable for Redis job names.
 */
export function memoryImportJobId(identity: MemoryImportJobIdentity) {
    return `memory-import-${memoryImportInputFingerprint(identity).slice(0, 40)}`;
}

/**
 * Transitional lookup only: jobs queued before the v2 input fingerprint used
 * owner + memory + object key alone. The route checks it to avoid scheduling a
 * second import while an old, still-active job is draining after an upgrade.
 */
export function legacyMemoryImportJobId(
    identity: Pick<MemoryImportJobIdentity, 'userId' | 'memoryId' | 'fileKey'>
) {
    const userId = required(identity.userId, 'USER');
    const memoryId = required(identity.memoryId, 'MEMORY');
    const fileKey = required(identity.fileKey, 'FILE');
    const digest = createHash('sha256')
        .update(JSON.stringify([userId, memoryId, fileKey]))
        .digest('hex')
        .slice(0, 40);
    return `memory-import-${digest}`;
}

export function isSameMemoryImportJob(
    data: Partial<MemoryImportJobIdentity> | null | undefined,
    identity: MemoryImportJobIdentity
) {
    if (!data) return false;
    try {
        return (
            memoryImportInputFingerprint(data as MemoryImportJobIdentity) ===
            memoryImportInputFingerprint(identity)
        );
    } catch {
        // A partially shaped legacy or corrupted queue payload must never be
        // attached to a new request merely because it shares a truncated ID.
        return false;
    }
}
