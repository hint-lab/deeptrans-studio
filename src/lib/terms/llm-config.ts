export const DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS = 90000;
export const MAX_DOCUMENT_TERMS_LLM_TIMEOUT_MS = 300000;

export function documentTermsLlmTimeoutMs(
    raw: string | undefined = process.env.DOCUMENT_TERMS_LLM_TIMEOUT_MS
): number {
    if (!raw?.trim()) return DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
        ? Math.min(MAX_DOCUMENT_TERMS_LLM_TIMEOUT_MS, Math.max(1000, Math.trunc(parsed)))
        : DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS;
}
