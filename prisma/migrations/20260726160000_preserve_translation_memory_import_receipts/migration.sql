-- A TranslationMemory can be reassigned or retained after the account that
-- initiated an import is removed. Completion receipts are still the only
-- durable proof for that memory, so preserve provenance as nullable metadata
-- instead of cascading the proof away with the former user.
ALTER TABLE "TranslationMemoryImportReceipt"
DROP CONSTRAINT "TranslationMemoryImportReceipt_userId_fkey";

ALTER TABLE "TranslationMemoryImportReceipt"
ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "TranslationMemoryImportReceipt"
ADD CONSTRAINT "TranslationMemoryImportReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
