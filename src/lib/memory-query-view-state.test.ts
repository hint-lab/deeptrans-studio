import assert from 'node:assert/strict';
import test from 'node:test';

import {
    failedMemoryQueryView,
    isMemoryQueryViewCurrent,
    readyMemoryQueryView,
    resolveMemoryQueryView,
    type MemoryQueryRequest,
} from './memory-query-view-state';

function request(overrides: Partial<MemoryQueryRequest> = {}): MemoryQueryRequest {
    return {
        memoryId: 'memory-a',
        mode: 'search',
        query: 'contract',
        page: 1,
        pageSize: 50,
        searchConfigKey: '{"mode":"hybrid"}',
        similarityThreshold: 0.3,
        maxResults: 50,
        refreshVersion: 0,
        ...overrides,
    };
}

test('does not treat a previous library result as the current library result', () => {
    const previous = readyMemoryQueryView(request());
    const nextRequest = request({ memoryId: 'memory-b' });

    assert.equal(isMemoryQueryViewCurrent(previous, nextRequest), false);
    assert.deepEqual(resolveMemoryQueryView(previous, nextRequest), {
        requestKey: JSON.stringify([
            'memory-b',
            'search',
            'contract',
            1,
            50,
            '{"mode":"hybrid"}',
            0.3,
            50,
            0,
        ]),
        memoryId: 'memory-b',
        mode: 'search',
        status: 'loading',
    });
});

test('invalidates an old result when query controls change', () => {
    const previous = readyMemoryQueryView(request());
    const nextRequest = request({ similarityThreshold: 0.8, refreshVersion: 1 });

    assert.equal(isMemoryQueryViewCurrent(previous, nextRequest), false);
    assert.equal(resolveMemoryQueryView(previous, nextRequest).status, 'loading');
});

test('keeps a current request failure distinct from an empty result', () => {
    const current = request({ mode: 'browse', query: '' });
    const failure = failedMemoryQueryView(current, '加载记忆库内容失败，请稍后重试。');

    assert.equal(resolveMemoryQueryView(failure, current).status, 'error');
    assert.equal(resolveMemoryQueryView(failure, current).message, '加载记忆库内容失败，请稍后重试。');
});
