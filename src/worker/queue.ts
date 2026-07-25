import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';

if (typeof window !== 'undefined') {
    throw new Error('src/lib/queue.ts 仅允许在服务端使用');
}

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
let connection: IORedis | null = null;

export function getQueueConnection() {
    if (!connection) {
        connection = new IORedis(redisUrl, {
            // BullMQ 要求：阻塞命令需将 maxRetriesPerRequest 设为 null
            maxRetriesPerRequest: null,
            // 避免就绪检查导致的延时/错误
            enableReadyCheck: false,
        });
    }
    return connection;
}

export const queues: Record<string, Queue> = {};
export function getQueue(name: string) {
    if (!queues[name]) {
        queues[name] = new Queue(name, { connection: getQueueConnection() });
    }
    return queues[name];
}

export function createWorker<DataType = any, ResultType = void, NameType extends string = string>(
    name: NameType,
    processor: Processor<DataType, ResultType, NameType>,
    concurrency = 10
) {
    return new Worker<DataType, ResultType, NameType>(name, processor, {
        connection: getQueueConnection(),
        concurrency,
    });
}

export const defaultJobOpts: JobsOptions = {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
};
