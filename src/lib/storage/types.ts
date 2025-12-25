export interface StorageConfig {
    type: 'minio' | 'cos';
    endpoint: string;
    port?: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string; // 腾讯云 COS 需要
}

export interface UploadResult {
    fileName: string;
    originalName: string;
    uploadUrl: string;
    fileUrl: string;
}

export interface StorageService {
    getUploadUrl(fileName: string, contentType: string, projectName: string): Promise<UploadResult>;
    getFileUrl(fileName: string): Promise<string>;
}
