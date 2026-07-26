-- Store each user's optional instruction layer for an individual workflow node.
CREATE TABLE "UserWorkflowPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWorkflowPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserWorkflowPrompt_userId_nodeKey_key"
ON "UserWorkflowPrompt"("userId", "nodeKey");

CREATE INDEX "UserWorkflowPrompt_userId_idx"
ON "UserWorkflowPrompt"("userId");

ALTER TABLE "UserWorkflowPrompt"
ADD CONSTRAINT "UserWorkflowPrompt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
