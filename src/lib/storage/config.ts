import { DEFAULT_OBJECT_URL_EXPIRES_SECONDS } from '@/lib/storage/utils';
import type { StorageConfig, StorageProvider } from './types';

function parseBool(value: string | undefined, fallback: boolean) {
    if (value === undefined || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined) {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanDomain(value: string | undefined) {
    if (!value) return undefined;
    return value.replace(/^https?:\/\//i, '').replace(/\/+$/g, '') || undefined;
}

function storageTypeFromEnv(env: NodeJS.ProcessEnv): StorageProvider {
    const type = String(env.STORAGE_TYPE || 'minio').toLowerCase();
    if (type === 'cos') return 'cos';
    return 'minio';
}

export function getStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
    const type = storageTypeFromEnv(env);
    const uploadUrlExpiresSeconds =
        parseNumber(env.STORAGE_UPLOAD_URL_EXPIRES_SECONDS) ?? DEFAULT_OBJECT_URL_EXPIRES_SECONDS;
    const downloadUrlExpiresSeconds =
        parseNumber(env.STORAGE_DOWNLOAD_URL_EXPIRES_SECONDS) ?? DEFAULT_OBJECT_URL_EXPIRES_SECONDS;

    if (type === 'cos') {
        const useSSL = parseBool(env.COS_USE_SSL ?? env.STORAGE_USE_SSL, true);
        const domain = cleanDomain(env.COS_DOMAIN || env.STORAGE_DOMAIN);
        return {
            type,
            endpoint: domain,
            domain,
            useSSL,
            accessKey: env.COS_SECRET_ID || env.STORAGE_ACCESS_KEY || '',
            secretKey: env.COS_SECRET_KEY || env.STORAGE_SECRET_KEY || '',
            bucket: env.COS_BUCKET || env.STORAGE_BUCKET || '',
            region: env.COS_REGION || env.STORAGE_REGION,
            appId: env.COS_APP_ID || env.STORAGE_APP_ID,
            uploadUrlExpiresSeconds,
            downloadUrlExpiresSeconds,
        };
    }

    return {
        type,
        endpoint: env.STORAGE_ENDPOINT || env.MINIO_ENDPOINT || 'localhost',
        port: parseNumber(env.STORAGE_PORT ?? env.MINIO_PORT) ?? 9000,
        useSSL: parseBool(env.STORAGE_USE_SSL ?? env.MINIO_USE_SSL, false),
        accessKey:
            env.STORAGE_ACCESS_KEY || env.MINIO_ACCESS_KEY || env.MINIO_ROOT_USER || 'minioadmin',
        secretKey:
            env.STORAGE_SECRET_KEY ||
            env.MINIO_SECRET_KEY ||
            env.MINIO_ROOT_PASSWORD ||
            'minioadmin',
        bucket: env.STORAGE_BUCKET || env.MINIO_BUCKET || env.MINIO_BUCKET_NAME || 'deeptrans',
        region: env.STORAGE_REGION,
        uploadUrlExpiresSeconds,
        downloadUrlExpiresSeconds,
    };
}
