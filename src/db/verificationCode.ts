// src/db/verification-code.ts (存入 Redis 而非数据库)
// 使用独立的 Redis 客户端（仅 Node 环境懒加载）
const getRedis = async () => (await import("@/lib/redis")).getRedis()
import { v4 as uuidv4 } from "uuid";

const PHONE_PREFIX = "verify:phone:";
const EMAIL_PREFIX = "verify:email:";

export async function createVerificationCode(phone: string, code: string) {
  const key = `${PHONE_PREFIX}${phone}`;
  // 2 分钟有效
  const ttlSeconds = 2 * 60;
  try {
    const connection = await getRedis();
    await connection.set(key, code, "EX", ttlSeconds);
    return { success: true } as const;
  } catch (e) {
    return { success: false, error: (e as any)?.message || String(e) } as const;
  }
}

export async function getVerificationCodeByPhone(phone: string) {
  try {
    const connection = await getRedis();
    const val = await connection.get(`${PHONE_PREFIX}${phone}`);
    if (!val) return null;
    return { phone, code: val, expires: undefined } as any;
  } catch {
    return null;
  }
}

// 邮箱验证码：存入 Redis
export async function createEmailVerificationCode(email: string, code: string) {
  const key = `${EMAIL_PREFIX}${email}`;
  const ttlSeconds = 2 * 60;
  try {
    const connection = await getRedis();
    await connection.set(key, code, "EX", ttlSeconds);
    return { success: true } as const;
  } catch (e) {
    return { success: false, error: (e as any)?.message || String(e) } as const;
  }
}

export async function getVerificationCodeByEmail(email: string) {
  try {
    const connection = await getRedis();
    const val = await connection.get(`${EMAIL_PREFIX}${email}`);
    if (!val) return null;
    return { email, code: val, expires: undefined } as any;
  } catch {
    return null;
  }
}