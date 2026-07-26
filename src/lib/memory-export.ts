export const MEMORY_EXPORT_MAX_ENTRIES = 25_000;
export const MEMORY_EXPORT_MAX_BYTES = 20 * 1024 * 1024;

export type MemoryExportFormat = 'csv' | 'tmx';

export type TranslationMemoryExportEntry = {
    memoryName: string;
    sourceText: string;
    targetText: string;
    notes?: string | null;
    sourceLang?: string | null;
    targetLang?: string | null;
};

export class MemoryExportLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MemoryExportLimitError';
    }
}

function text(value: unknown) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function isMemoryExportFormat(value: string | null): value is MemoryExportFormat {
    return value === 'csv' || value === 'tmx';
}

export function escapeXml(value: unknown) {
    // XML 1.0 forbids most control characters and lone surrogate code points.
    // Remove them before entity escaping so a user-supplied segment cannot make
    // the downloaded TMX malformed.
    const xmlSafe = Array.from(text(value))
        .filter(char => {
            const codePoint = char.codePointAt(0) || 0;
            return (
                codePoint === 0x9 ||
                codePoint === 0xa ||
                codePoint === 0xd ||
                (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
                (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
                (codePoint >= 0x10000 && codePoint <= 0x10ffff)
            );
        })
        .join('');
    return xmlSafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Quote every field so commas, quotes and line breaks remain valid CSV. A leading
 * tab neutralizes formulas when the file is opened in a spreadsheet application.
 * The current importer trims cells, so re-importing an exported formula-like value
 * restores its source text instead of retaining the safety tab.
 */
export function escapeCsvCell(value: unknown) {
    const raw = text(value);
    const formulaSafe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `\t${raw}` : raw;
    return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function normalizeTmxLanguage(value: unknown) {
    const candidate = text(value).trim();
    return /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(candidate) ? candidate : 'und';
}

export function createCsvHeader() {
    return '\ufeff"memory_name","source","target","notes","source_lang","target_lang"\r\n';
}

export function serializeCsvEntry(entry: TranslationMemoryExportEntry) {
    return [
        entry.memoryName,
        entry.sourceText,
        entry.targetText,
        entry.notes,
        entry.sourceLang,
        entry.targetLang,
    ]
        .map(escapeCsvCell)
        .join(',')
        .concat('\r\n');
}

export function createTmxHeader() {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tmx version="1.4">',
        '  <header creationtool="DeepTrans Studio" creationtoolversion="1.0" segtype="sentence" o-tmf="DeepTrans-TMX" adminlang="en" srclang="*all*" datatype="PlainText"/>',
        '  <body>',
    ].join('\n');
}

export function serializeTmxEntry(entry: TranslationMemoryExportEntry) {
    const sourceLang = normalizeTmxLanguage(entry.sourceLang);
    const targetLang = normalizeTmxLanguage(entry.targetLang);
    const notes = text(entry.notes);
    const noteLine = notes ? `\n      <note>${escapeXml(notes)}</note>` : '';

    return [
        '    <tu>',
        `      <prop type="x-memory-name">${escapeXml(entry.memoryName)}</prop>${noteLine}`,
        `      <tuv xml:lang="${sourceLang}"><seg>${escapeXml(entry.sourceText)}</seg></tuv>`,
        `      <tuv xml:lang="${targetLang}"><seg>${escapeXml(entry.targetText)}</seg></tuv>`,
        '    </tu>',
    ].join('\n');
}

export function createTmxFooter() {
    return '  </body>\n</tmx>\n';
}

function encodedLength(value: string) {
    return new TextEncoder().encode(value).byteLength;
}

function appendWithinLimit(parts: string[], next: string, total: number) {
    const nextTotal = total + encodedLength(next);
    if (nextTotal > MEMORY_EXPORT_MAX_BYTES) {
        throw new MemoryExportLimitError(
            `导出内容超过 ${Math.floor(MEMORY_EXPORT_MAX_BYTES / 1024 / 1024)} MB 限制，请缩小导出范围后重试。`
        );
    }
    parts.push(next);
    return nextTotal;
}

/**
 * Produces standards-compliant, re-importable text. The caller must still enforce
 * ownership before passing rows into this serializer.
 */
export function serializeTranslationMemoryExport(
    entries: TranslationMemoryExportEntry[],
    format: MemoryExportFormat
) {
    if (entries.length > MEMORY_EXPORT_MAX_ENTRIES) {
        throw new MemoryExportLimitError(
            `单次最多导出 ${MEMORY_EXPORT_MAX_ENTRIES.toLocaleString()} 条记忆，请缩小导出范围后重试。`
        );
    }

    const isCsv = format === 'csv';
    const parts: string[] = [];
    let bytes = 0;
    bytes = appendWithinLimit(parts, isCsv ? createCsvHeader() : `${createTmxHeader()}\n`, bytes);

    entries.forEach(entry => {
        const serialized = isCsv ? serializeCsvEntry(entry) : `${serializeTmxEntry(entry)}\n`;
        bytes = appendWithinLimit(parts, serialized, bytes);
    });

    if (!isCsv) bytes = appendWithinLimit(parts, createTmxFooter(), bytes);
    return parts.join('');
}

export function buildMemoryExportContentDisposition(
    format: MemoryExportFormat,
    scope: 'all' | 'memory',
    now = new Date()
) {
    const date = now.toISOString().slice(0, 10);
    const filename = `deeptrans-${scope === 'all' ? 'memories' : 'memory'}-${date}.${format}`;
    const asciiFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const encoded = encodeURIComponent(filename).replace(
        /['()]/g,
        char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
