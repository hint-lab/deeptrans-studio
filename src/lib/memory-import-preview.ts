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

const SOURCE_COLUMN_ALIASES = ['source', 'src', '源', '原文'];
const TARGET_COLUMN_ALIASES = ['target', 'tgt', '译', '译文'];
const NOTES_COLUMN_ALIASES = ['notes', 'note', '备注'];

function normalizeColumnName(value: unknown) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function findColumn(headers: string[], aliases: string[]) {
    const normalizedHeaders = headers.map(normalizeColumnName);
    for (const alias of aliases) {
        const index = normalizedHeaders.indexOf(normalizeColumnName(alias));
        if (index >= 0) return headers[index] ?? '';
    }
    return '';
}

export function detectMemoryImportColumns(
    headers: string[],
    fallback: MemoryImportColumnMapping
): MemoryImportColumnMapping {
    return {
        sourceKey: findColumn(headers, SOURCE_COLUMN_ALIASES) || fallback.sourceKey,
        targetKey: findColumn(headers, TARGET_COLUMN_ALIASES) || fallback.targetKey,
        notesKey: findColumn(headers, NOTES_COLUMN_ALIASES) || fallback.notesKey,
    };
}

function readCell(record: MemoryImportPreviewRecord, primaryKey: string, aliases: string[]) {
    const normalizedRecord = new Map(
        Object.entries(record).map(([key, value]) => [normalizeColumnName(key), value])
    );
    for (const key of [primaryKey, ...aliases]) {
        const normalizedKey = normalizeColumnName(key);
        if (!normalizedRecord.has(normalizedKey)) continue;
        return String(normalizedRecord.get(normalizedKey) ?? '').trim();
    }
    return '';
}

export function createMemoryImportPreviewRows(
    records: MemoryImportPreviewRecord[],
    mapping: MemoryImportColumnMapping
): MemoryImportPreviewRow[] {
    return records.map(record => ({
        source: readCell(record, mapping.sourceKey, SOURCE_COLUMN_ALIASES),
        target: readCell(record, mapping.targetKey, TARGET_COLUMN_ALIASES),
        notes: readCell(record, mapping.notesKey, NOTES_COLUMN_ALIASES),
    }));
}
