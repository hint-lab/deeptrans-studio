-- BullMQ may retry a job after the database work has committed but before it
-- records completion in Redis. Keep one durable, memory-owned receipt per job
-- so a retry returns the original result instead of importing duplicate rows.
CREATE TABLE "TranslationMemoryImportReceipt" (
    "jobId" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "indexed" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationMemoryImportReceipt_pkey" PRIMARY KEY ("jobId"),
    CONSTRAINT "TranslationMemoryImportReceipt_total_nonnegative" CHECK ("total" >= 0),
    CONSTRAINT "TranslationMemoryImportReceipt_indexed_range" CHECK ("indexed" >= 0 AND "indexed" <= "total")
);

CREATE INDEX "TranslationMemoryImportReceipt_memoryId_idx"
ON "TranslationMemoryImportReceipt"("memoryId");

CREATE INDEX "TranslationMemoryImportReceipt_userId_idx"
ON "TranslationMemoryImportReceipt"("userId");

CREATE UNIQUE INDEX "TranslationMemoryImportReceipt_userId_memoryId_inputFingerprint_key"
ON "TranslationMemoryImportReceipt"("userId", "memoryId", "inputFingerprint");

ALTER TABLE "TranslationMemoryImportReceipt"
ADD CONSTRAINT "TranslationMemoryImportReceipt_memoryId_fkey"
FOREIGN KEY ("memoryId") REFERENCES "TranslationMemory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranslationMemoryImportReceipt"
ADD CONSTRAINT "TranslationMemoryImportReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
