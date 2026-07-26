export type MemoryImportDelimitedFormat = 'csv' | 'tsv';

export type MemoryImportDelimitedColumnMapping = {
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
};

export type MemoryImportDelimitedPair = {
    source: string;
    target: string;
    notes?: string;
};

export type MemoryImportDelimitedParseError = {
    code: 'UNTERMINATED_QUOTE' | 'UNEXPECTED_QUOTE' | 'UNEXPECTED_CHARACTER_AFTER_QUOTE';
    message: string;
    line: number;
    column: number;
};

export type MemoryImportDelimitedColumns = {
    sourceKey: string;
    targetKey: string;
    notesKey: string;
    sourceIndex: number;
    targetIndex: number;
    notesIndex: number;
};

export type MemoryImportDelimitedSuccess = {
    ok: true;
    delimiter: ',' | '\t';
    headers: string[];
    records: string[][];
    columns: MemoryImportDelimitedColumns;
    pairs: MemoryImportDelimitedPair[];
};

export type MemoryImportDelimitedFailure = {
    ok: false;
    error: MemoryImportDelimitedParseError;
};

export type MemoryImportDelimitedResult =
    | MemoryImportDelimitedSuccess
    | MemoryImportDelimitedFailure;

const SOURCE_COLUMN_ALIASES = ['source', 'src', '源', '原文'];
const TARGET_COLUMN_ALIASES = ['target', 'tgt', '译', '译文'];
const NOTES_COLUMN_ALIASES = ['notes', 'note', '备注'];

/**
 * Keeps header matching identical for preview and worker imports without
 * changing the displayed header name. A leading BOM is accepted both at the
 * start of a file and on a manually supplied mapping value.
 */
export function canonicalizeMemoryImportColumnName(value: unknown): string {
    return String(value ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase();
}

export function memoryImportDelimitedDelimiter(format: MemoryImportDelimitedFormat): ',' | '\t' {
    return format === 'tsv' ? '\t' : ',';
}

function parseError(
    code: MemoryImportDelimitedParseError['code'],
    line: number,
    column: number
): MemoryImportDelimitedFailure {
    const message =
        code === 'UNTERMINATED_QUOTE'
            ? `第 ${line} 行第 ${column} 列的引号未闭合`
            : code === 'UNEXPECTED_QUOTE'
              ? `第 ${line} 行第 ${column} 列出现了不在字段开头的引号`
              : `第 ${line} 行第 ${column} 列的闭合引号后存在无效字符`;
    return { ok: false, error: { code, message, line, column } };
}

type ParsedRows = { ok: true; rows: string[][] } | MemoryImportDelimitedFailure;

/** RFC 4180-style parser with a caller-selected, exact delimiter. */
function parseRows(text: string, delimiter: ',' | '\t'): ParsedRows {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let justClosedQuote = false;
    let line = 1;
    let column = 1;

    const pushRow = () => {
        row.push(field);
        // Empty physical lines have one empty field. They are not records.
        if (!row.every(cell => cell === '')) rows.push(row);
        row = [];
        field = '';
        justClosedQuote = false;
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index] ?? '';
        const next = text[index + 1] ?? '';

        if (inQuotes) {
            if (character === '"') {
                if (next === '"') {
                    field += '"';
                    index += 1;
                    column += 2;
                    continue;
                }
                inQuotes = false;
                justClosedQuote = true;
                column += 1;
                continue;
            }
            if (character === '\r') {
                if (next === '\n') index += 1;
                field += '\n';
                line += 1;
                column = 1;
                continue;
            }
            if (character === '\n') {
                field += '\n';
                line += 1;
                column = 1;
                continue;
            }
            field += character;
            column += 1;
            continue;
        }

        if (justClosedQuote) {
            if (character === delimiter) {
                row.push(field);
                field = '';
                justClosedQuote = false;
                column += 1;
                continue;
            }
            if (character === '\r' || character === '\n') {
                if (character === '\r' && next === '\n') index += 1;
                pushRow();
                line += 1;
                column = 1;
                continue;
            }
            return parseError('UNEXPECTED_CHARACTER_AFTER_QUOTE', line, column);
        }

        if (character === delimiter) {
            row.push(field);
            field = '';
            column += 1;
            continue;
        }
        if (character === '\r' || character === '\n') {
            if (character === '\r' && next === '\n') index += 1;
            pushRow();
            line += 1;
            column = 1;
            continue;
        }
        if (character === '"') {
            if (field !== '') return parseError('UNEXPECTED_QUOTE', line, column);
            inQuotes = true;
            column += 1;
            continue;
        }
        field += character;
        column += 1;
    }

    if (inQuotes) return parseError('UNTERMINATED_QUOTE', line, column);

    // Avoid adding a spurious record after a terminal line break, while still
    // preserving a final empty field such as `source,target,`.
    if (field !== '' || row.length > 0 || (text.length > 0 && !/[\r\n]$/.test(text))) {
        pushRow();
    }
    return { ok: true, rows };
}

