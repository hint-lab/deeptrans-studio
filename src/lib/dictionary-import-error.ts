/**
 * Messages that may cross the dictionary-import Server Action boundary.
 *
 * File validation errors are intentionally actionable. Provider, database, and
 * parser implementation errors stay on the server and collapse to the generic
 * fallback below.
 */
const DICTIONARY_IMPORT_MESSAGES = {
    missingDictionaryId: '缺少词库标识',
    missingFile: '请选择要导入的文件',
    unsupportedFile: '不支持的文件类型，仅支持 .xlsx/.xls/.csv/.tbx/.xml',
    noValidEntries: '没有识别到有效词条，请确认 source 和 target 两列均已填写',
    failed: '导入词库失败，请检查文件后重试。',
} as const;

export type DictionaryImportErrorCode = keyof typeof DICTIONARY_IMPORT_MESSAGES;

export class DictionaryImportInputError extends Error {
    readonly code: Exclude<DictionaryImportErrorCode, 'failed'>;

    constructor(code: Exclude<DictionaryImportErrorCode, 'failed'>) {
        super(DICTIONARY_IMPORT_MESSAGES[code]);
        this.name = 'DictionaryImportInputError';
        this.code = code;
    }
}

export function dictionaryImportPublicErrorMessage(error: unknown) {
    if (error instanceof DictionaryImportInputError) return error.message;
    return DICTIONARY_IMPORT_MESSAGES.failed;
}

export function dictionaryImportErrorMessage(code: DictionaryImportErrorCode) {
    return DICTIONARY_IMPORT_MESSAGES[code];
}
