'use server';

import type { EmbeddingProviderConfig } from '@/lib/embedding';
import { requireUser } from '@/lib/guards';
import { embedBatchForOwner, embedTextForOwner } from '@/server/embedding';

type ProviderConfig = EmbeddingProviderConfig;

export async function embedTextAction(
    text: string,
    pref?: Partial<ProviderConfig>
): Promise<number[]> {
    const authCtx = await requireUser();
    return embedTextForOwner(text, authCtx, pref);
}

export async function embedBatchAction(
    texts: string[],
    pref?: Partial<ProviderConfig>
): Promise<number[][]> {
    const authCtx = await requireUser();
    return embedBatchForOwner(texts, authCtx, pref);
}
