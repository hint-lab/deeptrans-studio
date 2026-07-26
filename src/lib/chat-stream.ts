export type ChatStreamPayload = {
    translatedText?: unknown;
    conversationId?: unknown;
    /**
     * Chat routes send this exactly once at the end of a turn. Text frames are
     * deliberately not proof that the corresponding user/assistant pair was
     * committed to the conversation.
     */
    turnStatus?: unknown;
    error?: unknown;
    chunk?: {
        QAText?: unknown;
        statusMessage?: unknown;
        metadata?: {
            QAText?: unknown;
            partialEvaluation?: unknown;
            error?: unknown;
        };
    };
    QAText?: unknown;
};

export type ChatStreamTurnStatus = 'persisted' | 'uncommitted';

export class ChatStreamUncommittedTurnError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChatStreamUncommittedTurnError';
    }
}

export type ChatStreamControl = {
    signal?: AbortSignal;
    isFresh?: () => boolean;
};

/**
 * Links a request/response lifecycle to an upstream chat generation. The
 * caller can abort when the response body is cancelled, while an inbound
 * request disconnect also stops the provider request. `dispose` removes the
 * request listener after a normal completion.
 */
export function createChatGenerationAbortController(requestSignal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();

    if (requestSignal?.aborted) {
        abort();
    } else {
        requestSignal?.addEventListener('abort', abort, { once: true });
    }

    return {
        signal: controller.signal,
        abort,
        dispose: () => requestSignal?.removeEventListener('abort', abort),
    };
}

/**
 * A generation lease release is idempotent, but it is still a database write.
 * Do not permanently mark it released before that write succeeds: otherwise a
 * transient failure leaves the conversation busy until the stale-lease timeout.
 *
 * The single immediate retry is safe because the owner/token predicate makes
 * the release idempotent. Concurrent callers share the same in-flight release;
 * a later lifecycle callback can retry again if both attempts fail.
 */
export function createRetryableChatGenerationRelease(
    getRelease: () => (() => Promise<void>) | undefined
) {
    let released = false;
    let inFlight: Promise<void> | undefined;

    return () => {
        if (released) return Promise.resolve();
        if (!inFlight) {
            const release = getRelease();
            if (!release) return Promise.resolve();

            inFlight = (async () => {
                let firstError: unknown;
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    try {
                        await release();
                        released = true;
                        return;
                    } catch (error) {
                        firstError = error;
                    }
                }
                throw firstError;
            })();
            void inFlight.then(
                () => {
                    inFlight = undefined;
                },
                () => {
                    inFlight = undefined;
                }
            );
        }
        return inFlight;
    };
}

const SSE_FRAME_DELIMITER = /\r\n\r\n|\n\n|\r\r/;

function sseDataFromFrame(frame: string) {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r\n|\r|\n/)) {
        if (!line.startsWith('data:')) continue;
        dataLines.push(line.startsWith('data: ') ? line.slice(6) : line.slice(5));
    }

    if (dataLines.length) return dataLines.join('\n');

    // This fallback accepts the previous one-shot JSON response while a browser
    // still has an older server version cached. New endpoints always emit SSE.
    const fallback = frame.trim();
    return fallback.startsWith('{') || fallback.startsWith('[') ? fallback : '';
}

export function encodeChatStreamEvent(payload: ChatStreamPayload) {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

export function parseChatStreamPayload(data: string): ChatStreamPayload | null {
    const trimmed = data.trim();
    if (!trimmed || trimmed === '[DONE]') return null;

    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('服务器返回了无效的流式数据');
    }
    return parsed as ChatStreamPayload;
}

export function chatStreamText(payload: ChatStreamPayload) {
    const candidate =
        payload.chunk?.metadata?.partialEvaluation ||
        payload.chunk?.metadata?.QAText ||
        payload.chunk?.QAText ||
        payload.QAText ||
        payload.translatedText;
    return typeof candidate === 'string' && candidate ? candidate : undefined;
}

export function chatStreamConversationId(payload: ChatStreamPayload) {
    return typeof payload.conversationId === 'string' && payload.conversationId.trim()
        ? payload.conversationId
        : undefined;
}

export function chatStreamTurnStatus(payload: ChatStreamPayload): ChatStreamTurnStatus | undefined {
    return payload.turnStatus === 'persisted' || payload.turnStatus === 'uncommitted'
        ? payload.turnStatus
        : undefined;
}

/**
 * A conversation id alone is intentionally not a commit acknowledgement: the
 * normal streaming route knows an existing id before it has written the final
 * turn. Consumers that require durable chat history must wait for this exact
 * terminal predicate.
 */
export function isPersistedChatTurn(payload: ChatStreamPayload) {
    return (
        chatStreamTurnStatus(payload) === 'persisted' && Boolean(chatStreamConversationId(payload))
    );
}

export function chatStreamError(payload: ChatStreamPayload) {
    const candidate = payload.chunk?.metadata?.error || payload.error;
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

export function chatStreamStatusMessage(payload: ChatStreamPayload) {
    const candidate = payload.chunk?.statusMessage;
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

export function resolveChatStreamUpdate(payload: ChatStreamPayload) {
    const error = chatStreamError(payload);
    if (error) throw new Error(error);
    return chatStreamText(payload);
}

export function isChatStreamCurrent(control?: ChatStreamControl) {
    return !control?.signal?.aborted && (control?.isFresh?.() ?? true);
}

export function isChatStreamAbortError(error: unknown) {
    return (
        Boolean(error) &&
        typeof error === 'object' &&
        (error as { name?: unknown }).name === 'AbortError'
    );
}

export function shouldSuppressChatStreamError(error: unknown, control?: ChatStreamControl) {
    return !isChatStreamCurrent(control) || isChatStreamAbortError(error);
}

/**
 * Decodes complete SSE data frames without attempting to infer JSON boundaries.
 * JSON may legitimately contain braces, escaped quotes, or newlines, so only
 * the SSE frame delimiter is used to split transport messages.
 */
export function createSseDataDecoder() {
    let buffer = '';

    const drain = () => {
        const frames: string[] = [];
        while (true) {
            const match = buffer.match(SSE_FRAME_DELIMITER);
            if (!match || match.index === undefined) break;
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = sseDataFromFrame(frame);
            if (data) frames.push(data);
        }
        return frames;
    };

    return {
        push(chunk: string) {
            buffer += chunk;
            return drain();
        },
        finish() {
            const frames = drain();
            const data = sseDataFromFrame(buffer);
            buffer = '';
            if (data) frames.push(data);
            return frames;
        },
    };
}
