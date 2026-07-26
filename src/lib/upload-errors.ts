/**
 * The upload action is used from browser-facing workflows. Keep its public
 * failure vocabulary deliberately small: storage, database and configuration
 * errors belong in server logs, while callers only receive an actionable
 * input/authentication/permission state or a retryable service failure.
 */
export const UPLOAD_ERROR_CODES = {
    FILE_REQUIRED: 'FILE_REQUIRED',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_TYPE_UNSUPPORTED: 'FILE_TYPE_UNSUPPORTED',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    ACCESS_DENIED: 'ACCESS_DENIED',
    UPLOAD_UNAVAILABLE: 'UPLOAD_UNAVAILABLE',
} as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[keyof typeof UPLOAD_ERROR_CODES];

export const UPLOAD_PUBLIC_MESSAGES: Record<UploadErrorCode, string> = {
    FILE_REQUIRED: '请选择要上传的文件',
    FILE_TOO_LARGE: '文件大小不能超过 10MB',
    FILE_TYPE_UNSUPPORTED: '不支持该文件类型',
    AUTH_REQUIRED: '请先登录后再上传文件',
    ACCESS_DENIED: '无权向当前项目上传文件',
    UPLOAD_UNAVAILABLE: '上传服务暂不可用，请稍后重试',
};

export type UploadFailure = {
    success: false;
    errorCode: UploadErrorCode;
    error: string;
};

export function uploadFailure(errorCode: UploadErrorCode): UploadFailure {
    return {
        success: false,
        errorCode,
        error: UPLOAD_PUBLIC_MESSAGES[errorCode],
    };
}

export function isUploadErrorCode(value: unknown): value is UploadErrorCode {
    return typeof value === 'string' && Object.values(UPLOAD_ERROR_CODES).includes(value as UploadErrorCode);
}

function errorText(error: unknown) {
    if (typeof error === 'string') return error.trim();
    if (error instanceof Error) return error.message.trim();
    return '';
}

/**
 * Converts unexpected action errors to a browser-safe result. GuardError is
 * intentionally identified by its stable name/status shape instead of being
 * imported here, so this shared module remains safe to import in client UI.
 */
export function uploadFailureFromError(error: unknown): UploadFailure {
    const message = errorText(error);
    if (message === UPLOAD_PUBLIC_MESSAGES.FILE_REQUIRED) {
        return uploadFailure(UPLOAD_ERROR_CODES.FILE_REQUIRED);
    }
    if (message === UPLOAD_PUBLIC_MESSAGES.FILE_TOO_LARGE) {
        return uploadFailure(UPLOAD_ERROR_CODES.FILE_TOO_LARGE);
    }
    if (message === UPLOAD_PUBLIC_MESSAGES.FILE_TYPE_UNSUPPORTED) {
        return uploadFailure(UPLOAD_ERROR_CODES.FILE_TYPE_UNSUPPORTED);
    }

    if (
        error !== null &&
        typeof error === 'object' &&
        (error as { name?: unknown }).name === 'GuardError'
    ) {
        const status = (error as { status?: unknown }).status;
        if (status === 401) return uploadFailure(UPLOAD_ERROR_CODES.AUTH_REQUIRED);
        if (status === 403 || status === 404) return uploadFailure(UPLOAD_ERROR_CODES.ACCESS_DENIED);
    }

    return uploadFailure(UPLOAD_ERROR_CODES.UPLOAD_UNAVAILABLE);
}
