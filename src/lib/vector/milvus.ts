import { MilvusClient as MilvusClientCtor, DataType, IndexType } from '@zilliz/milvus2-sdk-node';
import { HybridSearchConfig, SearchResult, BM25Result, VectorResult, DEFAULT_HYBRID_CONFIG } from '@/types/hybrid-search';

type MilvusClient = InstanceType<typeof MilvusClientCtor>;

type MilvusStatsEntry = { key?: string; value?: string | number | null };

const toStatsArray = (maybeArray: unknown): MilvusStatsEntry[] => {
  return Array.isArray(maybeArray) ? (maybeArray as MilvusStatsEntry[]) : [];
};

const getRowCountFromStats = (stats: unknown): number => {
  const data = stats as { data?: any; stats?: any; row_count?: any } | undefined;
  const direct = Number((data?.data as any)?.row_count ?? (data as any)?.row_count);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const concatenated = [...toStatsArray(data?.stats), ...toStatsArray(data?.data)];
  const entry = concatenated.find((item) => item?.key === 'row_count');
  const value = typeof entry?.value === 'string' ? Number(entry.value) : Number(entry?.value ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

let client: MilvusClient | null = null;

export function milvus(): MilvusClient {
  if (!client) {
    client = new MilvusClientCtor({
      address: process.env.MILVUS_URL || 'localhost:19530',
      ssl: false
    });
  }
  return client;
}

export async function ensureCollection(params: {
  collection: string;
  dim: number;
  metric?: 'L2' | 'IP' | 'COSINE';
}) {
  const c = milvus();
  const metric = params.metric || 'COSINE';
  const exists = await c.hasCollection({ collection_name: params.collection });
  if (!exists.value) {
    console.log(`[MILVUS] Creating collection: ${params.collection} with dim: ${params.dim}`);
    await c.createCollection({
      collection_name: params.collection,
      fields: [
        { name: 'id', data_type: DataType.VarChar, is_primary_key: true, max_length: 64 },
        { name: 'text', data_type: DataType.VarChar, max_length: 8192 },
        { name: 'vector', data_type: DataType.FloatVector, type_params: { dim: String(params.dim) } as any },
        { name: 'meta', data_type: DataType.VarChar, max_length: 4096 },
      ],
      consistency_level: 'Session',
    });
    console.log(`[MILVUS] Collection created successfully`);
  } else {
    // 校验既有集合的字段与维度是否兼容；不兼容则删除重建（仅用于 smoke/开发环境）
    try {
      const info: any = await (c as any).describeCollection?.({ collection_name: params.collection });
      const fields: any[] = info?.schema?.fields || info?.data?.schema?.fields || [];
      const hasId = fields.some((f: any) => f.name === 'id' && f.data_type === DataType.VarChar);
      const hasText = fields.some((f: any) => f.name === 'text' && f.data_type === DataType.VarChar);
      const vec = fields.find((f: any) => f.name === 'vector');
      const hasVec = !!vec && vec.data_type === DataType.FloatVector;
      const configuredDim = Number(vec?.type_params?.dim || vec?.params?.dim || vec?.dim || 0);
      const hasMeta = fields.some((f: any) => f.name === 'meta' && f.data_type === DataType.VarChar);
      if (!hasId || !hasText || !hasVec || !hasMeta || (configuredDim && configuredDim !== params.dim)) {
        try { await c.releaseCollection({ collection_name: params.collection }); } catch { }
        await c.dropCollection({ collection_name: params.collection });
        await c.createCollection({
          collection_name: params.collection,
          fields: [
            { name: 'id', data_type: DataType.VarChar, is_primary_key: true, max_length: 64 },
            { name: 'text', data_type: DataType.VarChar, max_length: 8192 },
            { name: 'vector', data_type: DataType.FloatVector, type_params: { dim: String(params.dim) } as any },
            { name: 'meta', data_type: DataType.VarChar, max_length: 4096 },
          ],
          consistency_level: 'Session',
        });
      }
    } catch { }
  }
  // 建索引
  try {
    console.log(`[MILVUS] Creating index for collection: ${params.collection}`);
    await c.createIndex({
      collection_name: params.collection,
      field_name: 'vector',
      index_name: 'idx_vector',
      index_type: IndexType.HNSW,
      metric_type: metric as any,
      params: { M: 16, efConstruction: 200 },
    });
    console.log(`[MILVUS] Index created successfully`);
  } catch (e) {
    console.log(`[MILVUS] Index creation warning:`, e);
  }

  console.log(`[MILVUS] Loading collection: ${params.collection}`);
  await c.loadCollectionSync({ collection_name: params.collection });
  console.log(`[MILVUS] Collection loaded successfully`);
}

export async function upsertVectors(params: {
  collection: string;
  points: Array<{ id: string; text?: string; vector: number[]; meta?: Record<string, any> }>;
}) {
  try {
    const c = milvus();
    console.log(`[MILVUS] Upserting ${params.points.length} points to collection: ${params.collection}`);
    await ensureCollection({ collection: params.collection, dim: params.points[0]?.vector?.length || 1536 });
  } catch (initError: any) {
    console.error(`[MILVUS] Initialization failed:`, initError);
    throw new Error(`Milvus 初始化失败: ${initError.message}`);
  }

  const c = milvus();

  // 先查看集合的实际字段
  try {
    const desc: any = await (c as any).describeCollection?.({ collection_name: params.collection });
    const fields = desc?.schema?.fields || desc?.data?.schema?.fields || [];
    console.log(`[MILVUS] Collection ${params.collection} fields:`, fields.map((f: any) => ({ name: f.name, type: f.data_type })));
  } catch (e) {
    console.log(`[MILVUS] Could not describe collection:`, e);
  }

  const entities = params.points.map(p => {
    // 确保 ID 不超过最大长度（64）
    const id = String(p.id).substring(0, 64);
    // 确保文本不超过最大长度（8192）
    const text = String(p.text || '').substring(0, 8192);
    // 确保向量是有效的数字数组
    const vector = Array.isArray(p.vector) ? p.vector.filter(v => typeof v === 'number' && !isNaN(v)) : [];
    // 确保元数据 JSON 不超过最大长度（4096）
    const metaStr = JSON.stringify(p.meta || {});
    const meta = metaStr.length > 4096 ? JSON.stringify({ truncated: true }) : metaStr;

    return { id, text, vector, meta };
  });

  console.log(`[MILVUS] Inserting sample entity:`, {
    id: entities[0]?.id,
    idLength: entities[0]?.id?.length,
    textLength: entities[0]?.text?.length,
    vectorLength: entities[0]?.vector?.length,
    vectorType: typeof entities[0]?.vector?.[0],
    metaLength: entities[0]?.meta?.length,
    totalEntities: entities.length,
    firstFewVectorValues: entities[0]?.vector?.slice(0, 5),
    expectedDim: params.points[0]?.vector?.length
  });

  // 验证数据完整性
  const invalidEntities = entities.filter(e =>
    !e.id ||
    !Array.isArray(e.vector) ||
    e.vector.length === 0 ||
    e.vector.some(v => typeof v !== 'number' || isNaN(v))
  );

  if (invalidEntities.length > 0) {
    console.error(`[MILVUS] Found ${invalidEntities.length} invalid entities:`, invalidEntities.slice(0, 3));
    throw new Error(`数据验证失败: ${invalidEntities.length} 条记录格式不正确`);
  }

  try {
    const insertRes = await c.insert({ collection_name: params.collection, data: entities });
    console.log(`[MILVUS] Insert result:`, {
      succ_index: insertRes?.succ_index?.length || 0,
      err_index: insertRes?.err_index?.length || 0,
      insert_cnt: insertRes?.insert_cnt,
      acknowledged: insertRes?.acknowledged
    });

    // 检查插入是否成功
    if (insertRes?.err_index?.length > 0) {
      console.error(`[MILVUS] Insert errors:`, insertRes);
      throw new Error(`插入失败: ${insertRes.err_index.length} 条记录出错，详细信息请查看日志`);
    }

    // 强制刷新并等待完成
    console.log(`[MILVUS] Flushing collection...`);
    const flushRes = await c.flush({ collection_names: [params.collection] });
    console.log(`[MILVUS] Flush result status:`, flushRes?.status?.error_code);

    // 等待数据真正持久化 - 使用更长的等待时间和更频繁的检查
    let retries = 20;
    let lastRowCount = 0;
    while (retries > 0) {
      // 等待一段时间让数据持久化
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const stats = await c.getCollectionStatistics({ collection_name: params.collection });
        const rowCount = getRowCountFromStats(stats);
        console.log(`[MILVUS] Collection stats check ${21 - retries}: row_count = ${rowCount}, target = ${entities.length}`);

        if (rowCount >= entities.length) {
          console.log(`[MILVUS] ✅ Data confirmed persisted, row_count: ${rowCount}`);
          break;
        }

        // 如果行数有增长，说明在进展中
        if (rowCount > lastRowCount) {
          console.log(`[MILVUS] Progress detected: ${lastRowCount} -> ${rowCount}`);
          lastRowCount = rowCount;
          retries = Math.max(retries, 5); // 重置等待时间
        }
      } catch (statsError) {
        console.log(`[MILVUS] Stats check failed:`, statsError);
      }

      retries--;
    }

    // 最终检查
    const finalStats = await c.getCollectionStatistics({ collection_name: params.collection });
    const finalRowCount = getRowCountFromStats(finalStats);
    console.log(`[MILVUS] Final row count: ${finalRowCount}/${entities.length}`);

    if (finalRowCount === 0) {
      console.warn(`[MILVUS] ⚠️  Warning: No data persisted to collection after insert and flush`);
    }

    console.log(`[MILVUS] Insert and flush completed`);
  } catch (e: any) {
    console.log(`[MILVUS] Insert failed, error:`, e?.message);
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('field') || msg.includes('dim') || msg.includes('schema')) {
      // 回退：删除并重建集合后重试一次（仅 smoke/dev）
      try {
        console.log(`[MILVUS] Rebuilding collection due to field/schema error...`);
        await c.dropCollection({ collection_name: params.collection });
        await ensureCollection({ collection: params.collection, dim: params.points[0]?.vector?.length || 1536 });
        await c.insert({ collection_name: params.collection, data: entities });
        await c.flush({ collection_names: [params.collection] });
        console.log(`[MILVUS] Insert successful after rebuild`);
      } catch (e2) {
        console.log(`[MILVUS] Insert failed even after rebuild:`, e2);
        throw e2;
      }
    } else {
      throw e;
    }
  }
}

