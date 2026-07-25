-- Embeddings are derived data. Clear the incompatible 1536-dimensional values
-- before aligning storage with the production model's 2048-dimensional output.
DROP INDEX IF EXISTS "TranslationMemoryEntry_embedding_hnsw_idx";

UPDATE "TranslationMemoryEntry"
SET embedding = NULL
WHERE embedding IS NOT NULL;

ALTER TABLE "TranslationMemoryEntry"
    ALTER COLUMN embedding TYPE vector(2048)
    USING embedding::vector(2048);

-- pgvector's vector HNSW index is limited to 2,000 dimensions. Index the
-- 2,048-dimensional vectors through halfvec while keeping full vectors stored.
CREATE INDEX "TranslationMemoryEntry_embedding_hnsw_idx"
    ON "TranslationMemoryEntry"
    USING hnsw ((embedding::halfvec(2048)) halfvec_cosine_ops)
    WHERE embedding IS NOT NULL;
