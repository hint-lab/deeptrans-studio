import { StorageConfig, StorageService } from './types';
import { MinioStorageService } from './minio';
import { CosStorageService } from './cos';

export function createStorageService(config: StorageConfig): StorageService {
    switch (config.type) {
        case 'minio':
            return new MinioStorageService(config);
        case 'cos':
            return new CosStorageService(config);
        default:
            throw new Error(`不支持的存储类型: ${config.type}`);
    }
}