export async function searchVectors(params: {
  collection: string;
  vector: number[];
  k?: number;
  filter?: string;
  metric?: 'L2' | 'IP' | 'COSINE';
  ef?: number;
}) {
  const c = milvus();
  const k = Math.max(1, Math.min(200, params.k || 10));

  console.log(`[MILVUS] Searching in collection: ${params.collection}, k: ${k}, vector dim: ${params.vector.length}`);

  // 只确保集合存在，不重建 - 避免搜索时意外删除数据
  const exists = await c.hasCollection({ collection_name: params.collection });
  if (!exists.value) {
    console.log(`[MILVUS] Collection ${params.collection} does not exist for search`);
    return [];
  }

  // 确保集合已加载并检查状态
  try {
    await c.loadCollectionSync({ collection_name: params.collection });
    const stats = await c.getCollectionStatistics({ collection_name: params.collection });
    console.log(`[MILVUS] Collection stats before search:`, stats);

    const rowCount = getRowCountFromStats(stats);
    if (rowCount === 0) {
      console.log(`[MILVUS] Collection is empty, skipping search`);
      return [];
    }
  } catch (e) {
    console.log(`[MILVUS] Load collection warning:`, e);
  }

  // 等待一小段时间确保索引完成
  await new Promise(resolve => setTimeout(resolve, 100));

  const res = await c.search({
    collection_name: params.collection,
    data: [params.vector],
    anns_field: 'vector',
    output_fields: ['id', 'text', 'meta'],
    params: {
      metric_type: (params.metric || 'COSINE') as any,
      ef: params.ef || 128
    },
    limit: k,
    expr: params.filter,
  } as any);

  console.log(`[MILVUS] Search response:`, {
    status: res?.status,
    resultsLength: res?.results?.length,
    firstResult: res?.results?.[0]
  });

  const results = (res?.results || []) as any[];
  return results.map((r: any) => ({
    id: String(r.id || r?.entity?.id || r?.pk),
    score: Number(r.score || r.distance),
    text: r.text || r?.entity?.text,
    meta: safeParse(r.meta || r?.entity?.meta)
  }));
}

