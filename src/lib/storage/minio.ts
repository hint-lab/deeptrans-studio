import { Client } from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { StorageConfig, StorageService, UploadResult } from './types';

export class MinioStorageService implements StorageService {
    private client: Client;
    private bucket: string;

    constructor(config: StorageConfig) {
        this.client = new Client({
            endPoint: config.endpoint,
            port: config.port,
            useSSL: config.useSSL,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
        });
        this.bucket = config.bucket;
    }

    async getUploadUrl(
        fileName: string,
        contentType: string,
        projectName: string
    ): Promise<UploadResult> {
        // 确保 bucket 存在
        const bucketExists = await this.client.bucketExists(this.bucket);
        if (!bucketExists) {
            await this.client.makeBucket(this.bucket);
        }

        // 生成唯一的文件名
        const fileExtension = fileName.split('.').pop();
        const uniqueFileName = `${projectName}/${uuidv4()}.${fileExtension}`;

        // 生成预签名上传 URL
        const uploadUrl = await this.client.presignedPutObject(
            this.bucket,
            uniqueFileName,
            24 * 60 * 60 // 24小时有效期
        );

        // 生成预签名访问 URL
        const fileUrl = await this.client.presignedGetObject(
            this.bucket,
            uniqueFileName,
            24 * 60 * 60 // 24小时有效期
        );

        return {
            fileName: uniqueFileName,
            originalName: fileName,
            uploadUrl,
            fileUrl,
        };
    }

    async getFileUrl(fileName: string): Promise<string> {
        return this.client.presignedGetObject(this.bucket, fileName, 24 * 60 * 60);
    }
}
