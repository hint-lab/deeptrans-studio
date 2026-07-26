import assert from 'node:assert/strict';
import test from 'node:test';

import {
    chatStreamConversationId,
    chatStreamError,
    chatStreamText,
    chatStreamTurnStatus,
    createChatGenerationAbortController,
    createRetryableChatGenerationRelease,
    createSseDataDecoder,
    encodeChatStreamEvent,
    isPersistedChatTurn,
    isChatStreamCurrent,
    parseChatStreamPayload,
    resolveChatStreamUpdate,
    shouldSuppressChatStreamError,
} from './chat-stream';

test('generation abort bridge stops on a request disconnect and can be disposed', () => {
    const request = new AbortController();
    const generation = createChatGenerationAbortController(request.signal);

    assert.equal(generation.signal.aborted, false);
    request.abort();
    assert.equal(generation.signal.aborted, true);

    const detachedRequest = new AbortController();
    const detachedGeneration = createChatGenerationAbortController(detachedRequest.signal);
    detachedGeneration.dispose();
    detachedRequest.abort();
    assert.equal(detachedGeneration.signal.aborted, false);
    detachedGeneration.abort();
    assert.equal(detachedGeneration.signal.aborted, true);
});

test('generation lease release retries a transient failure and remains idempotent afterwards', async () => {
    let attempts = 0;
    const releaseOnce = createRetryableChatGenerationRelease(() => async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary database outage');
    });

    await releaseOnce();
    await releaseOnce();

    assert.equal(attempts, 2);
});

test('concurrent generation lease releases share the same in-flight database write', async () => {
    let attempts = 0;
    let complete: (() => void) | undefined;
    const releaseOnce = createRetryableChatGenerationRelease(
        () =>
            () =>
                new Promise<void>(resolve => {
                    attempts += 1;
                    complete = resolve;
                })
    );

    const first = releaseOnce();
    const second = releaseOnce();
    assert.equal(first, second);
    assert.equal(attempts, 1);
    complete?.();
    await first;
    await releaseOnce();
    assert.equal(attempts, 1);
});

test('SSE decoder preserves an unmatched brace inside a JSON string', () => {
    const encoded = encodeChatStreamEvent({
        translatedText: '请保留这个未配对的左花括号：{',
    });
    const decoder = createSseDataDecoder();

    const first = decoder.push(encoded.slice(0, 17));
    const second = decoder.push(encoded.slice(17));
    const payloads = [...first, ...second, ...decoder.finish()].map(parseChatStreamPayload);

    assert.deepEqual(payloads, [{ translatedText: '请保留这个未配对的左花括号：{' }]);
    assert.equal(chatStreamText(payloads[0]!), '请保留这个未配对的左花括号：{');
});

test('only an explicit persisted terminal frame acknowledges a committed turn', () => {
    const decoder = createSseDataDecoder();
    const frames = decoder.push(encodeChatStreamEvent({ conversationId: 'conversation-new' }));
    const bareId = parseChatStreamPayload(frames[0]!);

    assert.equal(chatStreamConversationId(bareId!), 'conversation-new');
    assert.equal(chatStreamTurnStatus(bareId!), undefined);
    assert.equal(isPersistedChatTurn(bareId!), false);

    const terminal = parseChatStreamPayload(
        decoder.push(
            encodeChatStreamEvent({
                conversationId: 'conversation-new',
                turnStatus: 'persisted',
            })
        )[0]!
    );

    assert.equal(chatStreamConversationId(terminal!), 'conversation-new');
    assert.equal(chatStreamTurnStatus(terminal!), 'persisted');
    assert.equal(isPersistedChatTurn(terminal!), true);
    assert.equal(chatStreamText(terminal!), undefined);
});

test('uncommitted terminal frames remain failures even when a stream emitted text first', () => {
    const decoder = createSseDataDecoder();
    const frames = decoder.push(
        `${encodeChatStreamEvent({ translatedText: '临时回答' })}${encodeChatStreamEvent({
            error: '回复已生成，但未能保存到对话。请在刷新前复制内容。',
            turnStatus: 'uncommitted',
        })}`
    );
    const payloads = frames.map(frame => parseChatStreamPayload(frame)!);

    assert.equal(chatStreamText(payloads[0]!), '临时回答');
    assert.equal(chatStreamTurnStatus(payloads[1]!), 'uncommitted');
    assert.equal(isPersistedChatTurn(payloads[1]!), false);
    assert.match(chatStreamError(payloads[1]!) || '', /未能保存/);
});

test('SSE decoder preserves a top-level error payload for the caller to surface', () => {
    const decoder = createSseDataDecoder();
    const frames = decoder.push(encodeChatStreamEvent({ error: '上游模型暂时不可用' }));
    const payload = parseChatStreamPayload(frames[0]!);

    assert.equal(chatStreamError(payload!), '上游模型暂时不可用');
    assert.throws(() => resolveChatStreamUpdate(payload!), /上游模型暂时不可用/);
});

test('SSE decoder accepts a final frame without a trailing blank line', () => {
    const decoder = createSseDataDecoder();
    decoder.push('data: {"translatedText":"完成"}');

    const payload = parseChatStreamPayload(decoder.finish()[0]!);
    assert.equal(chatStreamText(payload!), '完成');
});

test('stream controls suppress aborted or stale updates and errors', () => {
    const controller = new AbortController();
    let fresh = true;
    const control = { signal: controller.signal, isFresh: () => fresh };

    assert.equal(isChatStreamCurrent(control), true);
    assert.equal(shouldSuppressChatStreamError(new Error('网络错误'), control), false);

    fresh = false;
    assert.equal(isChatStreamCurrent(control), false);
    assert.equal(shouldSuppressChatStreamError(new Error('网络错误'), control), true);

    fresh = true;
    controller.abort();
    assert.equal(isChatStreamCurrent(control), false);
    assert.equal(
        shouldSuppressChatStreamError({ name: 'AbortError' }, { isFresh: () => true }),
        true
    );
});
