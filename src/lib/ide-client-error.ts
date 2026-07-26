import { chatStatus } from './chat-status';
import { isPublicMemorySearchErrorMessage } from './memory-search';

function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.trim();
    return typeof error === 'string' ? error.trim() : '';
}

/**
 * Chat API routes use the stable `chatStatus` vocabulary plus the narrow
 * public retrieval vocabulary. Network, malformed-response, and provider
 * errors must not be rendered directly just because they were wrapped in an
 * Error on the client.
 */
export function resolveChatClientErrorMessage(error: unknown, locale: unknown, fallback: string) {
    const candidate = errorMessage(error);
    const allowed = new Set(Object.values(chatStatus(locale)));
    return allowed.has(candidate) || isPublicMemorySearchErrorMessage(candidate)
        ? candidate
        : fallback;
}

export type RichTextEditorSaveFailure = 'changed-elsewhere' | 'review-state-changed' | null;

const richTextEditorSaveFailures = new Map<string, Exclude<RichTextEditorSaveFailure, null>>([
    [
        '当前原文或译文已被其他窗口更新；本次修改未保存也未签发。请刷新后查看最新版本，再重新编辑。',
        'changed-elsewhere',
    ],
    ['当前分段不处于译后复核，请刷新后再保存或签发', 'review-state-changed'],
    ['当前分段缺少并发版本，请刷新后重试', 'review-state-changed'],
]);

/**
 * Server Actions deliberately expose these exact optimistic-concurrency
 * states. Return a semantic token instead of rendering the caught error so
 * translated UI text remains the only user-visible output.
 */
export function resolveRichTextEditorSaveFailure(error: unknown): RichTextEditorSaveFailure {
    return richTextEditorSaveFailures.get(errorMessage(error)) ?? null;
}
