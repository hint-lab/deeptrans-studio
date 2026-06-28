import { NextResponse } from 'next/server';
import { type ChatMessage } from '@/lib/llm';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

function getChatConfig() {
    return {
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL,
        model: process.env.LLM_MODEL || process.env.OPENAI_API_MODEL || 'gpt-4o-mini',
    };
}

export async function POST(req: Request) {
    try {
        await requireUser();
        const cfg = getChatConfig();
        if (!cfg.apiKey)
            return NextResponse.json({ error: 'LLM_API_KEY 或 OPENAI_API_KEY 未配置' }, { status: 500 });
        const openai = createOpenAI({
            apiKey: cfg.apiKey,
            baseURL: cfg.baseURL,
        });
        const { prompt, system, locale } = await req.json();
        const messages: ChatMessage[] = [];

        // 根据语言设置系统提示
        const systemPrompt =
            locale === 'zh'
                ? '你是一个专业的AI助手，请用中文回答用户的问题。回答要准确、有用，并且要符合中文的表达习惯。'
                : 'You are a professional AI assistant. Please answer user questions in English. Be accurate, helpful, and follow English expression conventions.';

        if (system && typeof system === 'string') {
            messages.push({ role: 'system', content: system });
        } else {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: String(prompt || '').trim() });

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
        return NextResponse.json({ error: guardMessage(e) || 'Chat failed' }, { status: guardStatus(e) });
    }
}
