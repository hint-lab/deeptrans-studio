import assert from 'node:assert/strict';
import test from 'node:test';

import { GuardError } from '@/lib/guards';
import { resolveChatProjectMemoryIds } from './chat-agent';

const owner = { userId: 'owner-a' };

test('reduces an internal project-memory scope failure to the public retrieval message', async () => {
    await assert.rejects(
        () =>
            resolveChatProjectMemoryIds('project-a', owner, async () => {
                throw new Error('database connection refused at private-host');
            }),
        error => {
            assert.ok(error instanceof Error);
            assert.equal(error.message, '检索服务暂不可用，请稍后重试');
            return true;
        }
    );
});

test('preserves explicit project authorization errors when resolving a memory scope', async () => {
    const guard = new GuardError(404, '项目不存在或无权访问');

    await assert.rejects(
        () =>
            resolveChatProjectMemoryIds('project-a', owner, async () => {
                throw guard;
            }),
        error => error === guard
    );
});

test('keeps an authorized empty bound scope explicit for downstream retrieval', async () => {
    const memoryIds = await resolveChatProjectMemoryIds('project-a', owner, async () => ({
        hasBindings: true,
        memoryIds: [],
    }));

    assert.deepEqual(memoryIds, []);
});
