import assert from 'node:assert/strict';
import test from 'node:test';

import { runCancelableSequence } from './batch-signoff-sequence';

test('does not start later sign-off writes after cancellation is requested', async () => {
    let canceled = false;
    const written: string[] = [];

    const result = await runCancelableSequence(
        ['item-1', 'item-2', 'item-3'],
        async item => {
            written.push(item);
            if (item === 'item-1') canceled = true;
        },
        () => canceled
    );

    assert.deepEqual(written, ['item-1']);
    assert.deepEqual(result, { processed: 1, remaining: 2, canceled: true });
});

test('does not begin any write when cancellation was already requested', async () => {
    const written: string[] = [];

    const result = await runCancelableSequence(
        ['item-1'],
        async item => {
            written.push(item);
        },
        () => true
    );

    assert.deepEqual(written, []);
    assert.deepEqual(result, { processed: 0, remaining: 1, canceled: true });
});

test('finishes the already-started sign-off pair before canceling later items', async () => {
    let canceled = false;
    const writes: string[] = [];
    let releaseCurrentItem: (() => void) | undefined;
    let observeCurrentItemStart: (() => void) | undefined;
    const currentItemStarted = new Promise<void>(resolve => {
        observeCurrentItemStart = resolve;
    });
    const allowCurrentItemToFinish = new Promise<void>(resolve => {
        releaseCurrentItem = resolve;
    });

    const resultPromise = runCancelableSequence(
        ['item-1', 'item-2'],
        async item => {
            writes.push(`status:${item}`);
            observeCurrentItemStart?.();
            await allowCurrentItemToFinish;
            writes.push(`audit:${item}`);
        },
        () => canceled
    );

    await currentItemStarted;
    canceled = true;
    releaseCurrentItem?.();

    const result = await resultPromise;
    assert.deepEqual(writes, ['status:item-1', 'audit:item-1']);
    assert.deepEqual(result, { processed: 1, remaining: 1, canceled: true });
});

test('does not report all-success when cancellation arrives during the final item', async () => {
    let canceled = false;

    const result = await runCancelableSequence(
        ['item-1'],
        async () => {
            canceled = true;
        },
        () => canceled
    );

    assert.deepEqual(result, { processed: 1, remaining: 0, canceled: true });
});

test('reports a completed sequence when no cancellation is requested', async () => {
    const written: string[] = [];

    const result = await runCancelableSequence(
        ['item-1', 'item-2'],
        async item => {
            written.push(item);
        },
        () => false
    );

    assert.deepEqual(written, ['item-1', 'item-2']);
    assert.deepEqual(result, { processed: 2, remaining: 0, canceled: false });
});
