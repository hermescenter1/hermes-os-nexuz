-- Phase 33: API Platform Foundation
-- Adds ApiKey table. No breaking changes to existing tables.

CREATE TABLE "ApiKey" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "keyHash"        TEXT         NOT NULL,
    "prefix"         TEXT         NOT NULL,
    "last4"          TEXT         NOT NULL,
    "scopes"         JSONB        NOT NULL DEFAULT '[]',
    "lastUsedAt"     TIMESTAMP(3),
    "expiresAt"      TIMESTAMP(3),
    "createdById"    TEXT,
    "revokedAt"      TIMESTAMP(3),
    "revokedById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- Unique constraints: one prefix per table (lookup key), one hash per table (dedup)
CREATE UNIQUE INDEX "ApiKey_prefix_key"   ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_keyHash_key"  ON "ApiKey"("keyHash");

-- Fast org-scoped listing
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
