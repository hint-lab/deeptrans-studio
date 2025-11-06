export interface DocumentTermExtractOptions {
    maxTerms?: number;
    chunkSize?: number; // 按字符粗分块，避免超长上下文
    overlap?: number; // 邻块重叠，减少边界丢失
    prompt?: string; // 术语偏好/领域提示
  }