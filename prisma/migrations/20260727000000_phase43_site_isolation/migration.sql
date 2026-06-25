-- Phase 43: Industrial Multi-Tenant Security & Site Isolation
--
-- ADDITIVE ONLY. No existing tables, columns, or indexes are modified.
-- Rollback: DROP TABLE "UserSite"; DROP TYPE "SiteRole"; DROP TYPE "SiteMemberStatus";
--
-- OWNER/ADMIN access model:
--   OWNER and ADMIN have IMPLICIT all-site access resolved at runtime.
--   They are EXCLUDED from the backfill. No UserSite rows are created for them.
--   UserSite rows are for explicit site assignments only.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "SiteRole" AS ENUM (
  'SITE_ADMIN',
  'SITE_MANAGER',
  'SITE_ENGINEER',
  'SITE_OPERATOR',
  'SITE_VIEWER'
);

CREATE TYPE "SiteMemberStatus" AS ENUM (
  'ACTIVE',
  'SUSPENDED'
);

-- ── UserSite table ───────────────────────────────────────────────────────────

CREATE TABLE "UserSite" (
  "id"             TEXT             NOT NULL,
  "userId"         TEXT             NOT NULL,
  "siteId"         TEXT             NOT NULL,
  "organizationId" TEXT             NOT NULL,
  "role"           "SiteRole"       NOT NULL DEFAULT 'SITE_VIEWER',
  "status"         "SiteMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedById"    TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserSite_userId_fkey"
    FOREIGN KEY ("userId")         REFERENCES "User"("id")            ON DELETE CASCADE,
  CONSTRAINT "UserSite_siteId_fkey"
    FOREIGN KEY ("siteId")         REFERENCES "IndustrialSite"("id")  ON DELETE CASCADE,
  CONSTRAINT "UserSite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")    ON DELETE CASCADE,
  -- One membership per (user, site)
  CONSTRAINT "UserSite_userId_siteId_key" UNIQUE ("userId", "siteId")
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX "UserSite_userId_idx"              ON "UserSite"("userId");
CREATE INDEX "UserSite_siteId_idx"              ON "UserSite"("siteId");
CREATE INDEX "UserSite_organizationId_userId_idx" ON "UserSite"("organizationId", "userId");

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Cross-join ACTIVE non-OWNER/ADMIN org members with all sites in their org.
-- OWNER and ADMIN are excluded: they use implicit access at runtime.
-- Role mapping:
--   MANAGER       → SITE_MANAGER
--   ENGINEER      → SITE_ENGINEER
--   VIEWER        → SITE_VIEWER
--   BILLING_ADMIN → SITE_VIEWER
--   MEMBER (dep.) → SITE_VIEWER
-- ON CONFLICT DO NOTHING: idempotent, safe to re-run.

INSERT INTO "UserSite" (
  "id", "userId", "siteId", "organizationId", "role", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  m."userId",
  s."id",
  m."organizationId",
  CASE m.role
    WHEN 'MANAGER'       THEN 'SITE_MANAGER'::"SiteRole"
    WHEN 'ENGINEER'      THEN 'SITE_ENGINEER'::"SiteRole"
    ELSE                      'SITE_VIEWER'::"SiteRole"
  END,
  'ACTIVE'::"SiteMemberStatus",
  NOW(),
  NOW()
FROM "OrganizationMember" m
JOIN "IndustrialSite" s ON s."organizationId" = m."organizationId"
WHERE m.status = 'ACTIVE'
  AND m.role NOT IN ('OWNER', 'ADMIN')
ON CONFLICT ("userId", "siteId") DO NOTHING;
