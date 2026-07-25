import { NextResponse } from 'next/server';
import { type ChatMessage } from '@/lib/llm';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
    guardMessage,
    guardStatus,
    requireOwnedDocumentItem,
    requireOwnedProject,
    requireUser,
} from '@/lib/guards';
import { buildEditorContextPrompt, normalizeChatHistory } from '@/lib/chat-context';

function getChatConfig() {
    return {
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL,
        model: process.env.LLM_MODEL || process.env.OPENAI_API_MODEL || 'gpt-4o-mini',
    };
}

export async function POST(req: Request) {
    try {
        const authCtx = await requireUser();
        const cfg = getChatConfig();
        if (!cfg.apiKey)
            return NextResponse.json(
                { error: 'LLM_API_KEY 或 OPENAI_API_KEY 未配置' },
                { status: 500 }
            );
        const openai = createOpenAI({
            apiKey: cfg.apiKey,
            baseURL: cfg.baseURL,
        });
        const { prompt, system, locale, history, context } = await req.json();
        const userPrompt = String(prompt || '').trim();
        if (!userPrompt) {
            return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
        }
        const messages: ChatMessage[] = [];

        // 根据语言设置系统提示
        const systemPrompt =
            locale === 'zh'
                ? '你是一个专业的AI助手，请用中文回答用户的问题。回答要准确、有用，并且要符合中文的表达习惯。'
                : 'You are a professional AI assistant. Please answer user questions in English. Be accurate, helpful, and follow English expression conventions.';

        const systemParts = [system && typeof system === 'string' ? system.trim() : systemPrompt];
        const documentItemId =
            context && typeof context === 'object'
                ? String((context as { documentItemId?: unknown }).documentItemId || '')
                : '';
        const requestedProjectId =
            context && typeof context === 'object'
                ? String((context as { projectId?: unknown }).projectId || '')
                : '';
        if (documentItemId) {
            const item = await requireOwnedDocumentItem(documentItemId, authCtx);
            if (requestedProjectId && requestedProjectId !== item.document.projectId) {
                return NextResponse.json({ error: '当前语段不属于请求中的项目' }, { status: 404 });
            }
            const project = await requireOwnedProject(item.document.projectId, authCtx);
            systemParts.push(
                buildEditorContextPrompt(
                    {
                        projectId: project.id,
                        projectName: project.name,
                        documentName: item.document.originalName || item.document.name,
                        itemOrder: item.order,
                        status: item.status,
                        sourceLanguage: project.sourceLanguage,
                        targetLanguage: project.targetLanguage,
                        sourceText:
                            typeof (context as { sourceText?: unknown }).sourceText === 'string'
                                ? (context as { sourceText: string }).sourceText
                                : item.sourceText,
                        targetText:
                            typeof (context as { targetText?: unknown }).targetText === 'string'
                                ? (context as { targetText: string }).targetText
                                : item.targetText,
                    },
                    String(locale || '')
                )
            );
        } else if (requestedProjectId) {
            const project = await requireOwnedProject(requestedProjectId, authCtx);
            systemParts.push(
                buildEditorContextPrompt(
                    {
                        projectId: project.id,
                        projectName: project.name,
                        sourceLanguage: project.sourceLanguage,
                        targetLanguage: project.targetLanguage,
                    },
                    String(locale || '')
                )
            );
        }
        messages.push({ role: 'system', content: systemParts.filter(Boolean).join('\n\n') });
        messages.push(...normalizeChatHistory(history));
        messages.push({ role: 'user', content: userPrompt.slice(0, 12_000) });

        const result = await streamText({
            model: openai.chat(cfg.model),
            messages,
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let acc = '';
                try {
                    for await (const delta of result.textStream) {
                        acc += delta;
                        const payload = JSON.stringify({ translatedText: acc });
                        controller.enqueue(encoder.encode(payload));
                    }
                } catch (err) {
                    const msg = (err as any)?.message || '流式生成失败';
                    controller.enqueue(encoder.encode(JSON.stringify({ error: msg })));
                } finally {
                    controller.close();
                }
            },
        });
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: guardMessage(e) || 'Chat failed' },
            { status: guardStatus(e) }
        );
    }
}
