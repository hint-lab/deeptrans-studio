import COS from 'cos-nodejs-sdk-v5';
import { PutObjectInput, StorageConfig, StorageService, UploadResult } from './types';
import { DEFAULT_OBJECT_URL_EXPIRES_SECONDS, buildObjectKey } from './utils';

export class CosStorageService implements StorageService {
    private client: COS;
    private bucket: string;
    private region: string;
    private domain?: string;
    private protocol: 'http:' | 'https:';
    private uploadUrlExpiresSeconds: number;
    private downloadUrlExpiresSeconds: number;

    constructor(config: StorageConfig) {
        if (!config.accessKey) throw new Error('COS 缺少 SecretId');
        if (!config.secretKey) throw new Error('COS 缺少 SecretKey');
        if (!config.bucket) throw new Error('COS 缺少 Bucket');
        if (!config.region) throw new Error('COS 缺少 Region');

        this.bucket = normalizeCosBucket(config.bucket, config.appId);
        this.region = config.region;
        this.domain = config.domain || config.endpoint;
        this.protocol = config.useSSL ? 'https:' : 'http:';
        this.uploadUrlExpiresSeconds =
            config.uploadUrlExpiresSeconds || DEFAULT_OBJECT_URL_EXPIRES_SECONDS;
        this.downloadUrlExpiresSeconds =
            config.downloadUrlExpiresSeconds || DEFAULT_OBJECT_URL_EXPIRES_SECONDS;

        this.client = new COS({
            SecretId: config.accessKey,
            SecretKey: config.secretKey,
            ...(this.domain ? { Domain: this.domain } : {}),
            Protocol: this.protocol,
        });
    }

    async getUploadUrl(
        fileName: string,
        contentType: string,
        namespace: string
    ): Promise<UploadResult> {
        const key = buildObjectKey(fileName, namespace);
        const uploadUrl = this.getSignedObjectUrl(key, 'PUT', this.uploadUrlExpiresSeconds);
        const fileUrl = this.getSignedObjectUrl(key, 'GET', this.downloadUrlExpiresSeconds);

        return {
            fileName: key,
            originalName: fileName,
            uploadUrl,
            fileUrl,
        };
    }

    async getFileUrl(fileName: string): Promise<string> {
        return this.getSignedObjectUrl(fileName, 'GET', this.downloadUrlExpiresSeconds);
    }

    async getObjectBuffer(fileName: string): Promise<Buffer> {
        const data = await this.client.getObject({
            Bucket: this.bucket,
            Region: this.region,
            Key: fileName,
        });
        return Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body as any);
    }

    async putObject(input: PutObjectInput): Promise<{ fileName: string }> {
        const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
        await this.client.putObject({
            Bucket: this.bucket,
            Region: this.region,
            Key: input.fileName,
            Body: body,
            ContentLength: body.length,
            ...(input.contentType ? { ContentType: input.contentType } : {}),
        });
        return { fileName: input.fileName };
    }

    private getSignedObjectUrl(key: string, method: 'GET' | 'PUT', expires: number) {
        return this.client.getObjectUrl({
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Method: method,
            Sign: true,
            Expires: expires,
            ...(this.domain ? { Domain: this.domain } : {}),
            Protocol: this.protocol,
        });
    }
}

function normalizeCosBucket(bucket: string, appId?: string) {
    const trimmed = bucket.trim();
    if (!appId || /-\d{5,}$/.test(trimmed)) return trimmed;
    return `${trimmed}-${appId}`;
}
