import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQueueRedisUrl } from './queue';

test('queue endpoint is resolved when a worker starts, not when this module loads', () => {
    const env = {} as NodeJS.ProcessEnv;
    assert.equal(resolveQueueRedisUrl(env), 'redis://127.0.0.1:6379');

    env.REDIS_URL = 'redis://127.0.0.1:56379';
    assert.equal(resolveQueueRedisUrl(env), 'redis://127.0.0.1:56379');
});

test('queue endpoint trims a configured Redis URL before connecting', () => {
    assert.equal(
        resolveQueueRedisUrl({
            NODE_ENV: 'test',
            REDIS_URL: '  rediss://queue.example.test:6380/0  ',
        }),
        'rediss://queue.example.test:6380/0'
    );
});
