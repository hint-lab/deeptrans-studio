import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    MAX_TRANSLATION_MEMORY_IMPORT_PAIRS,
} from '@/lib/memory-import-validation';

/**
 * A worker failure is persisted by BullMQ and later shown in the import
 * recovery dialog.  It can contain provider, database, or object-storage
 * details, so it is not safe to pass through as a status message.
 */
export const MEMORY_IMPORT_UNAVAILABLE_MESSAGE = '导入服务暂不可用，请稍后重试';
export const MEMORY_IMPORT_FAILED_MESSAGE = '导入任务失败，请检查文件和列映射后重试。';
export const MEMORY_IMPORT_FILE_FORMAT_MESSAGE =
    '导入文件格式有误，请检查引号、列映射和内容后重试。';
export const MEMORY_VECTOR_BACKFILL_UNAVAILABLE_MESSAGE =
    '记忆向量服务暂不可用，请稍后重试';
export const MEMORY_VECTOR_BACKFILL_FAILED_MESSAGE = '记忆向量回填失败，请稍后重试。';

function errorText(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (value instanceof Error) return value.message.trim();
    return '';
}

/**
 * Keep only failure messages that are both actionable and produced from a
 * bounded, server-controlled template.  In particular, do not expose a raw
 * BullMQ `failedReason`: workers may include connection strings, hostnames,
 * provider responses, or stack details there.
 */
export function memoryImportJobFailureMessage(
    reason: unknown,
    fallback = MEMORY_IMPORT_FAILED_MESSAGE
) {
    const message = errorText(reason);
    if (message === EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE) return message;

    const limitPattern = new RegExp(
        `^单次最多导入 ${MAX_TRANSLATION_MEMORY_IMPORT_PAIRS} 条有效原文/译文对；当前解析到 \\d+ 条。请拆分文件后重试。$`
    );
    if (limitPattern.test(message)) return message;

    if (message.startsWith('MALFORMED_DELIMITED_IMPORT:')) {
        return MEMORY_IMPORT_FILE_FORMAT_MESSAGE;
    }

    return fallback;
}
