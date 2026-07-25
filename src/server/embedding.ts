import { embedBatch, embedText, type EmbeddingProviderConfig } from '@/lib/embedding';
import type { AuthContext } from '@/lib/guards';

type ProviderConfig = EmbeddingProviderConfig;

function assertOwner(owner: Pick<AuthContext, 'userId' | 'tenantId'>) {
    if (!owner.userId) throw new Error('缺少内部用户身份');
}

export async function embedTextForOwner(
    text: string,
    owner: Pick<AuthContext, 'userId' | 'tenantId'>,
    pref?: Partial<ProviderConfig>
): Promise<number[]> {
    assertOwner(owner);
    return embedText(text, pref);
}

export async function embedBatchForOwner(
    texts: string[],
    owner: Pick<AuthContext, 'userId' | 'tenantId'>,
    pref?: Partial<ProviderConfig>
): Promise<number[][]> {
    assertOwner(owner);
    return embedBatch(texts, pref);
}
