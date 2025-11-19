'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setRightPanelMode, toggleChat, togglePreview, toggleHelp, type RightPanelMode } from '@/store/features/rightPaneSlice';
import { setContent, appendContent, clearContent, updateById } from '@/store/features/chatbarSlice';
import { type Message } from '@/types/chat';

export const useRightPanel = () => {
    const dispatch = useAppDispatch();
    const mode = useAppSelector((state) => (state.rightPane as { mode: RightPanelMode })?.mode ?? 'none');
    const setMode = (m: RightPanelMode) => dispatch(setRightPanelMode(m));
    const toggleChatMode = () => dispatch(toggleChat());
    const togglePreviewMode = () => dispatch(togglePreview());
    const toggleHelpMode = () => dispatch(toggleHelp());
    return { mode, setMode, toggleChatMode, togglePreviewMode, toggleHelpMode };
};

export const useChatbarContent = () => {
    const dispatch = useAppDispatch();
    const chatbarContent = useAppSelector((state) => (state.chatbar as { content: Message[] })?.content ?? []);
    const updateContent = (messages: Message[]) => dispatch(setContent(messages));
    const addMessage = (message: Message) => dispatch(appendContent(message));
    const resetContent = () => dispatch(clearContent());
    const updateMessage = (id: string, updatedMessage: Omit<Message, 'id'>) => {
        const newContent = chatbarContent.map(msg => msg.id === id ? { ...updatedMessage, id } : msg);
        dispatch(setContent(newContent));
    };
    return { chatbarContent, updateContent, addMessage, resetContent, updateMessage };
};

export const useChatbarStream = () => {
    const { addMessage } = useChatbarContent();
    const dispatch = useAppDispatch();
    const { mode, setMode } = useRightPanel();
    const handleStreamResponse = async (
        streamParams: { url: string, data: any },
        options?: {
            initialMessage?: string,
            phase?: string,
            onStreamStart?: () => void,
            onStreamEnd?: (result: string) => void,
            onStreamError?: (error: any) => void,
            logFn?: (message: string, type?: string) => void
        }
    ): Promise<string> => {
        let result = '';
        let accumulatedText = '';
        let buffer = '';
        try {
            // 确保打开 chat 面板
            if (mode !== 'chat') setMode('chat');

            const messageId = Date.now().toString();
            addMessage({ id: messageId, content: options?.initialMessage || '处理中...', role: 'assistant' });
            options?.onStreamStart?.();
            const response = await fetch(streamParams.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }, body: JSON.stringify(streamParams.data) });
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `服务器错误: ${response.status}`);
                } else {
                    const errorText = await response.text();
                    throw new Error(`服务器返回了无效格式: ${response.status}`);
                }
            }
            if (!response.body) throw new Error('响应没有数据流');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let finalEvaluationContent = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer.trim()) {
                        try {
                            const jsonData = JSON.parse(buffer.trim());
                            if (jsonData.chunk?.metadata?.partialEvaluation || jsonData.chunk?.metadata?.QAText) {
                                accumulatedText = jsonData.chunk.metadata.QAText || jsonData.chunk.metadata.partialEvaluation;
                                result = accumulatedText;
                                finalEvaluationContent = accumulatedText;
                                dispatch(updateById({ id: messageId, message: { content: accumulatedText, role: 'assistant' } }));
                            }
                        } catch { }
                    }
                    if (finalEvaluationContent) {
                        dispatch(updateById({ id: messageId, message: { content: finalEvaluationContent, role: 'assistant' } }));
                    }
                    options?.onStreamEnd?.(result);
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                let startIndex = 0;
                while (startIndex < buffer.length) {
                    const jsonStart = buffer.indexOf('{', startIndex);
                    if (jsonStart === -1) { buffer = buffer.substring(startIndex); break; }
                    let bracketCount = 1; let jsonEnd = -1;
                    for (let i = jsonStart + 1; i < buffer.length; i++) { if (buffer[i] === '{') bracketCount++; else if (buffer[i] === '}') bracketCount--; if (bracketCount === 0) { jsonEnd = i; break; } }
                    if (jsonEnd !== -1) {
                        const jsonString = buffer.substring(jsonStart, jsonEnd + 1);
                        try {
                            const jsonData = JSON.parse(jsonString);
                            let updatedContent = '';
                            if (jsonData.chunk?.metadata?.partialEvaluation) { accumulatedText = jsonData.chunk.metadata.partialEvaluation; updatedContent = accumulatedText; finalEvaluationContent = accumulatedText; }
                            if (jsonData.chunk?.metadata?.QAText) { accumulatedText = jsonData.chunk.metadata.QAText; updatedContent = accumulatedText; finalEvaluationContent = accumulatedText; }
                            if (jsonData.chunk?.QAText) { accumulatedText = jsonData.chunk.QAText; updatedContent = accumulatedText; finalEvaluationContent = accumulatedText; }
                            if (jsonData.translatedText) { accumulatedText = jsonData.translatedText; updatedContent = accumulatedText; finalEvaluationContent = accumulatedText; }
                            if (updatedContent) { result = accumulatedText; dispatch(updateById({ id: messageId, message: { content: updatedContent, role: 'assistant' } })); }
                            if (jsonData.chunk?.statusMessage) { options?.logFn?.(`状态: ${jsonData.chunk.statusMessage}`, 'agent'); }
                            if (jsonData.chunk?.metadata?.error) { dispatch(updateById({ id: messageId, message: { content: `错误: ${jsonData.chunk.metadata.error}`, role: 'system' } })); throw new Error(jsonData.chunk.metadata.error); }
                        } catch { }
                        startIndex = jsonEnd + 1;
                    } else { buffer = buffer.substring(jsonStart); break; }
                }
            }
            return result;
        } catch (error) {
            addMessage({ content: `读取流数据失败: ${String(error)}`, role: 'system' });
            options?.onStreamError?.(error);
            throw error;
        }
    };
    return { handleStreamResponse };
};
