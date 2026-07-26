'use client';

import { useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
    setRightPanelMode,
    toggleChat,
    togglePreview,
    toggleHelp,
    type RightPanelMode,
} from '@/store/features/rightPaneSlice';
import {
    setContent,
    appendContent,
    clearContent,
    updateById,
    removeById,
} from '@/store/features/chatbarSlice';
import {
    ChatStreamUncommittedTurnError,
    createSseDataDecoder,
    chatStreamConversationId,
    chatStreamError,
    chatStreamTurnStatus,
    isChatStreamCurrent,
    isPersistedChatTurn,
    parseChatStreamPayload,
    resolveChatStreamUpdate,
    chatStreamStatusMessage,
    shouldSuppressChatStreamError,
} from '@/lib/chat-stream';
import { chatStatus } from '@/lib/chat-status';
import { type Message } from '@/types/chat';

export const useRightPanel = () => {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(
        state => (state.rightPane as { mode: RightPanelMode })?.mode ?? 'none'
    );
    const setMode = (m: RightPanelMode) => dispatch(setRightPanelMode(m));
    const toggleChatMode = () => dispatch(toggleChat());
    const togglePreviewMode = () => dispatch(togglePreview());
    const toggleHelpMode = () => dispatch(toggleHelp());
    return { mode, setMode, toggleChatMode, togglePreviewMode, toggleHelpMode };
};

export const useChatbarContent = () => {
    const dispatch = useAppDispatch();
    const chatbarContent = useAppSelector(
        state => (state.chatbar as { content: Message[] })?.content ?? []
    );
    const updateContent = useCallback(
        (messages: Message[]) => dispatch(setContent(messages)),
        [dispatch]
    );
    const addMessage = useCallback(
        (message: Message) => dispatch(appendContent(message)),
        [dispatch]
    );
    const removeMessage = useCallback((id: string) => dispatch(removeById(id)), [dispatch]);
    const resetContent = useCallback(() => dispatch(clearContent()), [dispatch]);
    const updateMessage = useCallback(
        (id: string, updatedMessage: Omit<Message, 'id'>) => {
            const newContent = chatbarContent.map(msg =>
                msg.id === id ? { ...updatedMessage, id } : msg
            );
            dispatch(setContent(newContent));
        },
        [chatbarContent, dispatch]
    );
    return {
        chatbarContent,
        updateContent,
        addMessage,
        removeMessage,
        resetContent,
        updateMessage,
    };
};

