CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgroonga;

ALTER TABLE "TranslationMemoryEntry"
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS "TranslationMemoryEntry_embedding_hnsw_idx"
    ON "TranslationMemoryEntry"
    USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS "TranslationMemoryEntry_sourceText_trgm_idx"
    ON "TranslationMemoryEntry"
    USING gin ("sourceText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "TranslationMemoryEntry_targetText_trgm_idx"
    ON "TranslationMemoryEntry"
    USING gin ("targetText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "TranslationMemoryEntry_sourceText_pgroonga_idx"
    ON "TranslationMemoryEntry"
    USING pgroonga ("sourceText");

CREATE INDEX IF NOT EXISTS "TranslationMemoryEntry_targetText_pgroonga_idx"
    ON "TranslationMemoryEntry"
    USING pgroonga ("targetText");
