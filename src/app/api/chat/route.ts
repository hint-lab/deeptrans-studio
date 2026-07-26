import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';
import {
    buildEditorContextReference,
    buildGeneralChatSystemPrompt,
    normalizeChatAssistantResponse,
    normalizeChatUserPrompt,
    resolveEditorWorkingText,
} from '@/lib/chat-context';
import { expectedChatActiveConversationId } from '@/lib/chat-active-conversation';
import { chatStatus } from '@/lib/chat-status';
import { guardStatus, requireUser } from '@/lib/guards';
import type { ChatMessage } from '@/lib/llm';
import {
    createChatGenerationAbortController,
    createRetryableChatGenerationRelease,
    encodeChatStreamEvent,
} from '@/lib/chat-stream';
import {
    appendChatConversationTurnForOwner,
    claimChatConversationGenerationForOwner,
    clearChatConversationForOwner,
    createNewChatConversationWithTurnForOwner,
    listChatConversationsForOwner,
    readChatConversationHistory,
    readChatConversationMessages,
    releaseChatConversationGenerationForOwner,
    resolveChatConversationForOwner,
    resolveChatConversationScopeForOwner,
    selectChatConversationForOwner,
    type ResolvedChatConversationScope,
} from '@/server/chat-conversations';

function getChatConfig() {
    return {
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL,
        model: process.env.LLM_MODEL || process.env.OPENAI_API_MODEL || 'gpt-4o-mini',
    };
}

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
    return statuses.unavailable;
}

async function requestBody(req: Request) {
    try {
        return record(await req.json());
    } catch {
        return null;
    }
}

/** A draft may be used only after the matching persisted segment is authorized. */
function workspaceReference(
    scope: ResolvedChatConversationScope,
    contextValue: unknown,
    locale: string
) {
    const context = record(contextValue);
    const project = scope.project;
    const item = scope.documentItem;

    if (item && project) {
        return buildEditorContextReference(
            {
                projectId: project.id,
                projectName: project.name,
                documentName: item.document.originalName || item.document.name,
                itemOrder: item.order,
                status: item.status,
                sourceLanguage: project.sourceLanguage,
                targetLanguage: project.targetLanguage,
                // An intentionally empty editor draft is still the current
                // working state. Falling back with `||` would silently send a
                // stale persisted source/translation while the UI says this
                // request uses the current segment context.
                sourceText: resolveEditorWorkingText(item.sourceText, context.sourceText),
                targetText: resolveEditorWorkingText(item.targetText, context.targetText),
            },
            locale
        );
    }
    if (project) {
        return buildEditorContextReference(
            {
                projectId: project.id,
                projectName: project.name,
                sourceLanguage: project.sourceLanguage,
                targetLanguage: project.targetLanguage,
            },
            locale
        );
    }
    return '';
}

function streamHeaders(conversationId?: string) {
    return {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...(conversationId ? { 'X-Chat-Conversation-Id': conversationId } : {}),
    };
}

async function conversationPayload(
    authCtx: Awaited<ReturnType<typeof requireUser>>,
    scope: ResolvedChatConversationScope,
    id: string
) {
    const [messages, listed] = await Promise.all([
        readChatConversationMessages(id),
        listChatConversationsForOwner(authCtx, scope),
    ]);
    return {
        conversationId: id,
        activeConversationId: listed.scopeRow.activeConversationId,
        messages,
        conversations: listed.conversations.map(conversation => ({
            id: conversation.id,
            createdAt: conversation.createdAt?.toISOString(),
            updatedAt: conversation.updatedAt?.toISOString(),
        })),
    };
}

export async function GET(req: Request) {
    const query = new URL(req.url).searchParams;
    const locale = query.get('locale');
    try {
        const authCtx = await requireUser();
        const scope = await resolveChatConversationScopeForOwner(
            { projectId: query.get('projectId'), documentItemId: query.get('documentItemId') },
            authCtx
        );
        const { conversation } = await resolveChatConversationForOwner({
            authCtx,
            scope,
            conversationId: query.get('conversationId'),
        });
        return NextResponse.json(await conversationPayload(authCtx, scope, conversation.id));
    } catch (error) {
        return NextResponse.json(
            { error: routeError(error, locale) },
            { status: guardStatus(error) }
        );
    }
}

