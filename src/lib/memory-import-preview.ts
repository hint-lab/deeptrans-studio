import {
    canonicalizeMemoryImportColumnName,
    resolveMemoryImportDelimitedColumns,
} from './memory-import-delimited';

export type MemoryImportColumnMapping = {
    sourceKey: string;
    targetKey: string;
    notesKey: string;
};

export type MemoryImportPreviewRecord = Record<string, unknown>;

export type MemoryImportPreviewRow = {
    source: string;
    target: string;
    notes: string;
};

function normalizeColumnName(value: unknown) {
    return canonicalizeMemoryImportColumnName(value);
}

export function detectMemoryImportColumns(
    headers: string[],
    fallback: MemoryImportColumnMapping
): MemoryImportColumnMapping {
    const columns = resolveMemoryImportDelimitedColumns(headers, fallback);
    return {
        sourceKey: columns.sourceKey || fallback.sourceKey,
        targetKey: columns.targetKey || fallback.targetKey,
        notesKey: columns.notesKey || fallback.notesKey,
    };
}

function readCell(record: MemoryImportPreviewRecord, primaryKey: string) {
    const normalizedRecord = new Map(
        Object.entries(record).map(([key, value]) => [normalizeColumnName(key), value])
    );
    const normalizedKey = normalizeColumnName(primaryKey);
    return normalizedRecord.has(normalizedKey)
        ? String(normalizedRecord.get(normalizedKey) ?? '').trim()
        : '';
}

export function createMemoryImportPreviewRows(
    records: MemoryImportPreviewRecord[],
    mapping: MemoryImportColumnMapping
): MemoryImportPreviewRow[] {
    return records.map(record => {
        const columns = resolveMemoryImportDelimitedColumns(Object.keys(record), mapping);
        return {
            source: readCell(record, columns.sourceKey),
            target: readCell(record, columns.targetKey),
            notes: readCell(record, columns.notesKey),
        };
    });
}
