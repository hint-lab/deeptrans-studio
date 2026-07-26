import {
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE,
    MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE,
} from '@/lib/memory-import-ambiguity';
import { MEMORY_IMPORT_FILE_FORMAT_MESSAGE } from '@/lib/memory-import-errors';
import {
    EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE,
    MAX_TRANSLATION_MEMORY_IMPORT_PAIRS,
} from '@/lib/memory-import-validation';

/**
 * The import API deliberately keeps a small public error vocabulary, but a
 * browser must still treat a malformed proxy response as untrusted.  This
 * classifier recognises only bounded protocol/input states and maps every
 * other response to a local retry message at the UI boundary.
 */
export const MEMORY_IMPORT_CLIENT_PROTOCOL_CODES = {
    MISSING_JOB_ID: 'MEMORY_IMPORT_CLIENT_MISSING_JOB_ID',
    RECOVERY_SCOPE_UNAVAILABLE: 'MEMORY_IMPORT_CLIENT_RECOVERY_SCOPE_UNAVAILABLE',
} as const;

export type MemoryImportClientProtocolCode =
    (typeof MEMORY_IMPORT_CLIENT_PROTOCOL_CODES)[keyof typeof MEMORY_IMPORT_CLIENT_PROTOCOL_CODES];

export type MemoryImportClientFailure =
    | { kind: 'unconfirmed' }
    | { kind: 'empty-pairs' }
    | { kind: 'pair-limit'; pairCount: number }
    | { kind: 'malformed-file' }
    | { kind: 'auth-required' }
    | { kind: 'access-denied' }
    | { kind: 'file-too-large' }
    | { kind: 'conflict' }
    | { kind: 'missing-job-id' }
    | { kind: 'recovery-unavailable' }
    | { kind: 'unknown' };

type ClientErrorShape = {
    status?: unknown;
    code?: unknown;
    publicError?: unknown;
    message?: unknown;
};

function clientErrorShape(value: unknown): ClientErrorShape {
    return value !== null && typeof value === 'object' ? (value as ClientErrorShape) : {};
}

function stringProperty(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function pairLimitCount(message: string) {
    const match = new RegExp(
        `^单次最多导入 ${MAX_TRANSLATION_MEMORY_IMPORT_PAIRS} 条有效原文/译文对；当前解析到 (\\d+) 条。请拆分文件后重试。$`
    ).exec(message);
    if (!match?.[1]) return null;
    const count = Number(match[1]);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/**
 * Creates an internal protocol error without placing a server payload in its
 * Error.message.  Callers still route it through the same UI classifier.
 */
export function memoryImportProtocolError(code: MemoryImportClientProtocolCode) {
    return Object.assign(new Error(), { code });
}

export function classifyMemoryImportClientFailure(error: unknown): MemoryImportClientFailure {
    const value = clientErrorShape(error);
    const code = stringProperty(value.code);
    const status = typeof value.status === 'number' ? value.status : undefined;
    // `publicError` is retained only long enough to recognise a bounded,
    // server-controlled import state. Never return it to the caller.
    const message = stringProperty(value.publicError || value.message);

    if (
        code === MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE ||
        message === MEMORY_IMPORT_COMPLETION_UNCONFIRMED_MESSAGE
    ) {
        return { kind: 'unconfirmed' };
    }
    if (code === MEMORY_IMPORT_CLIENT_PROTOCOL_CODES.MISSING_JOB_ID) {
        return { kind: 'missing-job-id' };
    }
    if (code === MEMORY_IMPORT_CLIENT_PROTOCOL_CODES.RECOVERY_SCOPE_UNAVAILABLE) {
        return { kind: 'recovery-unavailable' };
    }
    if (message === EMPTY_TRANSLATION_MEMORY_IMPORT_MESSAGE) return { kind: 'empty-pairs' };

    const pairCount = pairLimitCount(message);
    if (pairCount !== null) return { kind: 'pair-limit', pairCount };

    if (
        message === MEMORY_IMPORT_FILE_FORMAT_MESSAGE ||
        message.startsWith('MALFORMED_DELIMITED_IMPORT:')
    ) {
        return { kind: 'malformed-file' };
    }

    if (status === 401) return { kind: 'auth-required' };
    if (status === 403 || status === 404) return { kind: 'access-denied' };
    if (status === 413) return { kind: 'file-too-large' };
    if (status === 409) return { kind: 'conflict' };
    if (status === 503 || (typeof status === 'number' && status >= 500)) {
        return { kind: 'recovery-unavailable' };
    }

    return { kind: 'unknown' };
}
