-- Phase 79: Sales entry layer — demo request / lead capture
-- CreateTable
CREATE TABLE "SalesLead" (
    "id"            TEXT NOT NULL,
    "fullName"      TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "phone"         TEXT,
    "company"       TEXT,
    "roleTitle"     TEXT,
    "country"       TEXT,
    "industry"      TEXT,
    "companySize"   TEXT,
    "interest"      TEXT,
    "useCase"       TEXT,
    "preferredDemo" TEXT,
    "message"       TEXT,
    "source"        TEXT NOT NULL DEFAULT 'WEBSITE',
    "locale"        TEXT,
    "status"        TEXT NOT NULL DEFAULT 'NEW',
    "ipHash"        TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesLead_email_idx" ON "SalesLead"("email");
CREATE INDEX "SalesLead_status_idx" ON "SalesLead"("status");
CREATE INDEX "SalesLead_createdAt_idx" ON "SalesLead"("createdAt");
