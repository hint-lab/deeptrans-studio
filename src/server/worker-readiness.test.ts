import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKER_HEARTBEAT_KEY } from '@/lib/worker-readiness';
import { readWorkerReadiness, startWorkerHeartbeat } from './worker-readiness';

class FakeRedis {
    readonly hashes = new Map<string, Record<string, string>>();
    readonly expiries = new Map<string, number>();

    async hgetall(key: string) {
        return { ...(this.hashes.get(key) || {}) };
    }

    async hset(key: string, field: string, value: string) {
        this.hashes.set(key, { ...(this.hashes.get(key) || {}), [field]: value });
        return 1;
    }

    async hdel(key: string, ...fields: string[]) {
        const next = { ...(this.hashes.get(key) || {}) };
        for (const field of fields) delete next[field];
        this.hashes.set(key, next);
        return 1;
    }

    async expire(key: string, seconds: number) {
        this.expiries.set(key, seconds);
        return 1;
    }
}

test('a worker heartbeat becomes readable after publication and is removed on a graceful stop', async () => {
    const redis = new FakeRedis();
    const heartbeat = await startWorkerHeartbeat(redis, {
        workerId: 'worker-a',
        queues: ['memory-import'],
        now: () => 1_750_000_000_000,
        intervalMs: 60_000,
    });

    assert.equal(redis.expiries.get(WORKER_HEARTBEAT_KEY), 180);
    assert.equal(
        (await readWorkerReadiness(redis, 'memory-import', 1_750_000_000_000)).status,
        'ready'
    );

    await heartbeat.stop();
    assert.equal(
        (await readWorkerReadiness(redis, 'memory-import', 1_750_000_000_000)).status,
        'unavailable'
    );
});

test('a heartbeat-read failure is reported as unavailable without exposing transport details', async () => {
    const redis = {
        async hgetall() {
            throw new Error('connection refused at internal host');
        },
    };

    assert.deepEqual(await readWorkerReadiness(redis, 'memory-import', 1_750_000_000_000), {
        status: 'unavailable',
        freshWorkers: 0,
        staleWorkers: 0,
    });
});
