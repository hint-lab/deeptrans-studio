/**
 * Parse-result state shared by the server route and the initialization UI.
 * A non-empty HTML shell is not evidence that a document contains text that
 * can be segmented and translated, so the source text is authoritative here.
 */
export const DOCUMENT_INIT_PARSE_ERROR_PREFIX = 'ERROR:';
export const DOCUMENT_INIT_PARSER_FAILED_MARKER = `${DOCUMENT_INIT_PARSE_ERROR_PREFIX}PARSER_FAILED`;
export const DOCUMENT_INIT_EMPTY_DOCUMENT_CODE = 'EMPTY_DOCUMENT';
export const DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER = `${DOCUMENT_INIT_PARSE_ERROR_PREFIX}${DOCUMENT_INIT_EMPTY_DOCUMENT_CODE}`;
export const DOCUMENT_INIT_EMPTY_DOCUMENT_MESSAGE =
    '文档中没有可用于翻译的文本。请上传包含可复制正文的文件；扫描件请先完成 OCR 后再重试。';

export type DocumentInitParseOutcome =
    | {
          kind: 'empty-document';
          code: typeof DOCUMENT_INIT_EMPTY_DOCUMENT_CODE;
          previewMarker: typeof DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER;
      }
    | { kind: 'parsed' };

export type DocumentInitParsePreviewState = 'loading' | 'ready' | 'empty-document' | 'failed';

/** Treat whitespace and invisible formatting characters as no usable text. */
export function hasUsableDocumentText(value: unknown): boolean {
    return String(value ?? '').replace(/[\s\u00a0\u200b-\u200d\ufeff]/gu, '').length > 0;
}

/**
 * An empty source must never follow the normal parse-success path, even when
 * a parser produced an HTML container or a structured-artifact shell.
 */
export function resolveDocumentInitParseOutcome(content: unknown): DocumentInitParseOutcome {
    if (!hasUsableDocumentText(content)) {
        return {
            kind: 'empty-document',
            code: DOCUMENT_INIT_EMPTY_DOCUMENT_CODE,
            previewMarker: DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER,
        };
    }
    return { kind: 'parsed' };
}

export function isDocumentInitParseErrorMarker(value: unknown): boolean {
    return String(value ?? '').startsWith(DOCUMENT_INIT_PARSE_ERROR_PREFIX);
}

export function resolveDocumentInitParsePreviewState(
    previewHtml: unknown
): DocumentInitParsePreviewState {
    const value = String(previewHtml ?? '');
    if (!value.trim()) return 'loading';
    if (value === DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER) return 'empty-document';
    if (isDocumentInitParseErrorMarker(value)) return 'failed';
    return 'ready';
}

export function isDocumentInitParsePreviewAdvanceable(previewHtml: unknown): boolean {
    return resolveDocumentInitParsePreviewState(previewHtml) === 'ready';
}

export function resolveDocumentInitParseFailureMarker(code: unknown): string {
    return code === DOCUMENT_INIT_EMPTY_DOCUMENT_CODE
        ? DOCUMENT_INIT_EMPTY_DOCUMENT_MARKER
        : DOCUMENT_INIT_PARSER_FAILED_MARKER;
}
