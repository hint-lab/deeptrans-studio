export type StorageProvider = 'minio' | 'cos';

export type PutObjectInput = {
    fileName: string;
    body: Buffer | Uint8Array | string;
    contentType?: string;
};

export interface StorageConfig {
    type: StorageProvider;
    endpoint?: string;
    port?: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string;
    appId?: string;
    domain?: string;
    uploadUrlExpiresSeconds?: number;
    downloadUrlExpiresSeconds?: number;
}

export interface UploadResult {
    fileName: string;
    originalName: string;
    uploadUrl: string;
    fileUrl: string;
}

export interface StorageService {
    getUploadUrl(fileName: string, contentType: string, namespace: string): Promise<UploadResult>;
    getFileUrl(fileName: string): Promise<string>;
    getObjectBuffer(fileName: string): Promise<Buffer>;
    putObject(input: PutObjectInput): Promise<{ fileName: string }>;
}
