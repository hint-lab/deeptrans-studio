-- CreateEnum
CREATE TYPE "TranslationStage" AS ENUM ('NOT_STARTED', 'MT', 'MT_REVIEW', 'QA', 'QA_REVIEW', 'POST_EDIT', 'POST_EDIT_REVIEW', 'SIGN_OFF', 'COMPLETED', 'ERROR', 'CANCELED');

-- CreateEnum
CREATE TYPE "DictionaryVisibility" AS ENUM ('PUBLIC', 'PROJECT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TranslationProcessActorType" AS ENUM ('AGENT', 'USER');

-- CreateEnum
CREATE TYPE "TranslationProcessStepStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('WAITING', 'PARSING', 'SEGMENTING', 'TERMS_EXTRACTING', 'PREPROCESSED', 'TRANSLATING', 'COMPLETED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "avatar" TEXT,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "tenantId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "id_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'WAITING',
    "userId" TEXT,
    "structured" JSONB,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT,
    "status" "TranslationStage" NOT NULL DEFAULT 'NOT_STARTED',
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "metadata" JSONB,
    "preTranslateTerms" JSONB,
    "preTranslateDict" JSONB,
    "preTranslateEmbedded" JSONB,
    "qualityAssureBiTerm" JSONB,
    "qualityAssureSyntax" JSONB,
    "qualityAssureSyntaxEmbedded" JSONB,
    "postEditDiscourse" JSONB,
    "postEditEmbedded" JSONB,
    "userId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT NOT NULL,
    "visibility" "DictionaryVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "explanation" TEXT,
    "context" TEXT,
    "notes" TEXT,
    "origin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "dictionaryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMemory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL DEFAULT 'auto',
    "targetText" TEXT NOT NULL DEFAULT 'auto',
    "description" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMemoryEntry" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "sourceLang" TEXT,
    "targetLang" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TranslationMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationStageRecord" (
    "id" TEXT NOT NULL,
    "documentItemId" TEXT,
    "stepKey" "TranslationStage" NOT NULL,
    "actorType" "TranslationProcessActorType" NOT NULL DEFAULT 'AGENT',
    "actorId" TEXT,
    "userId" TEXT,
    "model" TEXT,
    "status" "TranslationProcessStepStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationStageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDictionary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dictionaryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Tenant_name_idx" ON "Tenant"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Project_userId_date_idx" ON "Project"("userId", "date");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_projectId_uploadedAt_idx" ON "Document"("projectId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentItem_documentId_order_key" ON "DocumentItem"("documentId", "order");

-- CreateIndex
CREATE INDEX "Dictionary_userId_idx" ON "Dictionary"("userId");

-- CreateIndex
CREATE INDEX "Dictionary_domain_idx" ON "Dictionary"("domain");

-- CreateIndex
CREATE INDEX "Dictionary_tenantId_idx" ON "Dictionary"("tenantId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_dictionaryId_idx" ON "DictionaryEntry"("dictionaryId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_sourceText_idx" ON "DictionaryEntry"("sourceText");

-- CreateIndex
CREATE INDEX "TranslationMemory_userId_idx" ON "TranslationMemory"("userId");

-- CreateIndex
CREATE INDEX "TranslationMemory_tenantId_idx" ON "TranslationMemory"("tenantId");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_memoryId_idx" ON "TranslationMemoryEntry"("memoryId");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_sourceLang_targetLang_idx" ON "TranslationMemoryEntry"("sourceLang", "targetLang");

-- CreateIndex
CREATE INDEX "TranslationStageRecord_documentItemId_idx" ON "TranslationStageRecord"("documentItemId");

-- CreateIndex
CREATE INDEX "TranslationStageRecord_documentItemId_stepKey_status_idx" ON "TranslationStageRecord"("documentItemId", "stepKey", "status");

-- CreateIndex
CREATE INDEX "ProjectDictionary_projectId_idx" ON "ProjectDictionary"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDictionary_dictionaryId_idx" ON "ProjectDictionary"("dictionaryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDictionary_projectId_dictionaryId_key" ON "ProjectDictionary"("projectId", "dictionaryId");

-- CreateIndex
CREATE INDEX "ProjectMemory_projectId_idx" ON "ProjectMemory"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMemory_memoryId_idx" ON "ProjectMemory"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMemory_projectId_memoryId_key" ON "ProjectMemory"("projectId", "memoryId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dictionary" ADD CONSTRAINT "Dictionary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dictionary" ADD CONSTRAINT "Dictionary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemory" ADD CONSTRAINT "TranslationMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemory" ADD CONSTRAINT "TranslationMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemory" ADD CONSTRAINT "TranslationMemory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "TranslationMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationStageRecord" ADD CONSTRAINT "TranslationStageRecord_documentItemId_fkey" FOREIGN KEY ("documentItemId") REFERENCES "DocumentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationStageRecord" ADD CONSTRAINT "TranslationStageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDictionary" ADD CONSTRAINT "ProjectDictionary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDictionary" ADD CONSTRAINT "ProjectDictionary_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "TranslationMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
