import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        DATABASE_URL: z.url(),
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        AUTH_SECRET: process.env.NODE_ENV === 'production' ? z.string() : z.string().optional(),
        GITHUB_CLIENT_ID: z.string(),
        GITHUB_CLIENT_SECRET: z.string(),

        // queues + LLM
        REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
        OPENAI_API_KEY: z.string(),
        OPENAI_BASE_URL: z.url().optional(),
        OPENAI_API_MODEL: z.string().default('gpt-4o-mini'),

        // internal HTTP base for tools (e.g., dictionary lookup)
        DICTIONARY_API_URL: z.url().default('http://localhost:3000'),

        // Object storage（可选，STORAGE_TYPE=minio|cos）
        STORAGE_TYPE: z.enum(['minio', 'cos']).optional(),
        STORAGE_ENDPOINT: z.string().optional(),
        STORAGE_PORT: z.string().optional(),
        STORAGE_USE_SSL: z.string().optional(),
        STORAGE_ACCESS_KEY: z.string().optional(),
        STORAGE_SECRET_KEY: z.string().optional(),
        STORAGE_BUCKET: z.string().optional(),
        STORAGE_REGION: z.string().optional(),
        STORAGE_APP_ID: z.string().optional(),
        STORAGE_DOMAIN: z.string().optional(),
        STORAGE_UPLOAD_URL_EXPIRES_SECONDS: z.string().optional(),
        STORAGE_DOWNLOAD_URL_EXPIRES_SECONDS: z.string().optional(),
        MINIO_ACCESS_KEY: z.string().optional(),
        MINIO_SECRET_KEY: z.string().optional(),
        MINIO_BUCKET: z.string().optional(),
        MINIO_BROWSER_REDIRECT_URL: z.url().optional(),
        COS_SECRET_ID: z.string().optional(),
        COS_SECRET_KEY: z.string().optional(),
        COS_BUCKET: z.string().optional(),
        COS_REGION: z.string().optional(),
        COS_APP_ID: z.string().optional(),
        COS_DOMAIN: z.string().optional(),
        COS_USE_SSL: z.string().optional(),
    },

    client: {
        // NEXT_PUBLIC_* 放这里
    },

    runtimeEnv: {
        DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
        NODE_ENV: process.env.NODE_ENV,
        AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? process.env.GITHUB_ID,
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? process.env.GITHUB_SECRET,

        REDIS_URL: process.env.REDIS_URL,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        OPENAI_API_MODEL: process.env.OPENAI_API_MODEL,

        STORAGE_TYPE: process.env.STORAGE_TYPE,
        STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
        STORAGE_PORT: process.env.STORAGE_PORT,
        STORAGE_USE_SSL: process.env.STORAGE_USE_SSL,
        STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
        STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
        STORAGE_BUCKET: process.env.STORAGE_BUCKET,
        STORAGE_REGION: process.env.STORAGE_REGION,
        STORAGE_APP_ID: process.env.STORAGE_APP_ID,
        STORAGE_DOMAIN: process.env.STORAGE_DOMAIN,
        STORAGE_UPLOAD_URL_EXPIRES_SECONDS: process.env.STORAGE_UPLOAD_URL_EXPIRES_SECONDS,
        STORAGE_DOWNLOAD_URL_EXPIRES_SECONDS: process.env.STORAGE_DOWNLOAD_URL_EXPIRES_SECONDS,
        MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
        MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
        MINIO_BUCKET: process.env.MINIO_BUCKET,
        MINIO_BROWSER_REDIRECT_URL: process.env.MINIO_BROWSER_REDIRECT_URL,
        COS_SECRET_ID: process.env.COS_SECRET_ID,
        COS_SECRET_KEY: process.env.COS_SECRET_KEY,
        COS_BUCKET: process.env.COS_BUCKET,
        COS_REGION: process.env.COS_REGION,
        COS_APP_ID: process.env.COS_APP_ID,
        COS_DOMAIN: process.env.COS_DOMAIN,
        COS_USE_SSL: process.env.COS_USE_SSL,
        DICTIONARY_API_URL: process.env.DICTIONARY_API_URL,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
