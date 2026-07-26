/**
 * Review panels call server actions that may fail after an AI request, a
 * conditional write, or an authorization check.  Those actions can carry
 * infrastructure details in an Error instance, so the browser must never use
 * arbitrary Error.message values as toast copy.
 *
 * The small allow-lists below contain only deliberate, user-actionable state
 * conflicts.  Components translate the returned key in the active locale;
 * every other failure falls back to a stable operation-level retry message.
 */
function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.trim();
    if (typeof error === 'string') return error.trim();
    return '';
}

const qaIncompleteMessages = new Set([
    '质检结果不完整，请重新质检后再生成',
    '质检结果不完整，请重新质检后再选择',
    '质检结果不完整，请重新质检后再应用',
]);

const qaRerunMessages = new Set([
    '质检结果已变化，请重新质检后再生成',
    '当前分段原文已变化，请重新质检',
    '当前译文已被修改，请重新质检后再生成',
    '当前译文已变化，请按最新译文重新生成',
    '质检结果已变化，请重新质检后再选择',
    '当前译文已被修改，请重新质检后再选择',
    '质检结果已变化，请重新质检后再应用',
    '修订译文已过期，请按当前选择重新生成',
    '当前译文已被修改，请重新质检后再应用',
    '质检结果已被其他操作更新，请重试',
    '当前译文已被其他操作更新，请重试',
]);

const qaSelectionChangedMessages = new Set([
    '问题选择已变化，请等待保存完成后重试',
    '所选质检问题已失效，请重新选择',
    '问题选择已变化，请重新生成',
    '问题选择与其他操作冲突，请重试',
]);

export type QaReviewErrorKey =
    | 'generateFailed'
    | 'applyFailed'
    | 'selectionSaveFailed'
    | 'incompleteWarning'
    | 'rerunRequired'
    | 'selectAtLeastOne'
    | 'selectionChanged';

/**
 * Map only the QA state conflicts a reviewer can resolve themselves.  A model,
 * database, queue, or serialization error always becomes the caller's
 * localized retry fallback.
 */
export function resolveQaReviewErrorKey(
    error: unknown,
    fallback: Extract<QaReviewErrorKey, 'generateFailed' | 'applyFailed' | 'selectionSaveFailed'>
): QaReviewErrorKey {
    const message = errorMessage(error);
    if (message === '请先勾选至少一条质检问题') return 'selectAtLeastOne';
    if (qaIncompleteMessages.has(message)) return 'incompleteWarning';
    if (qaSelectionChangedMessages.has(message)) return 'selectionChanged';
    if (qaRerunMessages.has(message)) return 'rerunRequired';
    return fallback;
}

const mtCandidateRefreshMessages = new Set([
    '缺少文档分段，无法应用候选译文',
    '当前分段缺少并发版本，无法应用候选译文',
    '当前分段不处于预翻译复核，候选译文未应用；请刷新后重试',
    '当前分段原文已变化，候选译文未应用；请刷新后重试',
    '当前译文已被其他窗口更新，候选译文未应用；请刷新后重试',
]);

const mtSegmentUnavailableMessages = new Set(['未授权', '缺少 itemId', '文档段落不存在或无权写入']);

export type MtReviewErrorKey =
    | 'applyFailed'
    | 'baselineGenerationFailed'
    | 'embeddingGenerationFailed'
    | 'saveFailed'
    | 'saveStatusFailed'
    | 'createFailed'
    | 'candidateRefreshRequired'
    | 'segmentUnavailable'
    | 'translationRequiredForEnable';

/**
 * Keep MT review toasts localizable and safe.  Do not add broad substring
 * checks here: a provider or database error must not become browser-visible
 * merely because it happens to contain similar wording.
 */
export function resolveMtReviewErrorKey(
    error: unknown,
    fallback: Exclude<
        MtReviewErrorKey,
        'candidateRefreshRequired' | 'segmentUnavailable' | 'translationRequiredForEnable'
    >
): MtReviewErrorKey {
    const message = errorMessage(error);
    if (mtCandidateRefreshMessages.has(message)) return 'candidateRefreshRequired';
    if (mtSegmentUnavailableMessages.has(message)) return 'segmentUnavailable';
    if (message === '没有译文的词条不能启用') return 'translationRequiredForEnable';
    return fallback;
}
