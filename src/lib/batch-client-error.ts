/**
 * Batch endpoints can carry provider, queue, storage, or guard details in an
 * unexpected failure. Keep browser-visible messages stable, while preserving
 * only the few local states a translator can act on immediately.
 */
export const BATCH_CLIENT_MESSAGES = {
    qaCancelUnavailable: '无法取消批量质检；结果仍在安全处理中。',
    preTranslateCancelUnavailable: '无法取消批量预译；结果仍在安全处理中。',
    translateStartFailed: '批量翻译无法启动，请刷新分段状态后重试。',
    translateProgressFailed: '无法读取批量翻译进度，请稍后重试。',
    translateTimedOut: '批量翻译超时，结果尚未保存，请稍后重试。',
    preTranslateCancelPending: '取消请求尚未确认，批量预译结果尚未保存。',
    preTranslatePersistFailed: '批量预译结果未能安全保存，请稍后重试。',
    translateFailed: '批量翻译未完成，请检查网络后重试。',
    qaStartFailed: '批量质检无法启动，请刷新分段状态后重试。',
    qaProgressFailed: '无法读取批量质检进度，请稍后重试。',
    qaTimedOut: '批量质检超时，结果尚未保存，请稍后重试。',
    qaCancelPending: '取消请求尚未确认，批量质检结果尚未保存。',
    qaPersistFailed: '批量质检结果未能安全保存，请稍后重试。',
    qaFailed: '批量质检未完成，请检查网络后重试。',
    signoffFailed: '批量签发未完成，请刷新后确认分段状态。',
    workflowFailed: '自动流程未完成，请刷新分段状态后重试。',
    postEditFailed: '译后编辑未完成，请稍后重试。',
    batchPostEditFailed: '批量译后编辑未完成，请刷新后重试。',
} as const;

const actionableMessages = new Set<string>([
    BATCH_CLIENT_MESSAGES.translateTimedOut,
    BATCH_CLIENT_MESSAGES.preTranslateCancelPending,
    BATCH_CLIENT_MESSAGES.qaTimedOut,
    BATCH_CLIENT_MESSAGES.qaCancelPending,
]);

/**
 * Never pass an arbitrary Error or API payload into a toast/log panel. Exact
 * locally-created actionable messages are safe to retain; everything else
 * falls back to the caller's operation-level message.
 */
export function resolveBatchClientErrorMessage(error: unknown, fallback: string): string {
    const candidate =
        error instanceof Error
            ? error.message.trim()
            : typeof error === 'string'
              ? error.trim()
              : '';

    return actionableMessages.has(candidate) ? candidate : fallback;
}
