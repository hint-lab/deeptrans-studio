// Redis TTL helpers

export const TTL_PROGRESS = Number(process.env.REDIS_TTL_PROGRESS ?? 1200); // 20m
export const TTL_PREVIEW = Number(process.env.REDIS_TTL_PREVIEW ?? 1200);   // 20m
export const TTL_BATCH = Number(process.env.REDIS_TTL_BATCH ?? 3600);       // 1h

export async function setTextWithTTL(conn: any, key: string, value: string, ttlSec: number) {
  await conn.set(key, value, 'EX', Math.max(60, Number(ttlSec ?? 0)));
}

export async function setJSONWithTTL(conn: any, key: string, obj: unknown, ttlSec: number) {
  await conn.set(key, JSON.stringify(obj), 'EX', Math.max(60, Number(ttlSec ?? 0)));
}


