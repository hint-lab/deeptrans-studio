export const API_REQUEST_UNAVAILABLE_MESSAGE = '请求服务暂不可用，请稍后重试';

/**
 * Browser API clients must not echo a remote error body. Preserve only a
 * compact, server-agnostic status vocabulary that tells the user what to do
 * next without exposing implementation details.
 */
export function apiRequestFailureMessage(status: number) {
    switch (status) {
        case 400:
            return '请求参数无效，请检查后重试';
        case 401:
            return '登录状态已失效，请重新登录';
        case 403:
            return '无权执行此操作';
        case 404:
            return '请求的资源不存在或已不可用';
        case 409:
            return '请求状态已变化，请刷新后重试';
        case 413:
            return '请求内容过大，请缩小后重试';
        case 429:
            return '请求过于频繁，请稍后重试';
        default:
            return API_REQUEST_UNAVAILABLE_MESSAGE;
    }
}
