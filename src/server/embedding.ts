import { embedBatch, embedText, type EmbeddingProviderConfig } from '@/lib/embedding';
import type { AuthContext } from '@/lib/guards';

type ProviderConfig = EmbeddingProviderConfig;

async function resolveEmbeddingProvider(pref?: Partial<ProviderConfig>): Promise<ProviderConfig> {
    if (pref?.providerKey && pref?.model) {
        return {
            providerKey: pref.providerKey,
            model: pref.model,
            apiKey: pref.apiKey,
            baseUrl: pref.baseUrl,
        };
    }

    return {
        providerKey: 'openai',
        model: process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
        apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
        baseUrl: process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL,
    };
}

function assertOwner(owner: Pick<AuthContext, 'userId' | 'tenantId'>) {
    if (!owner.userId) throw new Error('缺少内部用户身份');
}

export async function embedTextForOwner(
    text: string,
    owner: Pick<AuthContext, 'userId' | 'tenantId'>,
    pref?: Partial<ProviderConfig>
): Promise<number[]> {
    assertOwner(owner);
    const cfg = await resolveEmbeddingProvider(pref);
    return embedText(text, cfg);
}

export async function embedBatchForOwner(
    texts: string[],
    owner: Pick<AuthContext, 'userId' | 'tenantId'>,
    pref?: Partial<ProviderConfig>
): Promise<number[][]> {
    assertOwner(owner);
    const cfg = await resolveEmbeddingProvider(pref);
    return embedBatch(texts, cfg);
}
