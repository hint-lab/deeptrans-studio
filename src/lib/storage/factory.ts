import { StorageConfig, StorageService } from './types';
import { MinioStorageService } from './minio';

export function createStorageService(config: StorageConfig): StorageService {
    switch (config.type) {
        case 'minio':
            return new MinioStorageService(config);
        default:
            throw new Error(`不支持的存储类型: ${config.type}`);
    }
}
