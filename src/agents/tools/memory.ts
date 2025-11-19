// Memory Tool - 记忆库查询工具
import {type HybridSearchConfig } from '@/types/hybrid-search';

export interface MemoryHit {
  id: string;
  source: string;
  target: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  searchMode?: string;
}

export interface MemorySearchOptions {
  tenantId?: string;
  limit?: number;
  searchConfig?: Partial<HybridSearchConfig>;
}

export class MemoryTool {
  private readonly apiBase: string;

  constructor(apiBase?: string) {
    this.apiBase = (apiBase || process.env.MEMORY_API_URL || process.env.INTERNAL_API_BASE || '').replace(/\/$/, '');
  }

  async search(query: string, options?: MemorySearchOptions): Promise<MemoryHit[]> {
    if (!query?.trim()) return [];

    try {
      // 构建完整的 API URL
      let url = '/api/memories/hybrid-search';

      // 在服务器端，需要使用完整的 URL
      if (typeof window === 'undefined') {
        // 服务器端环境
        const baseUrl = this.apiBase ||
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
          'http://localhost:3000';
        url = `${baseUrl}/api/memories/hybrid-search`;
      }

      // 使用新的混合检索 API
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          query,
          limit: options?.limit || 5,
          searchConfig: options?.searchConfig
        })
      });

      if (!response.ok) {
        console.warn('Memory hybrid search failed:', response.statusText);
        return [];
      }

      const data = await response.json();
      const rows = Array.isArray(data?.data) ? data.data : [];

      return rows.map((item: any) => ({
        id: item.id,
        source: item.source ?? item.sourceText ?? '',
        target: item.target ?? item.targetText ?? '',
        score: Number(item.score) || 0,
        vectorScore: item.vectorScore ? Number(item.vectorScore) : undefined,
        keywordScore: item.keywordScore ? Number(item.keywordScore) : undefined,
        searchMode: item.searchMode
      }));
    } catch (error) {
      console.warn('Memory search failed:', error);
      return [];
    }
  }

  private tokenize(text: string): string[] {
    const normalized = String(text || '').toLowerCase();
    const words = normalized.split(/[\s,.;:!?，。；：！、()\[\]{}"'""''<>\-_/]+/).filter(Boolean);
    const chars = Array.from(normalized.replace(/\s+/g, ''));
    const bigrams: string[] = [];

    for (let i = 0; i < Math.min(chars.length - 1, 50); i++) {
      const bigram = (chars[i] || '') + (chars[i + 1] || '');
      if (bigram.trim().length >= 2) {
        bigrams.push(bigram);
      }
    }

    return Array.from(new Set([...words, ...bigrams]));
  }
}

// Global instance
export const memoryTool = new MemoryTool();
