import { Client } from 'minio';
import { PutObjectInput, StorageConfig, StorageService, UploadResult } from './types';
import {
    DEFAULT_OBJECT_URL_EXPIRES_SECONDS,
    buildObjectKey,
    streamToBuffer,
} from './utils';

export class MinioStorageService implements StorageService {
    private client: Client;
    private bucket: string;
    private uploadUrlExpiresSeconds: number;
    private downloadUrlExpiresSeconds: number;

    constructor(config: StorageConfig) {
        this.client = new Client({
            endPoint: config.endpoint || 'localhost',
            port: config.port,
            useSSL: config.useSSL,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
        });
        this.bucket = config.bucket;
        this.uploadUrlExpiresSeconds =
            config.uploadUrlExpiresSeconds || DEFAULT_OBJECT_URL_EXPIRES_SECONDS;
        this.downloadUrlExpiresSeconds =
            config.downloadUrlExpiresSeconds || DEFAULT_OBJECT_URL_EXPIRES_SECONDS;
    }

    async getUploadUrl(
        fileName: string,
        contentType: string,
        namespace: string
    ): Promise<UploadResult> {
        // 确保 bucket 存在
        const bucketExists = await this.client.bucketExists(this.bucket);
        if (!bucketExists) {
            await this.client.makeBucket(this.bucket);
        }

        const uniqueFileName = buildObjectKey(fileName, namespace);
        const expires = this.getUploadUrlExpiresSeconds();

        // 生成预签名上传 URL
        const uploadUrl = await this.client.presignedPutObject(
            this.bucket,
            uniqueFileName,
            expires
        );

        // 生成预签名访问 URL
        const fileUrl = await this.client.presignedGetObject(
            this.bucket,
            uniqueFileName,
            this.getDownloadUrlExpiresSeconds()
        );

        return {
            fileName: uniqueFileName,
            originalName: fileName,
            uploadUrl,
            fileUrl,
        };
    }

    async getFileUrl(fileName: string): Promise<string> {
        return this.client.presignedGetObject(
            this.bucket,
            fileName,
            this.getDownloadUrlExpiresSeconds()
        );
    }

    async getObjectBuffer(fileName: string): Promise<Buffer> {
        const stream = await this.client.getObject(this.bucket, fileName);
        return streamToBuffer(stream);
    }

    async putObject(input: PutObjectInput): Promise<{ fileName: string }> {
        const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
        await this.client.putObject(this.bucket, input.fileName, body, body.length, {
            ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
        });
        return { fileName: input.fileName };
    }

    private getUploadUrlExpiresSeconds() {
        return this.uploadUrlExpiresSeconds;
    }

    private getDownloadUrlExpiresSeconds() {
        return this.downloadUrlExpiresSeconds;
    }
}
