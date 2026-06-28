import { v4 as uuidv4 } from 'uuid';

export const DEFAULT_OBJECT_URL_EXPIRES_SECONDS = 24 * 60 * 60;

export function normalizeNamespace(namespace: string) {
    return String(namespace || '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/+/g, '/');
}

export function buildObjectKey(originalName: string, namespace: string) {
    const cleanNamespace = normalizeNamespace(namespace);
    const baseName = String(originalName || '').split(/[\\/]/).filter(Boolean).pop() || 'file';
    const extensionMatch = /\.([A-Za-z0-9]{1,16})$/.exec(baseName);
    const extension = extensionMatch ? `.${extensionMatch[1]}` : '';
    const objectName = `${uuidv4()}${extension}`;
    return cleanNamespace ? `${cleanNamespace}/${objectName}` : objectName;
}

export function streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Buffer | Uint8Array | string) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        );
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

