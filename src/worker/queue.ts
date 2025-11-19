import { type Job, Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

if (typeof window !== 'undefined') {
  throw new Error('src/lib/queue.ts 仅允许在服务端使用');
}

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
export const connection = new IORedis(redisUrl, {
  // BullMQ 要求：阻塞命令需将 maxRetriesPerRequest 设为 null
  maxRetriesPerRequest: null,
  // 避免就绪检查导致的延时/错误
  enableReadyCheck: false,
});

export const queues: Record<string, Queue> = {};
export function getQueue(name: string) {
  if (!queues[name]) {
    queues[name] = new Queue(name, { connection });
  }
  return queues[name];
}

export function createWorker(name: string, processor: (job: Job) => Promise<void>, concurrency = 10) {
  return new Worker(name, processor, { connection, concurrency });
}

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 2,
  backoff: { type: 'exponential', delay: 1000 },
};


