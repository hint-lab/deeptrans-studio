// Dictionary Tool - 术语库查询工具
import { type DictEntry, type TermCandidate } from '@/types/terms';

export class DictionaryTool {
  private readonly apiBase: string;

  constructor(apiBase?: string) {
    const isServer = typeof window === 'undefined';
    const fromEnv = isServer
      ? (process.env.DICTIONARY_API_URL || process.env.INTERNAL_API_BASE || '')
      : (process.env.NEXT_PUBLIC_DICTIONARY_API_URL || '');
    this.apiBase = (apiBase || fromEnv || '').replace(/\/$/, '');
  }

  async lookup(terms: TermCandidate[], options?: any): Promise<DictEntry[]> {
    console.log('DictionaryTool.lookup 开始:', { 
      termsCount: terms?.length, 
      terms: terms?.map(t => t.term).slice(0, 10),
      options,
      apiBase: this.apiBase 
    });

    if (!terms?.length) {
      console.warn('Dictionary lookup: No terms provided');
      return [];
    }
    
    const isServer = typeof window === 'undefined';
    console.log('Dictionary lookup 环境:', { isServer, apiBase: this.apiBase });
    
    // 服务端必须使用绝对 URL；客户端可用相对 URL
    if (isServer && !this.apiBase) {
      console.warn('Dictionary lookup: Missing DICTIONARY_API_URL on server');
      return [];
    }
    const baseUrl = this.apiBase || '';

    console.log(`Dictionary lookup: Searching ${terms.length} terms using API base: ${this.apiBase}`);
    const unique: Record<string, DictEntry> = {};

    for (const candidate of terms) {
      const term = String(candidate.term || '').trim();
      if (!term) continue;

      try {
        // 构建安全 URL（服务端用绝对，客户端允许相对）
        const urlObj = baseUrl ? new URL('/api/dictionary/lookup', baseUrl) : new URL('/api/dictionary/lookup', 'http://localhost');
        urlObj.searchParams.set('q', term);
        if (options?.tenantId) urlObj.searchParams.set('tenantId', options.tenantId ?? '');
        if (options?.userId) urlObj.searchParams.set('userId', options.userId ?? '');
        const url = baseUrl ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;

        console.log(`Dictionary lookup: Querying "${term}" at URL: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json' }
        });

        if (!response.ok) {
          console.warn(`Dictionary lookup: Request failed for "${term}" with status ${response.status}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        console.log(`Dictionary lookup: Response for "${term}":`, data);
        const rows = Array.isArray(data?.data) ? data.data : [];
        console.log(`Dictionary lookup: Found ${rows.length} entries for "${term}"`);

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
        console.warn(`Dictionary lookup failed for term "${term}":`, error);
        continue;
      }
    }

    const results = Object.values(unique);
    console.log(`Dictionary lookup: Found ${results.length} unique entries`);
    return results;
  }

  async lookupSingle(term: string, options?: any): Promise<DictEntry[]> {
    return this.lookup([{ term }], options);
  }
}

// Global instance
export const dictionaryTool = new DictionaryTool();
