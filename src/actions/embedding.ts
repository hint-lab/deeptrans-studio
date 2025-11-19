"use server";

import { embedText, embedBatch, EmbeddingProviderConfig } from "@/lib/embedding";

type ProviderConfig = EmbeddingProviderConfig;

async function resolveEmbeddingProvider(pref?: Partial<ProviderConfig>): Promise<ProviderConfig> {
  // 优先显式传入
  if (pref?.providerKey && pref?.model) {
    return {
      providerKey: pref.providerKey,
      model: pref.model,
      apiKey: pref.apiKey,
      baseUrl: pref.baseUrl,
    };
  }
  // 最终回退 OpenAI
  return {
    providerKey: "openai",
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  };
}

export async function embedTextAction(text: string, pref?: Partial<ProviderConfig>): Promise<number[]> {
  const cfg = await resolveEmbeddingProvider(pref);
  return embedText(text, cfg);
}

export async function embedBatchAction(texts: string[], pref?: Partial<ProviderConfig>): Promise<number[][]> {
  const cfg = await resolveEmbeddingProvider(pref);
  return embedBatch(texts, cfg);
}


