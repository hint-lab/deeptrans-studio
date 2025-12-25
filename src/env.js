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

        // MinIO（可选）
        MINIO_ACCESS_KEY: z.string().optional(),
        MINIO_SECRET_KEY: z.string().optional(),
        MINIO_BUCKET: z.string().optional(),
        MINIO_BROWSER_REDIRECT_URL: z.url().optional(),
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

        MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
        MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
        MINIO_BUCKET: process.env.MINIO_BUCKET,
        MINIO_BROWSER_REDIRECT_URL: process.env.MINIO_BROWSER_REDIRECT_URL,
        DICTIONARY_API_URL: process.env.DICTIONARY_API_URL,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
