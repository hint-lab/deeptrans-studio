// Dictionary Tool - 术语库查询工具
import { createLogger } from '@/lib/logger';
import { type DictEntry, type TermCandidate } from '@/types/terms';
const logger = createLogger({
    type: 'tools:dictionary',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export class DictionaryTool {
    private readonly apiBase: string;

    constructor(apiBase?: string) {
        const isServer = typeof window === 'undefined';
        const fromEnv = isServer
            ? process.env.DICTIONARY_API_URL || process.env.INTERNAL_API_BASE || ''
            : process.env.NEXT_PUBLIC_DICTIONARY_API_URL || '';
        this.apiBase = (apiBase || fromEnv || '').replace(/\/$/, '');
    }

    async lookup(terms: TermCandidate[], options?: any): Promise<DictEntry[]> {
        logger.debug('DictionaryTool.lookup 开始:', {
            termsCount: terms?.length,
            terms: terms?.map(t => t.term).slice(0, 10),
            options,
            apiBase: this.apiBase,
        });

        if (!terms?.length) {
            logger.warn('Dictionary lookup: No terms provided');
            return [];
        }

        const isServer = typeof window === 'undefined';
        logger.debug('Dictionary lookup 环境:', { isServer, apiBase: this.apiBase });

        // 服务端必须使用绝对 URL；客户端可用相对 URL
        if (isServer && !this.apiBase) {
            logger.warn('Dictionary lookup: Missing DICTIONARY_API_URL on server');
            return [];
        }
        const baseUrl = this.apiBase || '';

        logger.debug(
            `Dictionary lookup: Searching ${terms.length} terms using API base: ${this.apiBase}`
        );
        const unique: Record<string, DictEntry> = {};

        for (const candidate of terms) {
            const term = String(candidate.term || '').trim();
            if (!term) continue;

            try {
                // 构建安全 URL（服务端用绝对，客户端允许相对）
                const urlObj = baseUrl
                    ? new URL('/api/dictionary/lookup', baseUrl)
                    : new URL('/api/dictionary/lookup', 'http://localhost');
                urlObj.searchParams.set('q', term);
                if (options?.tenantId) urlObj.searchParams.set('tenantId', options.tenantId ?? '');
                if (options?.userId) urlObj.searchParams.set('userId', options.userId ?? '');
                const url = baseUrl ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;

                logger.debug(`Dictionary lookup: Querying "${term}" at URL: ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: { accept: 'application/json' },
                });

                if (!response.ok) {
                    logger.warn(
                        `Dictionary lookup: Request failed for "${term}" with status ${response.status}: ${response.statusText}`
                    );
                    continue;
                }

                const data = await response.json();
                logger.debug(`Dictionary lookup: Response for "${term}":`, data);
                const rows = Array.isArray(data?.data) ? data.data : [];
                logger.debug(`Dictionary lookup: Found ${rows.length} entries for "${term}"`);

                for (const item of rows) {
                    const entry: DictEntry = {
                        term: item.term ?? item.sourceText ?? '',
                        translation: item.translation ?? item.targetText ?? '',
                        notes: item.notes ?? undefined,
                        source: item.source ?? undefined,
                        dictionaryId: item.dictionaryId ?? undefined,
                        id: item.id ?? undefined,
                    };

                    if (!entry.term) continue;

                    const key = `${entry.term}::${entry.translation}`;
                    if (!unique[key]) {
                        unique[key] = entry;
                    }
                }
            } catch (error) {
                logger.warn(`Dictionary lookup failed for term "${term}":`, error);
                continue;
            }
        }

        const results = Object.values(unique);
        logger.debug(`Dictionary lookup: Found ${results.length} unique entries`);
        return results;
    }

    async lookupSingle(term: string, options?: any): Promise<DictEntry[]> {
        return this.lookup([{ term }], options);
    }
}

// Global instance
export const dictionaryTool = new DictionaryTool();
