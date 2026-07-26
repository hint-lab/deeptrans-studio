-- The active thread is a durable pointer, not a browser-only hint. Repair
-- any stale pointer from the first chat rollout before making it referential.
-- The scope/user predicates also clear a pointer that was manually pointed at
-- another user's or another scope's conversation before this migration.
UPDATE "ChatConversationScope" AS scope
SET "activeConversationId" = NULL
WHERE scope."activeConversationId" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "ChatConversation" AS conversation
      WHERE conversation."id" = scope."activeConversationId"
        AND conversation."scopeId" = scope."id"
        AND conversation."userId" = scope."userId"
  );

ALTER TABLE "ChatConversationScope"
DROP CONSTRAINT IF EXISTS "ChatConversationScope_activeConversationId_fkey";

-- A conversation belongs to exactly one scope, so it can be the active
-- pointer for only that scope. The original single-column lookup index is
-- covered by this unique index.
DROP INDEX IF EXISTS "ChatConversationScope_activeConversationId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversationScope_activeConversationId_key"
ON "ChatConversationScope"("activeConversationId");

ALTER TABLE "ChatConversationScope"
ADD CONSTRAINT "ChatConversationScope_activeConversationId_fkey"
FOREIGN KEY ("activeConversationId") REFERENCES "ChatConversation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- The unique message-sequence index already supports the same lookup and
-- ordering as the former non-unique duplicate index.
DROP INDEX IF EXISTS "ChatConversationMessage_conversationId_sequence_idx";

-- The import gate is read by memory + acknowledgement state while the parent
-- memory row is locked. Keep that exact predicate indexed; the old
-- memory-only index is a prefix of this one and becomes redundant.
DROP INDEX IF EXISTS "TranslationMemoryImportAmbiguity_memoryId_idx";

CREATE INDEX IF NOT EXISTS "TranslationMemoryImportAmbiguity_memoryId_acknowledgedAt_idx"
ON "TranslationMemoryImportAmbiguity"("memoryId", "acknowledgedAt");
