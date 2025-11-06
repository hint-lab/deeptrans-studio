import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export type EmbeddingProviderConfig = {
  providerKey: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
};

export function resolveEmbeddingConfig(pref?: Partial<EmbeddingProviderConfig>): EmbeddingProviderConfig {
  if (pref?.providerKey && pref?.model) {
    return {
      providerKey: pref.providerKey,
      model: pref.model,
      apiKey: pref.apiKey,
      baseUrl: pref.baseUrl,
    };
  }
  return {
    providerKey: "openai",
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  };
}

export async function getEmbeddingClient(pref?: Partial<EmbeddingProviderConfig>) {
  const cfg = resolveEmbeddingConfig(pref);
  // only openai for now
  const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
  return { cfg, openai } as const;
}

export async function embedText(text: string, pref?: Partial<EmbeddingProviderConfig>): Promise<number[]> {
  const { cfg, openai } = await getEmbeddingClient(pref);
  const { embedding } = await embed({ model: openai.embedding(cfg.model), value: text });
  return embedding || [];
}

export async function embedBatch(texts: string[], pref?: Partial<EmbeddingProviderConfig>): Promise<number[][]> {
  const { cfg, openai } = await getEmbeddingClient(pref);
  const { embeddings } = await embedMany({ model: openai.embedding(cfg.model), values: texts });
  return embeddings || [];
}


