-- A queue-only completion from a pre-receipt worker is neither a durable
-- success nor proof that no rows were written. Persist this gate so a browser
-- refresh, another device, or BullMQ cleanup cannot silently allow a retry.
CREATE TABLE "TranslationMemoryImportAmbiguity" (
    "jobId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "TranslationMemoryImportAmbiguity_pkey" PRIMARY KEY ("jobId")
);

CREATE INDEX "TranslationMemoryImportAmbiguity_userId_memoryId_acknowledgedAt_idx"
ON "TranslationMemoryImportAmbiguity"("userId", "memoryId", "acknowledgedAt");

CREATE INDEX "TranslationMemoryImportAmbiguity_memoryId_idx"
ON "TranslationMemoryImportAmbiguity"("memoryId");

ALTER TABLE "TranslationMemoryImportAmbiguity"
ADD CONSTRAINT "TranslationMemoryImportAmbiguity_memoryId_fkey"
FOREIGN KEY ("memoryId") REFERENCES "TranslationMemory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranslationMemoryImportAmbiguity"
ADD CONSTRAINT "TranslationMemoryImportAmbiguity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