function findColumnIndex(
    headers: string[],
    selected: string | undefined,
    aliases: string[]
): number {
    const canonicalHeaders = headers.map(canonicalizeMemoryImportColumnName);
    for (const candidate of [selected, ...aliases]) {
        const canonicalCandidate = canonicalizeMemoryImportColumnName(candidate);
        if (!canonicalCandidate) continue;
        const index = canonicalHeaders.indexOf(canonicalCandidate);
        if (index >= 0) return index;
    }
    return -1;
}

export function resolveMemoryImportDelimitedColumns(
    headers: string[],
    mapping: MemoryImportDelimitedColumnMapping = {}
): MemoryImportDelimitedColumns {
    const sourceIndex = findColumnIndex(headers, mapping.sourceKey, SOURCE_COLUMN_ALIASES);
    const targetIndex = findColumnIndex(headers, mapping.targetKey, TARGET_COLUMN_ALIASES);
    const notesIndex = findColumnIndex(headers, mapping.notesKey, NOTES_COLUMN_ALIASES);
    return {
        sourceKey: sourceIndex >= 0 ? (headers[sourceIndex] ?? '') : '',
        targetKey: targetIndex >= 0 ? (headers[targetIndex] ?? '') : '',
        notesKey: notesIndex >= 0 ? (headers[notesIndex] ?? '') : '',
        sourceIndex,
        targetIndex,
        notesIndex,
    };
}

function pairsFromRecords(
    records: string[][],
    columns: MemoryImportDelimitedColumns
): MemoryImportDelimitedPair[] {
    if (columns.sourceIndex < 0 || columns.targetIndex < 0) return [];
    const pairs: MemoryImportDelimitedPair[] = [];
    for (const record of records) {
        const source = String(record[columns.sourceIndex] ?? '').trim();
        const target = String(record[columns.targetIndex] ?? '').trim();
        const notes =
            columns.notesIndex >= 0 ? String(record[columns.notesIndex] ?? '').trim() : '';
        if (source && target) pairs.push({ source, target, notes: notes || undefined });
    }
    return pairs;
}

/**
 * Parses a CSV or TSV translation-memory file into raw headers/records plus
 * importable pairs. Parsing errors are deliberately returned as a discriminated
 * result so callers never silently import a partial file.
 */
export function parseMemoryImportDelimited(
    text: string,
    options: {
        format: MemoryImportDelimitedFormat;
        mapping?: MemoryImportDelimitedColumnMapping;
    }
): MemoryImportDelimitedResult {
    const delimiter = memoryImportDelimitedDelimiter(options.format);
    const parsed = parseRows(String(text ?? '').replace(/^\uFEFF/, ''), delimiter);
    if (!parsed.ok) return parsed;

    const [headers = [], ...records] = parsed.rows;
    const columns = resolveMemoryImportDelimitedColumns(headers, options.mapping);
    return {
        ok: true,
        delimiter,
        headers,
        records,
        columns,
        pairs: pairsFromRecords(records, columns),
    };
}
