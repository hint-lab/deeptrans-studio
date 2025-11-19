// 统一的 Redis 客户端（仅在 Node.js 环境懒加载 ioredis）
// 注意：不要在 Edge Runtime（如 middleware）中调用本模块提供的 getRedis，
// 仅在 Node 路由、Server Actions、后端任务中使用。

import type { Redis } from "ioredis";

let singleton: Redis | null = null;

export async function getRedis(): Promise<Redis> {
  if (singleton) return singleton;
  // 动态引入 ioredis，避免在不需要的环境（Edge）被打包/执行
  const { default: IORedis } = await import("ioredis");
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  singleton = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return singleton;
}

