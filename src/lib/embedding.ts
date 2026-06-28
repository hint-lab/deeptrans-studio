export type EmbeddingProviderConfig = {
    providerKey: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    apiPath?: string;
    dimensions?: number;
};

export function resolveEmbeddingConfig(
    pref?: Partial<EmbeddingProviderConfig>
): EmbeddingProviderConfig {
    if (pref?.providerKey && pref?.model) {
        return {
            providerKey: pref.providerKey,
            model: pref.model,
            apiKey: pref.apiKey,
            baseUrl: pref.baseUrl,
            apiPath: pref.apiPath,
            dimensions: pref.dimensions,
        };
    }
    return {
        providerKey: 'openai',
        model: process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
        apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
        baseUrl: process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL,
        apiPath: process.env.EMBEDDING_API_PATH,
        dimensions: process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : undefined,
    };
}

function getEmbeddingEndpoint(cfg: EmbeddingProviderConfig) {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiPath = cfg.apiPath || (isMultimodalEmbedding(cfg) ? '/embeddings/multimodal' : '/embeddings');
    return apiPath.startsWith('http') ? apiPath : `${baseUrl}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
}

function isMultimodalEmbedding(cfg: EmbeddingProviderConfig) {
    return Boolean(cfg.apiPath?.includes('/multimodal') || /embedding-vision/i.test(cfg.model));
}

async function requestEmbedding(cfg: EmbeddingProviderConfig, text: string): Promise<number[]> {
    if (!cfg.apiKey) throw new Error('EMBEDDING_API_KEY 或 OPENAI_API_KEY 未配置');
    const multimodal = isMultimodalEmbedding(cfg);
    const body = multimodal
        ? {
              model: cfg.model,
              input: [{ type: 'text', text }],
              ...(cfg.dimensions ? { dimensions: cfg.dimensions } : {}),
          }
        : {
              model: cfg.model,
              input: text,
              ...(cfg.dimensions ? { dimensions: cfg.dimensions } : {}),
          };
    const res = await fetch(getEmbeddingEndpoint(cfg), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(payload?.error?.message || payload?.message || `Embedding request failed: ${res.status}`);
    }
    const embedding = multimodal ? payload?.data?.embedding : payload?.data?.[0]?.embedding || payload?.data?.embedding;
    if (!Array.isArray(embedding)) throw new Error('Embedding response missing vector');
    return embedding;
}

export async function getEmbeddingClient(pref?: Partial<EmbeddingProviderConfig>) {
    const cfg = resolveEmbeddingConfig(pref);
    return { cfg, endpoint: getEmbeddingEndpoint(cfg) } as const;
}

export async function embedText(
    text: string,
    pref?: Partial<EmbeddingProviderConfig>
): Promise<number[]> {
    const { cfg } = await getEmbeddingClient(pref);
    return requestEmbedding(cfg, text);
}

export async function embedBatch(
    texts: string[],
    pref?: Partial<EmbeddingProviderConfig>
): Promise<number[][]> {
    const { cfg } = await getEmbeddingClient(pref);
    if (isMultimodalEmbedding(cfg)) {
        const vectors: number[][] = [];
        for (const text of texts) vectors.push(await requestEmbedding(cfg, text));
        return vectors;
    }

    if (!cfg.apiKey) throw new Error('EMBEDDING_API_KEY 或 OPENAI_API_KEY 未配置');
    const res = await fetch(getEmbeddingEndpoint(cfg), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: cfg.model,
            input: texts,
            ...(cfg.dimensions ? { dimensions: cfg.dimensions } : {}),
        }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(payload?.error?.message || payload?.message || `Embedding request failed: ${res.status}`);
    }
    return (payload?.data || [])
        .slice()
        .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
        .map((item: any) => item.embedding)
        .filter(Array.isArray);
}
