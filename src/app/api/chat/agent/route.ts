import { NextResponse } from 'next/server';
import { normalizeChatAssistantResponse, normalizeChatUserPrompt } from '@/lib/chat-context';
import { expectedChatActiveConversationId } from '@/lib/chat-active-conversation';
import { chatStatus } from '@/lib/chat-status';
import { guardStatus, requireUser } from '@/lib/guards';
import { memorySearchErrorOrFallback } from '@/lib/memory-search';
import {
    createRetryableChatGenerationRelease,
    encodeChatStreamEvent,
} from '@/lib/chat-stream';
import {
    appendChatConversationTurnForOwner,
    claimChatConversationGenerationForOwner,
    createNewChatConversationWithTurnForOwner,
    readChatConversationHistory,
    releaseChatConversationGenerationForOwner,
    resolveChatConversationForOwner,
    resolveChatConversationScopeForOwner,
} from '@/server/chat-conversations';
import { runChatAgentForOwner, type ChatAgentRequest } from '@/server/chat-agent';

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function generationToken() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function routeError(error: unknown, locale: unknown) {
    const statuses = chatStatus(locale);
    const status = guardStatus(error);
    if (status === 401) return statuses.unauthorized;
    if (status === 409) return statuses.busy;
    if (status >= 400 && status < 500) return statuses.invalidRequest;
    // Agent retrieval may produce one of the bounded public memory-search
    // states. Preserve only that whitelist; provider/DB failures still become
    // the ordinary chat fallback rather than leaking through the stream route.
    return memorySearchErrorOrFallback(error, statuses.unavailable);
}

async function requestBody(req: Request) {
    try {
        return record(await req.json());
    } catch {
        return null;
    }
}

function abortError() {
    const error = new Error('Request aborted');
    error.name = 'AbortError';
    return error;
}

export async function POST(req: Request) {
    let releaseGeneration: (() => Promise<void>) | undefined;
    const releaseOnce = createRetryableChatGenerationRelease(() => releaseGeneration);

    const body = await requestBody(req);
    const locale = body?.locale;
    const statuses = chatStatus(locale);
    if (!body) {
        return NextResponse.json({ error: statuses.invalidRequest }, { status: 400 });
    }

    let aborted = req.signal.aborted;
    let abortListener: (() => void) | undefined;
    try {
        const authCtx = await requireUser();
        const prompt = normalizeChatUserPrompt(body.prompt);
        // Agent calls must have an explicit instruction; a blank request must
        // not create a misleading assistant-only turn.
        if (!prompt.content) {
            return NextResponse.json({ error: statuses.invalidRequest }, { status: 400 });
        }

        const scope = await resolveChatConversationScopeForOwner(body.context, authCtx);
        const isNewThread =
            body.newConversation === true && !stringValue(body.conversationId).trim();
        const activeConversationSnapshot = isNewThread
            ? expectedChatActiveConversationId(body)
            : undefined;
        let conversation:
            | Awaited<ReturnType<typeof resolveChatConversationForOwner>>['conversation']
            | undefined;
        let history: Awaited<ReturnType<typeof readChatConversationHistory>> = [];
        let token: string | undefined;

        if (!isNewThread) {
            const resolved = await resolveChatConversationForOwner({
                authCtx,
                scope,
                conversationId: body.conversationId,
            });
            conversation = resolved.conversation;
            token = generationToken();
            await claimChatConversationGenerationForOwner({
                authCtx,
                conversation,
                generationToken: token,
            });
            releaseGeneration = () =>
                releaseChatConversationGenerationForOwner({
                    authCtx,
                    conversation: conversation!,
                    generationToken: token!,
                });
            history = await readChatConversationHistory(conversation.id);
        }

        const abortedResult = new Promise<never>((_, reject) => {
            abortListener = () => {
                aborted = true;
                // `runChatAgentForOwner` does not yet accept AbortSignal. Race
                // it so a disconnected request releases the gate now; the late
                // task result is never allowed to reach persistence below.
                void releaseOnce().catch(() => {});
                reject(abortError());
            };
            if (req.signal.aborted) abortListener();
            else req.signal.addEventListener('abort', abortListener, { once: true });
        });
        const agentTask = runChatAgentForOwner(
            { ...body, prompt: prompt.content, history } as ChatAgentRequest,
            authCtx
        );
        // The race handles the task's result; this handler also guarantees a
        // late rejection after cancellation is observed rather than unhandled.
        void agentTask.catch(() => {});
        const result = await Promise.race([agentTask, abortedResult]);
        if (aborted || req.signal.aborted) return new Response(null, { status: 499 });

        const assistant = normalizeChatAssistantResponse(result).content;
        if (!assistant) {
            return new Response(
                encodeChatStreamEvent({ error: statuses.empty, turnStatus: 'uncommitted' }),
                {
                    headers: {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        ...(conversation ? { 'X-Chat-Conversation-Id': conversation.id } : {}),
                    },
                }
            );
        }

        let persistedConversationId: string;
        try {
            if (isNewThread) {
                const created = await createNewChatConversationWithTurnForOwner({
                    authCtx,
                    scope,
                    userContent: prompt.content,
                    assistantContent: assistant,
                    expectedActiveConversationId: activeConversationSnapshot,
                });
                persistedConversationId = created.id;
            } else {
                const appended = await appendChatConversationTurnForOwner({
                    authCtx,
                    conversation: conversation!,
                    userContent: prompt.content,
                    assistantContent: assistant,
                    generationToken: token,
                });
                persistedConversationId = appended.conversation.id;
            }
        } catch {
            return new Response(
                encodeChatStreamEvent({
                    error: statuses.persistenceFailed,
                    turnStatus: 'uncommitted',
                }),
                {
                    headers: {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        ...(conversation ? { 'X-Chat-Conversation-Id': conversation.id } : {}),
                    },
                }
            );
        }
        if (aborted || req.signal.aborted) return new Response(null, { status: 499 });

        return new Response(
            encodeChatStreamEvent({
                translatedText: assistant,
                conversationId: persistedConversationId,
                turnStatus: 'persisted',
            }),
            {
                headers: {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache',
                    'X-Chat-Conversation-Id': persistedConversationId,
                },
            }
        );
    } catch (error) {
        if (aborted || req.signal.aborted) return new Response(null, { status: 499 });
        return NextResponse.json(
            { error: routeError(error, locale) },
            { status: guardStatus(error) }
        );
    } finally {
        if (abortListener) req.signal.removeEventListener('abort', abortListener);
        await releaseOnce().catch(() => {});
    }
}