export const useChatbarStream = () => {
    const { addMessage } = useChatbarContent();
    const dispatch = useAppDispatch();
    const { mode, setMode } = useRightPanel();
    const handleStreamResponse = async (
        streamParams: { url: string; data: any },
        options?: {
            initialMessage?: string;
            phase?: string;
            onStreamStart?: () => void;
            onStreamEnd?: (result: string) => void;
            onStreamError?: (error: any) => void;
            onResponse?: (response: Response) => void;
            onConversationId?: (conversationId: string) => void;
            locale?: string;
            logFn?: (message: string, type?: string) => void;
            signal?: AbortSignal;
            isFresh?: () => boolean;
            /**
             * The persisted IDE-chat protocol sends a terminal commit frame.
             * This opt-in makes a missing/failed commit reject instead of
             * leaving an optimistic assistant message in the shared reducer.
             */
            requirePersistedTurn?: boolean;
        }
    ): Promise<string> => {
        let result = '';
        let messageId: string | null = null;
        let terminalStatus: 'persisted' | 'uncommitted' | undefined;
        let terminalError: string | undefined;
        const statuses = chatStatus(options?.locale);
        const settleInterruptedMessage = () => {
            if (!messageId) return;
            if (options?.requirePersistedTurn) {
                dispatch(removeById(messageId));
                return;
            }
            if (result) {
                dispatch(
                    updateById({
                        id: messageId,
                        message: { content: result, role: 'assistant' },
                    })
                );
            } else {
                dispatch(removeById(messageId));
            }
        };
        try {
            if (!isChatStreamCurrent(options)) return result;

            // 确保打开 chat 面板
            if (mode !== 'chat') setMode('chat');

            const streamMessageId =
                globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            messageId = streamMessageId;
            addMessage({
                id: streamMessageId,
                content: options?.initialMessage || '处理中...',
                role: 'assistant',
            });
            options?.onStreamStart?.();
            const response = await fetch(streamParams.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                body: JSON.stringify(streamParams.data),
                signal: options?.signal,
            });
            if (!isChatStreamCurrent(options)) {
                settleInterruptedMessage();
                return result;
            }
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || statuses.unavailable);
                } else {
                    await response.text();
                    throw new Error(statuses.protocolFailed);
                }
            }
            options?.onResponse?.(response);
            if (!response.body) throw new Error(statuses.protocolFailed);
            const reader = response.body.getReader();
            const textDecoder = new TextDecoder();
            const frameDecoder = createSseDataDecoder();
            const applyPayload = (data: string) => {
                if (!isChatStreamCurrent(options)) return;
                const payload = parseChatStreamPayload(data);
                if (!payload) return;
                if (!isChatStreamCurrent(options)) return;

                const statusMessage = chatStreamStatusMessage(payload);
                if (statusMessage) options?.logFn?.(`状态: ${statusMessage}`, 'agent');

                const status = chatStreamTurnStatus(payload);
                if (status === 'uncommitted') {
                    terminalStatus = status;
                    terminalError = chatStreamError(payload) || statuses.requestFailed;
                    return;
                }

                if (status === 'persisted') {
                    if (!isPersistedChatTurn(payload)) {
                        terminalStatus = 'uncommitted';
                        terminalError = statuses.protocolFailed;
                        return;
                    }
                    terminalStatus = status;
                    const updatedContent = resolveChatStreamUpdate(payload);
                    if (updatedContent) {
                        result = updatedContent;
                        dispatch(
                            updateById({
                                id: streamMessageId,
                                message: { content: updatedContent, role: 'assistant' },
                            })
                        );
                    }
                    options?.onConversationId?.(chatStreamConversationId(payload)!);
                    return;
                }

                const updatedContent = resolveChatStreamUpdate(payload);
                if (updatedContent) {
                    result = updatedContent;
                    dispatch(
                        updateById({
                            id: streamMessageId,
                            message: { content: updatedContent, role: 'assistant' },
                        })
                    );
                }

                // Existing non-chat streams may still use a bare id. Persisted
                // IDE chat calls opt in above and never acknowledge on this.
                const conversationId = chatStreamConversationId(payload);
                if (conversationId && !options?.requirePersistedTurn) {
                    options?.onConversationId?.(conversationId);
                }
            };
            while (true) {
                if (!isChatStreamCurrent(options)) {
                    void reader.cancel().catch(() => {});
                    settleInterruptedMessage();
                    return result;
                }
                const { done, value } = await reader.read();
                if (done) {
                    const tail = textDecoder.decode();
                    if (tail) {
                        for (const data of frameDecoder.push(tail)) applyPayload(data);
                    }
                    for (const data of frameDecoder.finish()) applyPayload(data);
                    if (isChatStreamCurrent(options)) {
                        if (options?.requirePersistedTurn) {
                            if (terminalStatus !== 'persisted') {
                                throw new ChatStreamUncommittedTurnError(
                                    terminalError || statuses.protocolFailed
                                );
                            }
                            options?.onStreamEnd?.(result);
                            break;
                        }
                        if (!result) {
                            result = statuses.empty;
                            dispatch(
                                updateById({
                                    id: streamMessageId,
                                    message: { content: result, role: 'assistant' },
                                })
                            );
                        }
                        options?.onStreamEnd?.(result);
                    }
                    break;
                }
                const chunk = textDecoder.decode(value, { stream: true });
                for (const data of frameDecoder.push(chunk)) applyPayload(data);
            }
            return result;
        } catch (error) {
            if (shouldSuppressChatStreamError(error, options)) {
                settleInterruptedMessage();
                return result;
            }
            if (options?.requirePersistedTurn) {
                settleInterruptedMessage();
                options?.onStreamError?.(error);
                throw error;
            }
            const failure = result
                ? `${result}\n\n${statuses.interrupted}`
                : statuses.requestFailed;
            if (messageId) {
                dispatch(
                    updateById({
                        id: messageId,
                        message: { content: failure, role: 'assistant' },
                    })
                );
            } else {
                addMessage({ content: failure, role: 'system' });
            }
            options?.onStreamError?.(error);
            throw error;
        }
    };
    return { handleStreamResponse };
};