/** Explicitly selects an already-authorized thread and makes it active for this scope. */
export async function PATCH(req: Request) {
    const body = await requestBody(req);
    const locale = body?.locale;
    if (!body) {
        return NextResponse.json({ error: chatStatus(locale).invalidRequest }, { status: 400 });
    }
    try {
        const authCtx = await requireUser();
        const scope = await resolveChatConversationScopeForOwner(body.context, authCtx);
        const conversation = await selectChatConversationForOwner({
            authCtx,
            scope,
            conversationId: body.conversationId,
        });
        return NextResponse.json(await conversationPayload(authCtx, scope, conversation.id));
    } catch (error) {
        return NextResponse.json(
            { error: routeError(error, locale) },
            { status: guardStatus(error) }
        );
    }
}

/** Clear messages only; a missing/unloaded id may never select a latest thread. */
export async function DELETE(req: Request) {
    const body = await requestBody(req);
    const locale = body?.locale;
    if (!body) {
        return NextResponse.json({ error: chatStatus(locale).invalidRequest }, { status: 400 });
    }
    try {
        const authCtx = await requireUser();
        const scope = await resolveChatConversationScopeForOwner(body.context, authCtx);
        const conversation = await clearChatConversationForOwner({
            authCtx,
            scope,
            conversationId: body.conversationId,
        });
        return NextResponse.json(await conversationPayload(authCtx, scope, conversation.id));
    } catch (error) {
        return NextResponse.json(
            { error: routeError(error, locale) },
            { status: guardStatus(error) }
        );
    }
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

    try {
        const authCtx = await requireUser();
        const cfg = getChatConfig();
        if (!cfg.apiKey) {
            return NextResponse.json({ error: statuses.unavailable }, { status: 500 });
        }

        const prompt = normalizeChatUserPrompt(body.prompt);
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
        let history: ChatMessage[] = [];
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
            // Claim before reconstructing history: no competing request can read
            // the same transcript and append a racing answer.
            history = await readChatConversationHistory(conversation.id);
        }

        const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
        const messages: ChatMessage[] = [
            { role: 'system', content: buildGeneralChatSystemPrompt(stringValue(locale)) },
            ...history,
        ];
        const reference = workspaceReference(scope, body.context, stringValue(locale));
        if (reference) messages.push({ role: 'user', content: reference });
        messages.push({ role: 'user', content: prompt.content });

        const generation = createChatGenerationAbortController(req.signal);
        const releaseOnRequestAbort = () => {
            void releaseOnce().catch(() => {});
        };
        req.signal.addEventListener('abort', releaseOnRequestAbort, { once: true });

        let result;
        try {
            result = streamText({
                model: openai.chat(cfg.model),
                messages,
                abortSignal: generation.signal,
            });
        } catch (error) {
            req.signal.removeEventListener('abort', releaseOnRequestAbort);
            generation.dispose();
            throw error;
        }

        const disposeGeneration = () => {
            req.signal.removeEventListener('abort', releaseOnRequestAbort);
            generation.dispose();
        };

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let accumulated = '';
                const emit = (payload: Parameters<typeof encodeChatStreamEvent>[0]) => {
                    controller.enqueue(encoder.encode(encodeChatStreamEvent(payload)));
                };

                try {
                    for await (const delta of result.textStream) {
                        if (generation.signal.aborted) break;
                        accumulated += delta;
                        // The visible stream uses the exact same bounded content
                        // that will be written at completion.
                        emit({
                            translatedText: normalizeChatAssistantResponse(accumulated).content,
                        });
                    }

                    if (generation.signal.aborted) return;
                    const assistant = normalizeChatAssistantResponse(accumulated).content;
                    if (!assistant) {
                        emit({ error: statuses.empty, turnStatus: 'uncommitted' });
                        return;
                    }

                    try {
                        let persistedConversationId: string;
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
                        // A conversation id/header alone is never a commit
                        // acknowledgement: existing threads have one before
                        // generation begins. This explicit terminal frame is
                        // emitted only after the complete turn transaction.
                        emit({ conversationId: persistedConversationId, turnStatus: 'persisted' });
                    } catch {
                        emit({ error: statuses.persistenceFailed, turnStatus: 'uncommitted' });
                    }
                } catch {
                    if (!generation.signal.aborted) {
                        emit({ error: statuses.interrupted, turnStatus: 'uncommitted' });
                    }
                } finally {
                    await releaseOnce().catch(() => {});
                    disposeGeneration();
                    if (!generation.signal.aborted) controller.close();
                }
            },
            cancel() {
                // Reader cancellation must release the server-side generation
                // gate immediately, even when an upstream provider is slow to
                // observe AbortSignal.
                generation.abort();
                void releaseOnce().catch(() => {});
                disposeGeneration();
            },
        });
        return new Response(stream, { headers: streamHeaders(conversation?.id) });
    } catch (error) {
        await releaseOnce().catch(() => {});
        return NextResponse.json(
            { error: routeError(error, locale) },
            { status: guardStatus(error) }
        );
    }
}
