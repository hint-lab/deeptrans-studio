// LLM client via Vercel AI SDK
import { createLogger } from '@/lib/logger';
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
const logger = createLogger({
    type: 'lib:llm',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
function getLLMConfig() {
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY 或 OPENAI_API_KEY 未配置');
    return {
        apiKey,
        baseUrl: (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
            /\/$/,
            ''
        ),
    };
}

function getModelName(override?: string) {
    return override || process.env.LLM_MODEL || process.env.OPENAI_API_MODEL || 'gpt-4o-mini';
}

export async function chatText(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
    const cfg = getLLMConfig();
    const model = options?.model || getModelName();
    logger.debug('LLM request', {
        model,
        messageCount: messages.length,
        inputChars: messages.reduce((sum, msg) => sum + msg.content.length, 0),
    });
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: options?.temperature ?? 0.2,
            max_tokens: options?.maxTokens,
        }),
    });

    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = { raw: text };
    }

    if (!response.ok) {
        logger.error('LLM request failed', {
            status: response.status,
            body: typeof text === 'string' ? text.slice(0, 1000) : '',
        });
        throw new Error(`LLM请求失败: ${response.status}`);
    }

    const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? payload?.text;
    return String(content || '').trim();
}

export async function chatJSON<T = any>(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<T> {
    const content = await chatText(messages, options);
    try {
        const jsonFence = content.match(/```json\s*([\s\S]*?)```/i);
        const anyFence = content.match(/```\s*([\s\S]*?)```/i);
        const jsonStr = (jsonFence?.[1] || anyFence?.[1] || content).trim();
        return JSON.parse(jsonStr) as T;
    } catch {
        return { raw: content } as unknown as T;
    }
}
