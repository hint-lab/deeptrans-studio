// LLM client via Vercel AI SDK
import { createLogger } from '@/lib/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
const logger = createLogger({
    type: 'lib:llm',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
function getOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY 未配置');
    return createOpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
}

function getModelName(override?: string) {
    return override || process.env.OPENAI_API_MODEL || 'gpt-4o-mini';
}

export async function chatText(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
    const openai = getOpenAI();
    logger.debug('使用的模型:', options?.model || getModelName(), '发送的Prompt:', JSON.stringify(messages, null, 2));
    const result = await generateText({
        model: openai.chat(options?.model || getModelName()),
        messages,
        temperature: options?.temperature ?? 0.2,
    });
    return String(result?.text || '').trim();
}

export async function chatJSON<T = any>(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<T> {
    const content = await chatText(messages, options);
    try {
        const match = content.match(/```json[\\s\\S]*?```/i);
        const jsonStr = match ? match[0].replace(/```json|```/gi, '').trim() : content;
        return JSON.parse(jsonStr) as T;
    } catch {
        return { raw: content } as unknown as T;
    }
}
