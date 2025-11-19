// 混合检索配置类型定义
export interface HybridSearchConfig {
    // 检索模式
    mode: 'vector' | 'keyword' | 'hybrid';

    // 向量检索配置
    vectorSearch?: {
        enabled: boolean;
        topK: number;
        metric?: 'L2' | 'IP' | 'COSINE';
        ef?: number;
        weight?: number; // 向量检索结果权重，默认 0.7
    };

    // BM25/关键词检索配置
    keywordSearch?: {
        enabled: boolean;
        topK: number;
        matchType?: 'exact' | 'phrase' | 'fuzzy' | 'contains';
        boostFactor?: number; // BM25 boost 因子，默认 1.0
        weight?: number; // 关键词检索结果权重，默认 0.3
    };

    // 结果融合策略
    fusionStrategy?: {
        method: 'weighted_sum' | 'rank_fusion' | 'reciprocal_rank_fusion';
        // 加权求和的权重配置
        weights?: {
            vectorWeight: number;
            keywordWeight: number;
        };
        // 排名融合的参数
        rankFusion?: {
            k?: number; // RRF 中的 k 参数，默认 60
        };
    };

    // 最终返回结果数量
    finalTopK?: number;
}

// 检索结果类型
export interface SearchResult {
    id: string;
    score: number;
    text?: string;
    meta?: any;
    source: 'vector' | 'keyword' | 'hybrid'; // 结果来源
    originalScore?: number; // 原始分数（融合前）
    vectorScore?: number; // 向量检索分数
    keywordScore?: number; // 关键词检索分数
}

// BM25 检索结果
export interface BM25Result {
    id: string;
    score: number;
    text: string;
    meta?: any;
    highlights?: string[]; // 高亮的关键词
}

// 向量检索结果
export interface VectorResult {
    id: string;
    score: number;
    text: string;
    meta?: any;
    similarity: number; // 相似度分数
}

// 默认混合检索配置
export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
    mode: 'hybrid',
    vectorSearch: {
        enabled: true,
        topK: 10,
        metric: 'COSINE',
        ef: 128,
        weight: 0.7
    },
    keywordSearch: {
        enabled: true,
        topK: 10,
        matchType: 'contains',
        boostFactor: 1.0,
        weight: 0.3
    },
    fusionStrategy: {
        method: 'weighted_sum',
        weights: {
            vectorWeight: 0.7,
            keywordWeight: 0.3
        }
    },
    finalTopK: 10
};
