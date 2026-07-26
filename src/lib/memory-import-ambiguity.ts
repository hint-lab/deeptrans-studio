/**
 * A durable receipt is the only successful completion proof for a
 * translation-memory import. These constants deliberately distinguish a
 * missing proof from a failed import: the former may already have written
 * legacy rows, so it remains blocked until the owner explicitly reviews it.
 */
export const MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE =
    'MEMORY_IMPORT_COMPLETION_UNCONFIRMED';
export const MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE =
    '该导入任务没有可验证的完成回执。为避免重复写入，已暂停此记忆库的新导入；请先核查记忆库后再明确解除限制。';
export const MEMORY_IMPORT_AMBIGUITY_IDENTITY_MISMATCH_ERROR =
    'MEMORY_IMPORT_AMBIGUITY_IDENTITY_MISMATCH';

export type MemoryImportAmbiguityIdentity = {
    jobId: string;
    memoryId: string;
    // Provenance may be cleared if the historical account is deleted; the
    // gate itself remains attached to memoryId and is resolved by its current
    // owner.
    userId: string | null;
};

export function isSameMemoryImportAmbiguityIdentity(
    record: MemoryImportAmbiguityIdentity,
    identity: MemoryImportAmbiguityIdentity
) {
    return (
        record.jobId === identity.jobId &&
        record.memoryId === identity.memoryId &&
        record.userId === identity.userId
    );
}
