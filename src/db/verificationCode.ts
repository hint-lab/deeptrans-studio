// src/db/verification-code.ts (存入 Redis 而非数据库)
// 使用独立的 Redis 客户端（仅 Node 环境懒加载）
import type { Redis } from 'ioredis';

const loadRedisClient = async (): Promise<Redis> => {
    const { getRedis } = await import('@/lib/redis');
    return getRedis();
};

const PHONE_PREFIX = 'verify:phone:';
const EMAIL_PREFIX = 'verify:email:';
const EMAIL_SEND_COOLDOWN_PREFIX = 'verify:email:send-cooldown:';
const EMAIL_SEND_COOLDOWN_SECONDS = 60;
const EMAIL_VERIFICATION_CODE_TTL_SECONDS = 2 * 60;

type VerificationResult = { success: true } | { success: false; error: string };

interface PhoneVerificationPayload {
    phone: string;
    code: string;
    expiresAt?: Date;
}

interface EmailVerificationPayload {
    email: string;
    code: string;
    expiresAt?: Date;
}

export type EmailSendCooldownResult =
    | { allowed: true }
    | { allowed: false; retryAfterSeconds: number }
    | { allowed: false; unavailable: true };

export type EmailVerificationStore = Pick<Redis, 'set' | 'get' | 'ttl' | 'del' | 'eval'>;

/**
 * Email addresses are a case-insensitive identity in the verification flow.
 * Keep the Redis key canonical even when a client submits a differently-cased
 * address at send, registration, or sign-in time.
 */
export const normalizeEmailForVerification = (email: string): string => email.trim().toLowerCase();

const buildErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : JSON.stringify(error);
};

const computeExpiresAt = (ttlSeconds: number): Date | undefined => {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return undefined;
    return new Date(Date.now() + ttlSeconds * 1000);
};

export async function createVerificationCode(
    phone: string,
    code: string
): Promise<VerificationResult> {
    const key = `${PHONE_PREFIX}${phone}`;
    // 2 分钟有效
    const ttlSeconds = 2 * 60;
    try {
        const connection = await loadRedisClient();
        await connection.set(key, code, 'EX', ttlSeconds);
        return { success: true } as const satisfies VerificationResult;
    } catch (e) {
        return {
            success: false,
            error: buildErrorMessage(e),
        } as const satisfies VerificationResult;
    }
}

export async function getVerificationCodeByPhone(
    phone: string
): Promise<PhoneVerificationPayload | null> {
    try {
        const connection = await loadRedisClient();
        const key = `${PHONE_PREFIX}${phone}`;
        const value = await connection.get(key);
        if (!value) return null;
        const ttl = await connection.ttl(key);
        const payload: PhoneVerificationPayload = {
            phone,
            code: value,
            expiresAt: computeExpiresAt(ttl),
        };
        return payload;
    } catch {
        return null;
    }
}

// 邮箱验证码：存入 Redis
export async function createEmailVerificationCode(
    email: string,
    code: string,
    store?: EmailVerificationStore
): Promise<VerificationResult> {
    const normalizedEmail = normalizeEmailForVerification(email);
    if (!normalizedEmail || !code) {
        return { success: false, error: 'Email and code are required' };
    }

    const key = `${EMAIL_PREFIX}${normalizedEmail}`;
    const ttlSeconds = EMAIL_VERIFICATION_CODE_TTL_SECONDS;
    try {
        const connection = store ?? (await loadRedisClient());
        await connection.set(key, code, 'EX', ttlSeconds);
        return { success: true } as const satisfies VerificationResult;
    } catch (e) {
        return {
            success: false,
            error: buildErrorMessage(e),
        } as const satisfies VerificationResult;
    }
}

/**
 * Atomically reserves a short server-side resend window. Client-side countdowns
 * are only presentation; this prevents retries or scripts from repeatedly
 * opening SMTP authentication sessions for the same mailbox.
 */
export async function reserveEmailVerificationSend(
    email: string,
    store?: EmailVerificationStore
): Promise<EmailSendCooldownResult> {
    const normalizedEmail = normalizeEmailForVerification(email);
    const key = `${EMAIL_SEND_COOLDOWN_PREFIX}${normalizedEmail}`;

    try {
        const connection = store ?? (await loadRedisClient());
        const reserved = await connection.set(key, '1', 'EX', EMAIL_SEND_COOLDOWN_SECONDS, 'NX');

        if (reserved === 'OK') return { allowed: true };

        const ttl = await connection.ttl(key);
        return {
            allowed: false,
            retryAfterSeconds: ttl > 0 ? ttl : EMAIL_SEND_COOLDOWN_SECONDS,
        };
    } catch {
        return {
            allowed: false,
            unavailable: true,
        };
    }
}

/** Release a reservation when a code could not be persisted or delivered. */
export async function releaseEmailVerificationSend(
    email: string,
    store?: EmailVerificationStore
): Promise<void> {
    const normalizedEmail = normalizeEmailForVerification(email);
    const key = `${EMAIL_SEND_COOLDOWN_PREFIX}${normalizedEmail}`;

    try {
        const connection = store ?? (await loadRedisClient());
        await connection.del(key);
    } catch {
        // Verification-code storage also depends on Redis. There is no safe
        // fallback store for the cooldown, so keep this best-effort cleanup quiet.
    }
}

/**
 * Clear only the code issued by the failed attempt. The Lua compare-and-delete
 * avoids erasing a newer code if two request lifecycles ever overlap.
 */
export async function clearEmailVerificationCodeIfMatches(
    email: string,
    code: string,
    store?: EmailVerificationStore
): Promise<void> {
    const normalizedEmail = normalizeEmailForVerification(email);
    const normalizedCode = code.trim();
    if (!normalizedEmail || !normalizedCode) return;

    try {
        const connection = store ?? (await loadRedisClient());
        await connection.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
            1,
            `${EMAIL_PREFIX}${normalizedEmail}`,
            normalizedCode
        );
    } catch {
        // Redis is unavailable or the key was already replaced/expired. Never
        // surface this cleanup detail to callers or overwrite a newer code.
    }
}

/**
 * Atomically compare and consume an email verification code. A GET followed by
 * DEL would allow concurrent sign-in requests to both observe the same code;
 * this Lua operation makes exactly one matching request win.
 */
export async function consumeEmailVerificationCode(
    email: string,
    code: string,
    store?: EmailVerificationStore
): Promise<boolean> {
    const normalizedEmail = normalizeEmailForVerification(email);
    const normalizedCode = code.trim();
    if (!normalizedEmail || !normalizedCode) return false;

    try {
        const connection = store ?? (await loadRedisClient());
        const result = await connection.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
            1,
            `${EMAIL_PREFIX}${normalizedEmail}`,
            normalizedCode
        );
        return Number(result) === 1;
    } catch {
        // Fail closed: an unavailable store must never turn a one-time code
        // into a reusable authentication credential.
        return false;
    }
}

export async function getVerificationCodeByEmail(
    email: string,
    store?: Pick<Redis, 'get' | 'ttl'>
): Promise<EmailVerificationPayload | null> {
    const normalizedEmail = normalizeEmailForVerification(email);
    if (!normalizedEmail) return null;

    try {
        const connection = store ?? (await loadRedisClient());
        const key = `${EMAIL_PREFIX}${normalizedEmail}`;
        const value = await connection.get(key);
        if (!value) return null;
        const ttl = await connection.ttl(key);
        const payload: EmailVerificationPayload = {
            email: normalizedEmail,
            code: value,
            expiresAt: computeExpiresAt(ttl),
        };
        return payload;
    } catch {
        return null;
    }
}
