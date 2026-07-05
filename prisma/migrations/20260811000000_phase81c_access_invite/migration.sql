-- Phase 81C: access request approval — admin-issued invites (token hash only)
-- CreateTable
CREATE TABLE "AccessInvite" (
    "id"              TEXT NOT NULL,
    "email"           TEXT NOT NULL,
    "fullName"        TEXT,
    "company"         TEXT,
    "role"            TEXT NOT NULL DEFAULT 'customer',
    "tokenHash"       TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "usedAt"          TIMESTAMP(3),
    "createdByUserId" TEXT,
    "sourceLeadId"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessInvite_tokenHash_key" ON "AccessInvite"("tokenHash");
CREATE INDEX "AccessInvite_email_idx" ON "AccessInvite"("email");
CREATE INDEX "AccessInvite_status_idx" ON "AccessInvite"("status");
CREATE INDEX "AccessInvite_sourceLeadId_idx" ON "AccessInvite"("sourceLeadId");
