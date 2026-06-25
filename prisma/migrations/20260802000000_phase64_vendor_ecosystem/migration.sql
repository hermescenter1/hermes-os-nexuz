-- Phase 64 — Vendor Ecosystem Platform
-- Migration: 20260802000000_phase64_vendor_ecosystem

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "VendorType" AS ENUM (
    'TECHNOLOGY_PROVIDER', 'SYSTEM_INTEGRATOR', 'SERVICE_PROVIDER',
    'MANUFACTURER', 'DISTRIBUTOR', 'CONSULTANT', 'TRAINING_PROVIDER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorTier" AS ENUM ('PREMIUM', 'CERTIFIED', 'STANDARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorStatus" AS ENUM (
    'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorComplianceStatus" AS ENUM (
    'PENDING', 'COMPLIANT', 'NON_COMPLIANT', 'UNDER_REVIEW', 'EXEMPT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorDocType" AS ENUM (
    'CERTIFICATION', 'INSURANCE', 'COMPANY_REGISTRATION', 'PRODUCT_CATALOG',
    'CASE_STUDY', 'PARTNERSHIP_AGREEMENT', 'NDA', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── VendorCategory ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorCategory" (
    "id"            TEXT NOT NULL,
    "slug"          TEXT NOT NULL,
    "nameEn"        TEXT NOT NULL,
    "nameFa"        TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionFa" TEXT,
    "icon"          TEXT,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VendorCategory_slug_key" ON "VendorCategory"("slug");
CREATE INDEX IF NOT EXISTS "VendorCategory_isActive_sortOrder_idx" ON "VendorCategory"("isActive", "sortOrder");

-- ── VendorProfile ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorProfile" (
    "id"                  TEXT NOT NULL,
    "slug"                TEXT NOT NULL,
    "nameEn"              TEXT NOT NULL,
    "nameFa"              TEXT NOT NULL,
    "logoUrl"             TEXT,
    "websiteUrl"          TEXT,
    "headquartersCity"    TEXT,
    "headquartersCountry" TEXT NOT NULL DEFAULT 'Iran',
    "foundedYear"         INTEGER,
    "employeeCount"       TEXT,
    "descriptionEn"       TEXT,
    "descriptionFa"       TEXT,
    "categoryId"          TEXT,
    "vendorType"          "VendorType" NOT NULL DEFAULT 'TECHNOLOGY_PROVIDER',
    "tier"                "VendorTier" NOT NULL DEFAULT 'STANDARD',
    "status"              "VendorStatus" NOT NULL DEFAULT 'PENDING',
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "isFeatured"          BOOLEAN NOT NULL DEFAULT false,
    "isVerified"          BOOLEAN NOT NULL DEFAULT false,
    "contactEmail"        TEXT,
    "contactPhone"        TEXT,
    "regionsServed"       TEXT[] NOT NULL DEFAULT '{}',
    "performanceScore"    DOUBLE PRECISION,
    "reviewCount"         INTEGER NOT NULL DEFAULT 0,
    "averageRating"       DOUBLE PRECISION,
    "complianceStatus"    "VendorComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "userId"              TEXT,
    "organizationId"      TEXT,
    "approvedAt"          TIMESTAMP(3),
    "approvedBy"          TEXT,
    "deletedAt"           TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VendorProfile_slug_key"        ON "VendorProfile"("slug");
CREATE INDEX IF NOT EXISTS "VendorProfile_status_isActive_idx"    ON "VendorProfile"("status", "isActive");
CREATE INDEX IF NOT EXISTS "VendorProfile_categoryId_idx"         ON "VendorProfile"("categoryId");
CREATE INDEX IF NOT EXISTS "VendorProfile_isFeatured_idx"         ON "VendorProfile"("isFeatured");
CREATE INDEX IF NOT EXISTS "VendorProfile_slug_idx"               ON "VendorProfile"("slug");
CREATE INDEX IF NOT EXISTS "VendorProfile_createdAt_idx"          ON "VendorProfile"("createdAt");

-- ── VendorCapability ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorCapability" (
    "id"          TEXT NOT NULL,
    "vendorId"    TEXT NOT NULL,
    "nameEn"      TEXT NOT NULL,
    "nameFa"      TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "level"       TEXT NOT NULL DEFAULT 'STANDARD',
    "certifiedBy" TEXT,
    "isVerified"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorCapability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorCapability_vendorId_idx"  ON "VendorCapability"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorCapability_category_idx"  ON "VendorCapability"("category");

-- ── VendorService ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorService" (
    "id"            TEXT NOT NULL,
    "vendorId"      TEXT NOT NULL,
    "nameEn"        TEXT NOT NULL,
    "nameFa"        TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionFa" TEXT,
    "category"      TEXT,
    "priceModel"    TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorService_vendorId_idx" ON "VendorService"("vendorId");

-- ── VendorProduct ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorProduct" (
    "id"            TEXT NOT NULL,
    "vendorId"      TEXT NOT NULL,
    "nameEn"        TEXT NOT NULL,
    "nameFa"        TEXT NOT NULL,
    "skuCode"       TEXT,
    "descriptionEn" TEXT,
    "descriptionFa" TEXT,
    "category"      TEXT,
    "imageUrl"      TEXT,
    "productUrl"    TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorProduct_vendorId_idx" ON "VendorProduct"("vendorId");

-- ── VendorDocument ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorDocument" (
    "id"           TEXT NOT NULL,
    "vendorId"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "documentType" "VendorDocType" NOT NULL,
    "fileUrl"      TEXT,
    "isPublic"     BOOLEAN NOT NULL DEFAULT false,
    "expiresAt"    TIMESTAMP(3),
    "uploadedBy"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorDocument_vendorId_idx" ON "VendorDocument"("vendorId");

-- ── VendorComplianceRecord ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorComplianceRecord" (
    "id"             TEXT NOT NULL,
    "vendorId"       TEXT NOT NULL,
    "complianceType" TEXT NOT NULL,
    "status"         "VendorComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "certBody"       TEXT,
    "certNumber"     TEXT,
    "issuedAt"       TIMESTAMP(3),
    "expiresAt"      TIMESTAMP(3),
    "notes"          TEXT,
    "reviewedBy"     TEXT,
    "version"        INTEGER NOT NULL DEFAULT 1,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorComplianceRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorComplianceRecord_vendorId_idx"        ON "VendorComplianceRecord"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorComplianceRecord_complianceType_idx"   ON "VendorComplianceRecord"("complianceType");

-- ── VendorReview ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorReview" (
    "id"             TEXT NOT NULL,
    "vendorId"       TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "rating"         INTEGER NOT NULL,
    "title"          TEXT,
    "bodyEn"         TEXT,
    "bodyFa"         TEXT,
    "projectType"    TEXT,
    "isVerified"     BOOLEAN NOT NULL DEFAULT false,
    "isPublic"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorReview_vendorId_idx"       ON "VendorReview"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorReview_reviewerUserId_idx" ON "VendorReview"("reviewerUserId");

-- ── VendorPerformanceMetric ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorPerformanceMetric" (
    "id"         TEXT NOT NULL,
    "vendorId"   TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value"      DOUBLE PRECISION NOT NULL,
    "unit"       TEXT,
    "period"     TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    CONSTRAINT "VendorPerformanceMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorPerformanceMetric_vendorId_idx"   ON "VendorPerformanceMetric"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorPerformanceMetric_metricName_idx" ON "VendorPerformanceMetric"("metricName");

-- ── VendorOnboardingRequest ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VendorOnboardingRequest" (
    "id"                  TEXT NOT NULL,
    "companyNameEn"       TEXT NOT NULL,
    "companyNameFa"       TEXT,
    "websiteUrl"          TEXT,
    "headquartersCity"    TEXT,
    "headquartersCountry" TEXT NOT NULL DEFAULT 'Iran',
    "foundedYear"         INTEGER,
    "employeeCount"       TEXT,
    "contactNameEn"       TEXT NOT NULL,
    "contactNameFa"       TEXT,
    "contactEmail"        TEXT NOT NULL,
    "contactPhone"        TEXT,
    "contactTitle"        TEXT,
    "vendorType"          TEXT NOT NULL,
    "categorySlug"        TEXT,
    "servicesOffered"     TEXT[] NOT NULL DEFAULT '{}',
    "industrialExpertise" TEXT[] NOT NULL DEFAULT '{}',
    "regionsServed"       TEXT[] NOT NULL DEFAULT '{}',
    "certifications"      TEXT[] NOT NULL DEFAULT '{}',
    "companyDescEn"       TEXT,
    "companyDescFa"       TEXT,
    "status"              TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy"          TEXT,
    "reviewNotes"         TEXT,
    "rejectionReason"     TEXT,
    "privacyAccepted"     BOOLEAN NOT NULL DEFAULT false,
    "termsAccepted"       BOOLEAN NOT NULL DEFAULT false,
    "gdprAccepted"        BOOLEAN NOT NULL DEFAULT false,
    "sessionId"           TEXT,
    "resultVendorId"      TEXT,
    "submittedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt"          TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorOnboardingRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorOnboardingRequest_status_createdAt_idx" ON "VendorOnboardingRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "VendorOnboardingRequest_contactEmail_idx"     ON "VendorOnboardingRequest"("contactEmail");

-- ── Foreign key constraints ───────────────────────────────────────────────────

ALTER TABLE "VendorProfile"
    ADD CONSTRAINT "VendorProfile_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "VendorCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorCapability"
    ADD CONSTRAINT "VendorCapability_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorService"
    ADD CONSTRAINT "VendorService_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorProduct"
    ADD CONSTRAINT "VendorProduct_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorDocument"
    ADD CONSTRAINT "VendorDocument_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorComplianceRecord"
    ADD CONSTRAINT "VendorComplianceRecord_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorReview"
    ADD CONSTRAINT "VendorReview_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorPerformanceMetric"
    ADD CONSTRAINT "VendorPerformanceMetric_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
