import { DocumentTermExtractAgent } from '@/agents/preprocess/DocumentTermExtractAgent';
import type { AuthContext } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import type { DocumentTerm } from '@/lib/terms/types';
import type { DocumentTermExtractOptions } from '@/types/documentTermExtractOptions';

const logger = createLogger(
    {
        type: 'server:project-init',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

export async function extractDocumentTermsForOwner(
    text: string,
    owner: AuthContext,
    options?: DocumentTermExtractOptions
): Promise<DocumentTerm[]> {
    if (!owner.userId) throw new Error('缺少内部用户身份');

    try {
        const agent = new DocumentTermExtractAgent();
        const result = await agent.execute({ text, options });
        logger.info('文档术语提取成功:', { count: Array.isArray(result) ? result.length : 0 });
        return result;
    } catch (error) {
        logger.error('文档术语提取失败:', error);
        throw new Error('文档术语提取失败');
    }
}
