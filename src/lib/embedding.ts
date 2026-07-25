import {
    assertEmbeddingBatch,
    assertEmbeddingVector,
    resolveEmbeddingDimensions,
} from '@/lib/embedding-contract';

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
    let dimensions: number;
    try {
        dimensions = resolveEmbeddingDimensions(process.env.EMBEDDING_DIMENSIONS);
    } catch (error) {
        throw new Error(
            `Invalid EMBEDDING_DIMENSIONS environment value: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    if (pref?.dimensions !== undefined) {
        try {
            dimensions = resolveEmbeddingDimensions(pref.dimensions);
        } catch (error) {
            throw new Error(
                `Invalid embedding preference dimensions: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    if (pref?.providerKey && pref?.model) {
        return {
            providerKey: pref.providerKey,
            model: pref.model,
            apiKey: pref.apiKey,
            baseUrl: pref.baseUrl,
            apiPath: pref.apiPath,
            dimensions,
        };
    }
    return {
        providerKey: 'openai',
        model:
            process.env.EMBEDDING_MODEL ||
            process.env.OPENAI_EMBED_MODEL ||
            'text-embedding-3-small',
        apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
        baseUrl: process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL,
        apiPath: process.env.EMBEDDING_API_PATH,
        dimensions,
    };
}

function getEmbeddingEndpoint(cfg: EmbeddingProviderConfig) {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiPath =
        cfg.apiPath || (isMultimodalEmbedding(cfg) ? '/embeddings/multimodal' : '/embeddings');
    return apiPath.startsWith('http')
        ? apiPath
        : `${baseUrl}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
}

function isMultimodalEmbedding(cfg: EmbeddingProviderConfig) {
    return Boolean(cfg.apiPath?.includes('/multimodal') || /embedding-vision/i.test(cfg.model));
}

async function requestEmbedding(cfg: EmbeddingProviderConfig, text: string): Promise<number[]> {
    if (!cfg.apiKey) throw new Error('EMBEDDING_API_KEY 或 OPENAI_API_KEY 未配置');
    const multimodal = isMultimodalEmbedding(cfg);
    const dimensions = resolveEmbeddingDimensions(cfg.dimensions);
    const body = multimodal
        ? {
              model: cfg.model,
              input: [{ type: 'text', text }],
              dimensions,
          }
        : {
              model: cfg.model,
              input: text,
              dimensions,
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
        throw new Error(
            payload?.error?.message || payload?.message || `Embedding request failed: ${res.status}`
        );
    }
    const embedding = multimodal
        ? payload?.data?.embedding
        : payload?.data?.[0]?.embedding || payload?.data?.embedding;
    assertEmbeddingVector(embedding, `Embedding response for model ${JSON.stringify(cfg.model)}`);
    return embedding;
}

function isResponseItem(value: unknown): value is { index?: unknown; embedding?: unknown } {
    return typeof value === 'object' && value !== null;
}

function extractBatchEmbeddings(payload: any, expectedCount: number, model: string): number[][] {
    const context = `Embedding batch response for model ${JSON.stringify(model)}`;
    const data: unknown = payload?.data;
    if (!Array.isArray(data)) {
        assertEmbeddingBatch(data, expectedCount, context);
    }

    const vectors = data.map(item => (isResponseItem(item) ? item.embedding : undefined));
    assertEmbeddingBatch(vectors, expectedCount, context);

    const ordered: unknown[] = Array.from({ length: expectedCount }, () => undefined);
    const occupiedIndexes = new Set<number>();
    data.forEach((item, responsePosition) => {
        const rawIndex = isResponseItem(item) ? item.index : undefined;
        const index = rawIndex === undefined || rawIndex === null ? responsePosition : rawIndex;
        if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= expectedCount) {
            throw new Error(`${context}: invalid index ${JSON.stringify(rawIndex)}`);
        }
        const numericIndex = Number(index);
        if (occupiedIndexes.has(numericIndex)) {
            throw new Error(`${context}: duplicate index ${numericIndex}`);
        }
        occupiedIndexes.add(numericIndex);
        ordered[numericIndex] = vectors[responsePosition];
    });

    assertEmbeddingBatch(ordered, expectedCount, context);
    return ordered;
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
    if (!texts.length) return [];
    if (isMultimodalEmbedding(cfg)) {
        const vectors: number[][] = [];
        for (const text of texts) vectors.push(await requestEmbedding(cfg, text));
        assertEmbeddingBatch(
            vectors,
            texts.length,
            `Embedding batch for model ${JSON.stringify(cfg.model)}`
        );
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
            dimensions: resolveEmbeddingDimensions(cfg.dimensions),
        }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(
            payload?.error?.message || payload?.message || `Embedding request failed: ${res.status}`
        );
    }
    return extractBatchEmbeddings(payload, texts.length, cfg.model);
}
