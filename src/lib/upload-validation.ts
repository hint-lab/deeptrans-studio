/**
 * Server-side upload metadata validation. Browser dropzone rules are useful
 * UX, but they are not an authorization or type boundary because a Server
 * Action can be called without that component.
 */
const CONTENT_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
    pdf: ['application/pdf'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    txt: ['text/plain'],
    md: ['text/markdown', 'text/plain'],
    markdown: ['text/markdown', 'text/plain'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    // Project initialization stores generated preview artifacts through the
    // same authenticated upload path.
    html: ['text/html'],
    json: ['application/json', 'text/json'],
};

const GENERIC_BROWSER_CONTENT_TYPES = new Set(['', 'application/octet-stream']);

function extensionFromFileName(fileName: string) {
    const baseName = String(fileName || '')
        .split(/[\\/]/)
        .filter(Boolean)
        .pop();
    const match = /\.([a-z0-9]{1,16})$/i.exec(baseName || '');
    return match?.[1]?.toLowerCase() || '';
}

/**
 * Returns the canonical content type for a permitted filename/type pair, or
 * null when the request must be rejected. Canonicalizing avoids storing a
 * client-supplied `text/html` label on an unrelated extension.
 */
export function resolveUploadContentType(fileName: string, declaredContentType: string) {
    const extension = extensionFromFileName(fileName);
    const acceptedTypes = CONTENT_TYPES_BY_EXTENSION[extension];
    if (!acceptedTypes) return null;

    const declared = String(declaredContentType || '')
        .split(';', 1)[0]
        ?.trim()
        .toLowerCase();
    if (declared && !GENERIC_BROWSER_CONTENT_TYPES.has(declared) && !acceptedTypes.includes(declared)) {
        return null;
    }

    return acceptedTypes[0] || null;
}
