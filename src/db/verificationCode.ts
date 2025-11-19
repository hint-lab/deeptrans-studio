// src/db/verification-code.ts (存入 Redis 而非数据库)
// 使用独立的 Redis 客户端（仅 Node 环境懒加载）
import type { Redis } from "ioredis";

const loadRedisClient = async (): Promise<Redis> => {
  const { getRedis } = await import("@/lib/redis");
  return getRedis();
};

const PHONE_PREFIX = "verify:phone:";
const EMAIL_PREFIX = "verify:email:";

type VerificationResult =
  | { success: true }
  | { success: false; error: string };

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

const buildErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
};

const computeExpiresAt = (ttlSeconds: number): Date | undefined => {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return undefined;
  return new Date(Date.now() + ttlSeconds * 1000);
};

export async function createVerificationCode(phone: string, code: string): Promise<VerificationResult> {
  const key = `${PHONE_PREFIX}${phone}`;
  // 2 分钟有效
  const ttlSeconds = 2 * 60;
  try {
    const connection = await loadRedisClient();
    await connection.set(key, code, "EX", ttlSeconds);
    return { success: true } as const satisfies VerificationResult;
  } catch (e) {
    return { success: false, error: buildErrorMessage(e) } as const satisfies VerificationResult;
  }
}

export async function getVerificationCodeByPhone(phone: string): Promise<PhoneVerificationPayload | null> {
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
export async function createEmailVerificationCode(email: string, code: string): Promise<VerificationResult> {
  const key = `${EMAIL_PREFIX}${email}`;
  const ttlSeconds = 2 * 60;
  try {
    const connection = await loadRedisClient();
    await connection.set(key, code, "EX", ttlSeconds);
    return { success: true } as const satisfies VerificationResult;
  } catch (e) {
    return { success: false, error: buildErrorMessage(e) } as const satisfies VerificationResult;
  }
}

export async function getVerificationCodeByEmail(email: string): Promise<EmailVerificationPayload | null> {
  try {
    const connection = await loadRedisClient();
    const key = `${EMAIL_PREFIX}${email}`;
    const value = await connection.get(key);
    if (!value) return null;
    const ttl = await connection.ttl(key);
    const payload: EmailVerificationPayload = {
      email,
      code: value,
      expiresAt: computeExpiresAt(ttl),
    };
    return payload;
  } catch {
    return null;
  }
}