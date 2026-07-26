-- Preserve an unresolved gate when the historical initiating user is deleted;
-- the gate protects the memory itself and is resolved by its current owner.
ALTER TABLE "TranslationMemoryImportAmbiguity"
DROP CONSTRAINT "TranslationMemoryImportAmbiguity_userId_fkey";

ALTER TABLE "TranslationMemoryImportAmbiguity"
ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "TranslationMemoryImportAmbiguity"
ADD CONSTRAINT "TranslationMemoryImportAmbiguity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Reserve a memory before submitting its BullMQ job. The unique memory key
-- serializes new imports without relying on browser state or Redis history.
CREATE TABLE "TranslationMemoryImportReservation" (
    "jobId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT,
    "fileKey" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationMemoryImportReservation_pkey" PRIMARY KEY ("jobId")
);

CREATE UNIQUE INDEX "TranslationMemoryImportReservation_memoryId_key"
ON "TranslationMemoryImportReservation"("memoryId");

CREATE INDEX "TranslationMemoryImportReservation_userId_idx"
ON "TranslationMemoryImportReservation"("userId");

CREATE INDEX "TranslationMemoryImportReservation_createdAt_idx"
ON "TranslationMemoryImportReservation"("createdAt");

ALTER TABLE "TranslationMemoryImportReservation"
ADD CONSTRAINT "TranslationMemoryImportReservation_memoryId_fkey"
FOREIGN KEY ("memoryId") REFERENCES "TranslationMemory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranslationMemoryImportReservation"
ADD CONSTRAINT "TranslationMemoryImportReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
