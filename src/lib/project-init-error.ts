import { DOCUMENT_INIT_EMPTY_DOCUMENT_CODE } from '@/lib/document-init-parse-state';
import { DOCUMENT_TERMS_RUN_ERROR, DOCUMENT_TERMS_START_ERROR } from '@/lib/document-term-job';

/**
 * The initialization API predates stable machine-readable error codes. Its
 * `error` field can consequently contain a guard or infrastructure message.
 * Treat it as untrusted display data: only the finite, action-oriented values
 * emitted by the project-init routes are converted into UI states here.
 */
export type ProjectInitErrorKind =
    | 'retry'
    | 'empty-document'
    | 'parse-not-ready'
    | 'terms-start-failed'
    | 'terms-run-failed'
    | 'terms-new-batch'
    | 'terms-retry'
    | 'terms-cancel-updated'
    | 'terms-cancel-completed'
    | 'terms-cancel-failed'
    | 'terms-write-in-progress'
    | 'terms-empty'
    | 'terms-pretranslate-incomplete'
    | 'document-stage-changed'
    | 'segment-conflict';

type ProjectInitApiPayload = {
    code?: unknown;
    error?: unknown;
    requiresNewBatch?: unknown;
    requiresRetry?: unknown;
};

const ERROR_KIND_BY_MESSAGE: Readonly<Record<string, ProjectInitErrorKind>> = {
    [DOCUMENT_TERMS_START_ERROR]: 'terms-start-failed',
    [DOCUMENT_TERMS_RUN_ERROR]: 'terms-run-failed',
    '术语提取已停止，请创建新的重试任务': 'terms-new-batch',
    '术语提取已停止，请重新提取后再写入词库': 'terms-new-batch',
    '术语提取结果已过期，请重试': 'terms-retry',
    '术语提取任务已更新，请刷新后重试': 'terms-cancel-updated',
    '术语提取结果已完成，无法停止': 'terms-cancel-completed',
    '术语提取不再运行，无法停止': 'terms-cancel-completed',
    '术语提取已失败，请直接重试': 'terms-cancel-failed',
    '术语正在写入，请勿重复提交': 'terms-write-in-progress',
    '未提取到可写入的术语，请重试或调整提取设置': 'terms-empty',
    '文档已进入其他阶段，不能从旧页面重新启动术语提取': 'document-stage-changed',
    '文档已进入其他阶段，不能从旧页面重复写入术语': 'document-stage-changed',
    '文档阶段已变化，术语提取未启动': 'document-stage-changed',
    '文档阶段已变化，术语未写入': 'document-stage-changed',
    '文档已有分段或已进入后续阶段，禁止覆盖现有翻译内容': 'segment-conflict',
    '文档已进入后续阶段，不能从旧页面重新分割': 'segment-conflict',
};

function asApiPayload(value: unknown): ProjectInitApiPayload | null {
    return value && typeof value === 'object' ? (value as ProjectInitApiPayload) : null;
}

function resolveApiErrorKind(payload: ProjectInitApiPayload | null): ProjectInitErrorKind {
    if (!payload) return 'retry';
    if (payload.code === DOCUMENT_INIT_EMPTY_DOCUMENT_CODE) return 'empty-document';
    if (payload.requiresNewBatch === true) return 'terms-new-batch';
    if (payload.requiresRetry === true) return 'terms-retry';

    const message = typeof payload.error === 'string' ? payload.error : '';
    if (/^术语预翻译未完成（\d+ 条），请重试$/u.test(message)) {
        return 'terms-pretranslate-incomplete';
    }
    return ERROR_KIND_BY_MESSAGE[message] || 'retry';
}

/** A typed request failure that never retains a server-provided message. */
export class ProjectInitRequestError extends Error {
    readonly kind: ProjectInitErrorKind;

    constructor(kind: ProjectInitErrorKind) {
        super('project-init-request-failed');
        this.name = 'ProjectInitRequestError';
        this.kind = kind;
    }
}

export function createProjectInitApiError(payload: unknown): ProjectInitRequestError {
    return new ProjectInitRequestError(resolveApiErrorKind(asApiPayload(payload)));
}

export function createProjectInitStateError(
    kind: Extract<ProjectInitErrorKind, 'retry' | 'parse-not-ready' | 'document-stage-changed'>
): ProjectInitRequestError {
    return new ProjectInitRequestError(kind);
}

/** Unknown thrown values are deliberately reduced to the local retry copy. */
export function resolveProjectInitErrorKind(error: unknown): ProjectInitErrorKind {
    return error instanceof ProjectInitRequestError ? error.kind : 'retry';
}

export function resolveProjectInitParseFailureCode(
    error: unknown
): typeof DOCUMENT_INIT_EMPTY_DOCUMENT_CODE | undefined {
    return resolveProjectInitErrorKind(error) === 'empty-document'
        ? DOCUMENT_INIT_EMPTY_DOCUMENT_CODE
        : undefined;
}
