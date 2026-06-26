-- Phase 69 — Enterprise Document Management System (EDMS)
-- All models prefixed with Edms to avoid collision with existing Document model
-- Idempotent: IF NOT EXISTS + duplicate_object exception guards

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "EdmsDocumentStatus" AS ENUM ('DRAFT','REVIEW','APPROVED','REJECTED','ARCHIVED','OBSOLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EdmsDocumentType" AS ENUM (
    'ENGINEERING_DRAWING','PID','ELECTRICAL_DRAWING','PLC_PROGRAM','SCADA_PROJECT',
    'COMMISSIONING_REPORT','INSPECTION_REPORT','FAT','SAT',
    'MANUAL','PROCEDURE','WORK_INSTRUCTION','CERTIFICATE',
    'VENDOR_DATASHEET','CONTRACT','QUOTATION','INVOICE','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EdmsApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EdmsRevisionType" AS ENUM ('MAJOR','MINOR','PATCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EdmsFolder" (
  "id"             TEXT        NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "parentId"       TEXT,
  "name"           TEXT        NOT NULL,
  "description"    TEXT,
  "path"           TEXT        NOT NULL DEFAULT '/',
  "color"          TEXT,
  "icon"           TEXT,
  "createdBy"      TEXT,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EdmsCategory" (
  "id"             TEXT        NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "name"           TEXT        NOT NULL,
  "description"    TEXT,
  "color"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EdmsTemplate" (
  "id"             TEXT             NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "name"           TEXT             NOT NULL,
  "description"    TEXT,
  "documentType"   "EdmsDocumentType" NOT NULL DEFAULT 'OTHER',
  "templateData"   TEXT,
  "isActive"       BOOLEAN          NOT NULL DEFAULT true,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EdmsRetentionPolicy" (
  "id"             TEXT              NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "name"           TEXT              NOT NULL,
  "documentType"   "EdmsDocumentType",
  "retentionDays"  INTEGER           NOT NULL DEFAULT 365,
  "autoArchive"    BOOLEAN           NOT NULL DEFAULT true,
  "autoDelete"     BOOLEAN           NOT NULL DEFAULT false,
  "description"    TEXT,
  "isActive"       BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EdmsDocument" (
  "id"               TEXT                 NOT NULL PRIMARY KEY,
  "organizationId"   TEXT,
  "folderId"         TEXT,
  "categoryId"       TEXT,
  "templateId"       TEXT,
  "title"            TEXT                 NOT NULL,
  "description"      TEXT,
  "documentType"     "EdmsDocumentType"   NOT NULL DEFAULT 'OTHER',
  "status"           "EdmsDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "currentRevision"  TEXT,
  "language"         TEXT                 NOT NULL DEFAULT 'en',
  "keywords"         TEXT[]               NOT NULL DEFAULT '{}',
  "ownerId"          TEXT,
  "erpProjectId"     TEXT,
  "workOrderId"      TEXT,
  "crmAccountId"     TEXT,
  "vendorId"         TEXT,
  "siteId"           TEXT,
  "equipmentId"      TEXT,
  "filePath"         TEXT,
  "fileSize"         INTEGER,
  "mimeType"         TEXT,
  "checksum"         TEXT,
  "isLocked"         BOOLEAN              NOT NULL DEFAULT false,
  "lockedBy"         TEXT,
  "lockedAt"         TIMESTAMP(3),
  "deletedAt"        TIMESTAMP(3),
  "createdBy"        TEXT,
  "createdAt"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsDocument_folderId_fkey"   FOREIGN KEY ("folderId")   REFERENCES "EdmsFolder"("id")   ON DELETE SET NULL,
  CONSTRAINT "EdmsDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EdmsCategory"("id") ON DELETE SET NULL,
  CONSTRAINT "EdmsDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EdmsTemplate"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "EdmsRevision" (
  "id"             TEXT             NOT NULL PRIMARY KEY,
  "documentId"     TEXT             NOT NULL,
  "revisionNumber" TEXT             NOT NULL,
  "revisionType"   "EdmsRevisionType" NOT NULL DEFAULT 'MINOR',
  "summary"        TEXT,
  "filePath"       TEXT,
  "fileSize"       INTEGER,
  "mimeType"       TEXT,
  "checksum"       TEXT,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsApproval" (
  "id"           TEXT                 NOT NULL PRIMARY KEY,
  "documentId"   TEXT                 NOT NULL,
  "revisionId"   TEXT,
  "stage"        INTEGER              NOT NULL DEFAULT 1,
  "approverRole" TEXT                 NOT NULL DEFAULT 'admin',
  "assignedTo"   TEXT,
  "status"       "EdmsApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "comment"      TEXT,
  "decidedAt"    TIMESTAMP(3),
  "decidedBy"    TEXT,
  "dueDate"      TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsComment" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "documentId"  TEXT        NOT NULL,
  "revisionId"  TEXT,
  "parentId"    TEXT,
  "userId"      TEXT,
  "content"     TEXT        NOT NULL,
  "isResolved"  BOOLEAN     NOT NULL DEFAULT false,
  "resolvedBy"  TEXT,
  "resolvedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsTag" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT        NOT NULL,
  "tagName"    TEXT        NOT NULL,
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsLink" (
  "id"               TEXT        NOT NULL PRIMARY KEY,
  "documentId"       TEXT        NOT NULL,
  "linkedDocumentId" TEXT        NOT NULL,
  "linkType"         TEXT        NOT NULL DEFAULT 'reference',
  "createdBy"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsPermission" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT,
  "folderId"   TEXT,
  "userId"     TEXT        NOT NULL,
  "role"       TEXT        NOT NULL DEFAULT 'reader',
  "grantedBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EdmsCheckout" (
  "id"           TEXT        NOT NULL PRIMARY KEY,
  "documentId"   TEXT        NOT NULL,
  "userId"       TEXT        NOT NULL,
  "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"        TIMESTAMP(3),
  "checkedInAt"  TIMESTAMP(3),
  "message"      TEXT,
  CONSTRAINT "EdmsCheckout_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsFavorite" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT        NOT NULL,
  "userId"     TEXT        NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsFavorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsShare" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "documentId"  TEXT        NOT NULL,
  "sharedWith"  TEXT        NOT NULL,
  "sharedBy"    TEXT,
  "expiresAt"   TIMESTAMP(3),
  "accessLevel" TEXT        NOT NULL DEFAULT 'reader',
  "token"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsSignature" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "documentId"  TEXT        NOT NULL,
  "revisionId"  TEXT,
  "userId"      TEXT        NOT NULL,
  "signedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "role"        TEXT,
  "certificate" TEXT,
  "ipAddress"   TEXT,
  CONSTRAINT "EdmsSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsAudit" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT        NOT NULL,
  "userId"     TEXT,
  "action"     TEXT        NOT NULL,
  "details"    TEXT,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsAudit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsWorkflow" (
  "id"                   TEXT        NOT NULL PRIMARY KEY,
  "documentId"           TEXT        NOT NULL,
  "workflowDefinitionId" TEXT,
  "status"               TEXT        NOT NULL DEFAULT 'PENDING',
  "startedAt"            TIMESTAMP(3),
  "completedAt"          TIMESTAMP(3),
  "triggeredBy"          TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsWorkflow_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsAttachment" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT        NOT NULL,
  "fileName"   TEXT        NOT NULL,
  "fileSize"   INTEGER,
  "mimeType"   TEXT,
  "filePath"   TEXT,
  "uploadedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdmsMetadata" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "documentId" TEXT        NOT NULL,
  "key"        TEXT        NOT NULL,
  "value"      TEXT        NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EdmsMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EdmsDocument"("id") ON DELETE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_edmsdoc_folder"    ON "EdmsDocument"("folderId");
CREATE INDEX IF NOT EXISTS "idx_edmsdoc_status"    ON "EdmsDocument"("status");
CREATE INDEX IF NOT EXISTS "idx_edmsdoc_type"      ON "EdmsDocument"("documentType");
CREATE INDEX IF NOT EXISTS "idx_edmsdoc_owner"     ON "EdmsDocument"("ownerId");
CREATE INDEX IF NOT EXISTS "idx_edmsdoc_erp"       ON "EdmsDocument"("erpProjectId");
CREATE INDEX IF NOT EXISTS "idx_edmsfolder_parent" ON "EdmsFolder"("parentId");
CREATE INDEX IF NOT EXISTS "idx_edmsrev_doc"       ON "EdmsRevision"("documentId");
CREATE INDEX IF NOT EXISTS "idx_edmsapr_doc"       ON "EdmsApproval"("documentId");
CREATE INDEX IF NOT EXISTS "idx_edmsapr_status"    ON "EdmsApproval"("status");
CREATE INDEX IF NOT EXISTS "idx_edmsaudit_doc"     ON "EdmsAudit"("documentId");
CREATE INDEX IF NOT EXISTS "idx_edmsfav_user"      ON "EdmsFavorite"("userId");
CREATE INDEX IF NOT EXISTS "idx_edmsmeta_doc"      ON "EdmsMetadata"("documentId");