function safeParse(s?: string) {
  try { return s ? JSON.parse(s) : undefined } catch { return undefined }
}

// BM25 关键词检索
export async function searchKeywords(params: {
  collection: string;
  query: string;
  k?: number;
  filter?: string;
  matchType?: 'exact' | 'phrase' | 'fuzzy' | 'contains';
  boostFactor?: number;
}): Promise<BM25Result[]> {
  const c = milvus();
  const k = Math.max(1, Math.min(200, params.k || 10));
  const matchType = params.matchType || 'contains';
  const boostFactor = params.boostFactor || 1.0;

  console.log(`[MILVUS] BM25 searching in collection: ${params.collection}, query: "${params.query}", k: ${k}`);

  // 检查集合是否存在
  const exists = await c.hasCollection({ collection_name: params.collection });
  if (!exists.value) {
    console.log(`[MILVUS] Collection ${params.collection} does not exist for BM25 search`);
    return [];
  }

  // 确保集合已加载
  try {
    await c.loadCollectionSync({ collection_name: params.collection });
  } catch (e) {
    console.log(`[MILVUS] Load collection warning:`, e);
  }

  // 构建关键词搜索表达式
  const keywords = tokenizeQuery(params.query);
  if (!keywords.length) {
    return [];
  }

  let searchExpr = '';
  switch (matchType) {
    case 'exact':
      searchExpr = `text == "${params.query}"`;
      break;
    case 'phrase':
      searchExpr = `text like "%${params.query}%"`;
      break;
    case 'contains':
      // 使用 OR 连接所有关键词
      const containsExprs = keywords.map(kw => `text like "%${kw}%"`);
      searchExpr = containsExprs.join(' or ');
      break;
    case 'fuzzy':
      // 模糊匹配，使用更宽松的条件
      const fuzzyExprs = keywords.map(kw => `text like "%${kw}%"`);
      searchExpr = fuzzyExprs.join(' or ');
      break;
  }

  // 如果有额外的过滤条件，添加到搜索表达式中
  if (params.filter) {
    searchExpr = `(${searchExpr}) and (${params.filter})`;
  }

  try {
    const res = await c.query({
      collection_name: params.collection,
      expr: searchExpr,
      output_fields: ['id', 'text', 'meta'],
      limit: k * 5, // 多取一些，后面会进行 BM25 评分和排序
    } as any);

    const results = (res?.data || []) as any[];

    // 计算 BM25 分数
    const scoredResults = results.map((r: any) => {
      const text = r.text || '';
      const bm25Score = calculateBM25Score(params.query, text, boostFactor);
      const highlights = extractHighlights(params.query, text);

      return {
        id: String(r.id || r?.entity?.id || r?.pk),
        score: bm25Score,
        text: text,
        meta: safeParse(r.meta || r?.entity?.meta),
        highlights
      };
    });

    // 按 BM25 分数排序并返回前 k 个结果
    const sortedResults = scoredResults
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    console.log(`[MILVUS] BM25 search found ${sortedResults.length} results`);
    return sortedResults;

  } catch (error) {
    console.error(`[MILVUS] BM25 search error:`, error);
    return [];
  }
}

