-- Persist IDE chat outside document/workflow metadata. A unique user-owned
-- scope row serializes first-thread creation and stores the active thread.
CREATE TYPE "ChatConversationMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "ChatConversationScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "projectId" TEXT,
    "documentItemId" TEXT,
    "activeConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "nextMessageSequence" INTEGER NOT NULL DEFAULT 0,
    "generationToken" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "ChatConversationMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatConversationScope_userId_scopeKey_key"
ON "ChatConversationScope"("userId", "scopeKey");

CREATE INDEX "ChatConversationScope_userId_projectId_documentItemId_idx"
ON "ChatConversationScope"("userId", "projectId", "documentItemId");
CREATE INDEX "ChatConversationScope_projectId_idx" ON "ChatConversationScope"("projectId");
CREATE INDEX "ChatConversationScope_documentItemId_idx" ON "ChatConversationScope"("documentItemId");
CREATE INDEX "ChatConversationScope_activeConversationId_idx"
ON "ChatConversationScope"("activeConversationId");

CREATE INDEX "ChatConversation_userId_scopeId_updatedAt_idx"
ON "ChatConversation"("userId", "scopeId", "updatedAt");
CREATE INDEX "ChatConversation_scopeId_updatedAt_idx"
ON "ChatConversation"("scopeId", "updatedAt");
CREATE UNIQUE INDEX "ChatConversationMessage_conversationId_sequence_key"
ON "ChatConversationMessage"("conversationId", "sequence");
CREATE INDEX "ChatConversationMessage_conversationId_sequence_idx"
ON "ChatConversationMessage"("conversationId", "sequence");

ALTER TABLE "ChatConversationScope"
ADD CONSTRAINT "ChatConversationScope_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationScope"
ADD CONSTRAINT "ChatConversationScope_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationScope"
ADD CONSTRAINT "ChatConversationScope_documentItemId_fkey"
FOREIGN KEY ("documentItemId") REFERENCES "DocumentItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversation"
ADD CONSTRAINT "ChatConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversation"
ADD CONSTRAINT "ChatConversation_scopeId_fkey"
FOREIGN KEY ("scopeId") REFERENCES "ChatConversationScope"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationMessage"
ADD CONSTRAINT "ChatConversationMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
