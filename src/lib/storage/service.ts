import { getStorageConfigFromEnv } from '@/lib/storage/config';
import { createStorageService } from '@/lib/storage/factory';
import type { StorageService } from '@/lib/storage/types';

let storageService: StorageService | null = null;

export function getStorageService() {
    if (!storageService) {
        storageService = createStorageService(getStorageConfigFromEnv());
    }
    return storageService;
}
