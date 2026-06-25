-- Phase 38: Industrial Copilot Foundation
-- Additive migration: 2 new enums + 3 new tables.
-- READ-ONLY COPILOT: No write path to industrial hardware.

CREATE TYPE "CopilotMessageRole"    AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "CopilotInsightSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "CopilotConversation" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT,
    "title"          TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CopilotConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CopilotMessage" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role"           "CopilotMessageRole" NOT NULL,
    "content"        TEXT NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CopilotInsight" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT,
    "assetId"        TEXT,
    "insightType"    TEXT NOT NULL,
    "severity"       "CopilotInsightSeverity" NOT NULL DEFAULT 'INFO',
    "title"          TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CopilotConversation_organizationId_createdAt_idx"
    ON "CopilotConversation"("organizationId", "createdAt");
CREATE INDEX "CopilotMessage_conversationId_createdAt_idx"
    ON "CopilotMessage"("conversationId", "createdAt");
CREATE INDEX "CopilotInsight_organizationId_createdAt_idx"
    ON "CopilotInsight"("organizationId", "createdAt");
CREATE INDEX "CopilotInsight_organizationId_assetId_createdAt_idx"
    ON "CopilotInsight"("organizationId", "assetId", "createdAt");

ALTER TABLE "CopilotConversation"
    ADD CONSTRAINT "CopilotConversation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopilotMessage"
    ADD CONSTRAINT "CopilotMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "CopilotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopilotInsight"
    ADD CONSTRAINT "CopilotInsight_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
