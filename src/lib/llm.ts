// LLM client via Vercel AI SDK
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
  const result = await generateText({
    model: openai.chat(options?.model || getModelName()),
    messages,
    temperature: options?.temperature ?? 0.2,
  });
  return String(result?.text || '').trim();
}

export async function chatJSON<T = any>(messages: ChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<T> {
  const content = await chatText(messages, options);
  try {
    const match = content.match(/```json[\\s\\S]*?```/i);
    const jsonStr = match ? match[0].replace(/```json|```/gi, '').trim() : content;
    return JSON.parse(jsonStr) as T;
  } catch {
    return { raw: content } as unknown as T;
  }
}