// 分词函数
function tokenizeQuery(query: string): string[] {
  const text = String(query || '').toLowerCase();
  // 分割为单词和中文字符
  const words = text.split(/[\s,.;:!?，。；：！？、()\[\]{}"'""''<>\-_/]+/).filter(Boolean);
  const chars = Array.from(text.replace(/\s+/g, ''));

  // 对于中文，也生成 bigram
  const bigrams: string[] = [];
  for (let i = 0; i < Math.min(chars.length - 1, 20); i++) {
    const bigram = (chars[i] || '') + (chars[i + 1] || '');
    if (bigram.trim().length >= 2) {
      bigrams.push(bigram);
    }
  }

  return Array.from(new Set([...words, ...bigrams])).slice(0, 20);
}

// 简化版 BM25 分数计算
function calculateBM25Score(query: string, text: string, boostFactor: number = 1.0): number {
  const queryTokens = tokenizeQuery(query);
  const textTokens = tokenizeQuery(text);

  if (!queryTokens.length || !textTokens.length) {
    return 0;
  }

  const textLength = textTokens.length;
  const avgDocLength = 100; // 假设平均文档长度
  const k1 = 1.5;
  const b = 0.75;

  let score = 0;

  for (const qToken of queryTokens) {
    // 计算词频 (TF)
    const tf = textTokens.filter(t => t === qToken).length;
    if (tf === 0) continue;

    // 简化的 IDF，实际应该基于整个语料库
    const idf = Math.log(1000 / (1 + tf)); // 假设语料库大小为 1000

    // BM25 公式
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (textLength / avgDocLength));

    score += idf * (numerator / denominator);
  }

  return score * boostFactor;
}

// 提取高亮关键词
function extractHighlights(query: string, text: string): string[] {
  const queryTokens = tokenizeQuery(query);
  const highlights: string[] = [];

  for (const token of queryTokens) {
    const regex = new RegExp(token, 'gi');
    const matches = text.match(regex);
    if (matches) {
      highlights.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return Array.from(new Set(highlights));
}

// 混合检索 - 结合向量检索和 BM25 检索
export async function hybridSearch(params: {
  collection: string;
  query: string;
  vector?: number[];
  config?: Partial<HybridSearchConfig>;
  filter?: string;
}): Promise<SearchResult[]> {
  const config = { ...DEFAULT_HYBRID_CONFIG, ...params.config };
  const { query, collection, vector, filter } = params;

  console.log(`[MILVUS] Hybrid search in collection: ${collection}, mode: ${config.mode}`);

  // 根据配置决定执行哪些检索
  const promises: Promise<any>[] = [];
  let vectorResults: VectorResult[] = [];
  let keywordResults: BM25Result[] = [];

  // 执行向量检索
  if (config.mode !== 'keyword' && config.vectorSearch?.enabled && vector) {
    promises.push(
      searchVectors({
        collection,
        vector,
        k: config.vectorSearch.topK,
        filter,
        metric: config.vectorSearch.metric,
        ef: config.vectorSearch.ef
      }).then(results => {
        vectorResults = results.map(r => ({
          ...r,
          similarity: r.score
        }));
        console.log(`[MILVUS] Vector search found ${vectorResults.length} results`);
      }).catch(error => {
        console.error(`[MILVUS] Vector search error:`, error);
        vectorResults = [];
      })
    );
  }

  // 执行关键词检索
  if (config.mode !== 'vector' && config.keywordSearch?.enabled && query.trim()) {
    promises.push(
      searchKeywords({
        collection,
        query,
        k: config.keywordSearch.topK,
        filter,
        matchType: config.keywordSearch.matchType,
        boostFactor: config.keywordSearch.boostFactor
      }).then(results => {
        keywordResults = results;
        console.log(`[MILVUS] Keyword search found ${keywordResults.length} results`);
      }).catch(error => {
        console.error(`[MILVUS] Keyword search error:`, error);
        keywordResults = [];
      })
    );
  }

  // 等待所有检索完成
  await Promise.all(promises);

  // 如果只有一种检索模式，直接返回结果
  if (config.mode === 'vector') {
    return vectorResults.map(r => ({
      ...r,
      source: 'vector' as const,
      originalScore: r.score,
      vectorScore: r.score
    }));
  }

  if (config.mode === 'keyword') {
    return keywordResults.map(r => ({
      ...r,
      source: 'keyword' as const,
      originalScore: r.score,
      keywordScore: r.score
    }));
  }

  // 混合模式：融合两种检索结果
  return fuseResults(vectorResults, keywordResults, config);
}

// 结果融合函数
function fuseResults(
  vectorResults: VectorResult[],
  keywordResults: BM25Result[],
  config: HybridSearchConfig
): SearchResult[] {
  const { fusionStrategy, finalTopK = 10 } = config;

  if (!fusionStrategy) {
    // 简单合并，按分数排序
    const combined = [
      ...vectorResults.map(r => ({ ...r, source: 'vector' as const })),
      ...keywordResults.map(r => ({ ...r, source: 'keyword' as const }))
    ];
    return combined
      .sort((a, b) => b.score - a.score)
      .slice(0, finalTopK);
  }

  switch (fusionStrategy.method) {
    case 'weighted_sum':
      return weightedSumFusion(vectorResults, keywordResults, config);

    case 'rank_fusion':
      return rankFusion(vectorResults, keywordResults, config);

    case 'reciprocal_rank_fusion':
      return reciprocalRankFusion(vectorResults, keywordResults, config);

    default:
      return weightedSumFusion(vectorResults, keywordResults, config);
  }
}

// 加权求和融合
function weightedSumFusion(
  vectorResults: VectorResult[],
  keywordResults: BM25Result[],
  config: HybridSearchConfig
): SearchResult[] {
  const vectorWeight = config.fusionStrategy?.weights?.vectorWeight || 0.7;
  const keywordWeight = config.fusionStrategy?.weights?.keywordWeight || 0.3;
  const finalTopK = config.finalTopK || 10;

  // 归一化分数
  const normalizedVectorResults = normalizeScores(vectorResults);
  const normalizedKeywordResults = normalizeScores(keywordResults);

  // 创建结果映射
  const resultMap = new Map<string, SearchResult>();

  // 处理向量检索结果
  for (const vr of normalizedVectorResults) {
    resultMap.set(vr.id, {
      id: vr.id,
      score: vr.score * vectorWeight,
      text: vr.text,
      meta: vr.meta,
      source: 'hybrid',
      originalScore: vr.score * vectorWeight,
      vectorScore: vr.score,
      keywordScore: 0
    });
  }

  // 处理关键词检索结果
  for (const kr of normalizedKeywordResults) {
    const existing = resultMap.get(kr.id);
    if (existing) {
      // 合并分数
      existing.score += kr.score * keywordWeight;
      existing.keywordScore = kr.score;
      existing.originalScore = existing.score;
    } else {
      // 新结果
      resultMap.set(kr.id, {
        id: kr.id,
        score: kr.score * keywordWeight,
        text: kr.text,
        meta: kr.meta,
        source: 'hybrid',
        originalScore: kr.score * keywordWeight,
        vectorScore: 0,
        keywordScore: kr.score
      });
    }
  }

  // 排序并返回结果
  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, finalTopK);
}

// 排名融合 (Rank Fusion)
function rankFusion(
  vectorResults: VectorResult[],
  keywordResults: BM25Result[],
  config: HybridSearchConfig
): SearchResult[] {
  const finalTopK = config.finalTopK || 10;

  // 为每个结果分配排名
  const vectorRanks = new Map<string, number>();
  vectorResults.forEach((r, i) => vectorRanks.set(r.id, i + 1));

  const keywordRanks = new Map<string, number>();
  keywordResults.forEach((r, i) => keywordRanks.set(r.id, i + 1));

  // 收集所有唯一的文档 ID
  const allIds = new Set([
    ...vectorResults.map(r => r.id),
    ...keywordResults.map(r => r.id)
  ]);

  const resultMap = new Map<string, SearchResult>();

  for (const id of allIds) {
    const vectorRank = vectorRanks.get(id);
    const keywordRank = keywordRanks.get(id);

    // 计算融合分数 (排名越小分数越高)
    const vectorScore = vectorRank ? 1 / vectorRank : 0;
    const keywordScore = keywordRank ? 1 / keywordRank : 0;
    const fusedScore = vectorScore + keywordScore;

    // 获取文档信息
    const vectorDoc = vectorResults.find(r => r.id === id);
    const keywordDoc = keywordResults.find(r => r.id === id);
    const doc = vectorDoc || keywordDoc;

    if (doc) {
      resultMap.set(id, {
        id,
        score: fusedScore,
        text: doc.text,
        meta: doc.meta,
        source: 'hybrid',
        originalScore: fusedScore,
        vectorScore: vectorDoc?.score || 0,
        keywordScore: keywordDoc?.score || 0
      });
    }
  }

  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, finalTopK);
}

// 倒数排名融合 (Reciprocal Rank Fusion)
function reciprocalRankFusion(
  vectorResults: VectorResult[],
  keywordResults: BM25Result[],
  config: HybridSearchConfig
): SearchResult[] {
  const k = config.fusionStrategy?.rankFusion?.k || 60;
  const finalTopK = config.finalTopK || 10;

  // 为每个结果分配排名
  const vectorRanks = new Map<string, number>();
  vectorResults.forEach((r, i) => vectorRanks.set(r.id, i + 1));

  const keywordRanks = new Map<string, number>();
  keywordResults.forEach((r, i) => keywordRanks.set(r.id, i + 1));

  // 收集所有唯一的文档 ID
  const allIds = new Set([
    ...vectorResults.map(r => r.id),
    ...keywordResults.map(r => r.id)
  ]);

  const resultMap = new Map<string, SearchResult>();

  for (const id of allIds) {
    const vectorRank = vectorRanks.get(id);
    const keywordRank = keywordRanks.get(id);

    // RRF 公式: score = 1/(k + rank)
    const vectorRRF = vectorRank ? 1 / (k + vectorRank) : 0;
    const keywordRRF = keywordRank ? 1 / (k + keywordRank) : 0;
    const rrfScore = vectorRRF + keywordRRF;

    // 获取文档信息
    const vectorDoc = vectorResults.find(r => r.id === id);
    const keywordDoc = keywordResults.find(r => r.id === id);
    const doc = vectorDoc || keywordDoc;

    if (doc) {
      resultMap.set(id, {
        id,
        score: rrfScore,
        text: doc.text,
        meta: doc.meta,
        source: 'hybrid',
        originalScore: rrfScore,
        vectorScore: vectorDoc?.score || 0,
        keywordScore: keywordDoc?.score || 0
      });
    }
  }

  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, finalTopK);
}

// 分数归一化
function normalizeScores<T extends { score: number }>(results: T[]): T[] {
  if (!results.length) return results;

  const scores = results.map(r => r.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;

  if (range === 0) {
    // 所有分数相同，归一化为 1
    return results.map(r => ({ ...r, score: 1 }));
  }

  return results.map(r => ({
    ...r,
    score: (r.score - minScore) / range
  }));
}


