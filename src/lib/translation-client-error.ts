const TEXT_TRANSLATION_MESSAGES = {
    resultMissing: '翻译服务未返回结果',
    failed: '翻译失败，请稍后重试',
} as const;

const SINGLE_QA_MESSAGES = {
    failed: '质检失败：请检查网络连接或稍后再试',
    claimedIncomplete: '质检运行未完成，分段仍停留在质检阶段。请刷新确认后显式驳回再重试。',
} as const;

function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.trim();
    return typeof error === 'string' ? error.trim() : '';
}

/**
 * Text translation is backed by a server action and may surface provider or
 * infrastructure failures as an Error. Keep the one locally-created empty
 * result state, but never render arbitrary error text in the result pane.
 */
export function resolveTextTranslationErrorMessage(error: unknown) {
    return errorMessage(error) === TEXT_TRANSLATION_MESSAGES.resultMissing
        ? TEXT_TRANSLATION_MESSAGES.resultMissing
        : TEXT_TRANSLATION_MESSAGES.failed;
}

const actionableSingleQaMessages = new Set([
    '当前分段已切换，已丢弃过期质检结果',
    '当前分段不在预翻译复核阶段，请刷新后重试',
    '当前分段原文已变化，请保存并刷新后再启动质检',
    '当前分段译文已变化，请保存并刷新后再启动质检',
    '无法创建质检运行标识，请刷新后重试',
    '质检运行标识缺失，请刷新后重试',
]);

/**
 * A single-item QA operation can safely keep exact, server-authored workflow
 * conflicts that a translator can resolve. Provider, database, and transport
 * error details otherwise collapse to a stable retry message; after the QA
 * claim succeeds, the durable stage warning takes precedence.
 */
export function resolveSingleQaClientErrorMessage(error: unknown, qaClaimed: boolean) {
    const message = errorMessage(error);
    if (!qaClaimed && actionableSingleQaMessages.has(message)) return message;
    return qaClaimed ? SINGLE_QA_MESSAGES.claimedIncomplete : SINGLE_QA_MESSAGES.failed;
}
