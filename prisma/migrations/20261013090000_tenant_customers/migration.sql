-- Executive Management Center slice G: a tenant's customers.
--
-- ADDITIVE. Two new tables and one new NULLABLE column on "ErpProject"; no
-- existing column changes type, no row is rewritten, no backfill. Every existing
-- project keeps "partyId" = NULL, so no figure anywhere changes when this applies.
--
-- "Party" is the tenant-owned counterparty the accounting plan (A2) names for
-- customers and vendors; this migration creates it with identity, contact and
-- follow-up columns only. "PartyInteraction" is an append-only contact log.
--
-- CROSS-TENANT LINKS ARE IMPOSSIBLE IN THE DATABASE: both foreign keys into
-- "Party" are COMPOSITE — ("organizationId", "partyId") REFERENCES
-- "Party"("organizationId", "id") — so an interaction or a project can only
-- point at a customer of its own organization, whatever the application does.
--
-- ROLLBACK (only before any row exists, or after an export):
--   ALTER TABLE "ErpProject" DROP CONSTRAINT "ErpProject_organizationId_partyId_fkey";
--   DROP INDEX "ErpProject_organizationId_partyId_idx";
--   ALTER TABLE "ErpProject" DROP COLUMN "partyId";
--   DROP TABLE "PartyInteraction"; DROP TABLE "Party";
--   DROP TYPE "PartyInteractionKind"; DROP TYPE "PartyStatus"; DROP TYPE "PartyKind";
-- Dropping the tables deletes customer data: take a backup first.

-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('CUSTOMER');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PartyInteractionKind" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'VISIT', 'NOTE');

-- AlterTable
ALTER TABLE "ErpProject" ADD COLUMN     "partyId" TEXT;

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "PartyKind" NOT NULL DEFAULT 'CUSTOMER',
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(200),
    "email" VARCHAR(254),
    "phone" VARCHAR(40),
    "city" VARCHAR(100),
    "country" VARCHAR(2),
    "notes" VARCHAR(4000),
    "followUpOwnerId" TEXT,
    "nextActionAt" TIMESTAMPTZ(6),
    "nextActionNote" VARCHAR(500),
    "lastInteractionAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyInteraction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "kind" "PartyInteractionKind" NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_organizationId_archivedAt_displayName_idx" ON "Party"("organizationId", "archivedAt", "displayName");

-- CreateIndex
CREATE INDEX "Party_organizationId_nextActionAt_idx" ON "Party"("organizationId", "nextActionAt");

-- CreateIndex
CREATE INDEX "Party_organizationId_followUpOwnerId_idx" ON "Party"("organizationId", "followUpOwnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_organizationId_id_key" ON "Party"("organizationId", "id");

-- CreateIndex
CREATE INDEX "PartyInteraction_organizationId_partyId_occurredAt_idx" ON "PartyInteraction"("organizationId", "partyId", "occurredAt");

-- CreateIndex
CREATE INDEX "ErpProject_organizationId_partyId_idx" ON "ErpProject"("organizationId", "partyId");

-- AddForeignKey
ALTER TABLE "ErpProject" ADD CONSTRAINT "ErpProject_organizationId_partyId_fkey" FOREIGN KEY ("organizationId", "partyId") REFERENCES "Party"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyInteraction" ADD CONSTRAINT "PartyInteraction_organizationId_partyId_fkey" FOREIGN KEY ("organizationId", "partyId") REFERENCES "Party"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Database-level bounds, repeating the application's validation so a row
-- written around the application still cannot be blank, mis-shaped or
-- self-contradictory.
ALTER TABLE "Party"
    ADD CONSTRAINT "Party_displayName_nonblank" CHECK (length(btrim("displayName")) > 0),
    ADD CONSTRAINT "Party_country_iso2" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$'),
    ADD CONSTRAINT "Party_email_shape" CHECK ("email" IS NULL OR "email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    ADD CONSTRAINT "Party_nextActionNote_needs_date" CHECK ("nextActionNote" IS NULL OR "nextActionAt" IS NOT NULL),
    ADD CONSTRAINT "Party_version_positive" CHECK ("version" >= 1);

ALTER TABLE "PartyInteraction"
    ADD CONSTRAINT "PartyInteraction_summary_nonblank" CHECK (length(btrim("summary")) > 0);
