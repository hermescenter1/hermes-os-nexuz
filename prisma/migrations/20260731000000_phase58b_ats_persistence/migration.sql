-- Phase 58B: ATS Persistence Layer
-- Additive only: new enums, new tables, new FK constraints.
-- No existing tables are altered. Safe to run on a live database.

-- ── 1. Extend OrgRole enum with ATS-specific org roles ─────────────────────────
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'HR_MANAGER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'RECRUITER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'HIRING_MANAGER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'INTERVIEWER';

-- ── 2. Create ATS-specific enums ───────────────────────────────────────────────

CREATE TYPE "AtsJobStatus" AS ENUM (
  'DRAFT',
  'OPEN',
  'CLOSED',
  'ON_HOLD'
);

CREATE TYPE "AtsApplicationStatus" AS ENUM (
  'APPLIED',
  'SCREENING',
  'TECHNICAL_REVIEW',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED'
);

CREATE TYPE "AtsInterviewType" AS ENUM (
  'PHONE_SCREEN',
  'VIDEO_CALL',
  'TECHNICAL',
  'PANEL',
  'ONSITE'
);

CREATE TYPE "AtsInterviewDecision" AS ENUM (
  'PENDING',
  'ADVANCE',
  'HOLD',
  'REJECT'
);

-- ── 3. AtsJob ──────────────────────────────────────────────────────────────────

CREATE TABLE "AtsJob" (
    "id"               TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "departmentId"     TEXT,
    "title"            TEXT NOT NULL,
    "description"      TEXT NOT NULL,
    "requirements"     JSONB NOT NULL DEFAULT '[]',
    "responsibilities" JSONB NOT NULL DEFAULT '[]',
    "benefits"         JSONB NOT NULL DEFAULT '[]',
    "skills"           JSONB NOT NULL DEFAULT '[]',
    "location"         TEXT NOT NULL,
    "locationType"     TEXT NOT NULL DEFAULT 'onsite',
    "department"       TEXT NOT NULL,
    "salaryCurrency"   TEXT NOT NULL DEFAULT 'USD',
    "salaryMin"        INTEGER,
    "salaryMax"        INTEGER,
    "status"           "AtsJobStatus" NOT NULL DEFAULT 'DRAFT',
    "closingDate"      TIMESTAMP(3),
    "postedById"       TEXT,
    "isPublic"         BOOLEAN NOT NULL DEFAULT true,
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtsJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AtsJob_organizationId_status_idx"    ON "AtsJob"("organizationId", "status");
CREATE INDEX "AtsJob_organizationId_createdAt_idx" ON "AtsJob"("organizationId", "createdAt");
CREATE INDEX "AtsJob_status_isPublic_idx"          ON "AtsJob"("status", "isPublic");

ALTER TABLE "AtsJob" ADD CONSTRAINT "AtsJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. AtsCandidate ────────────────────────────────────────────────────────────

CREATE TABLE "AtsCandidate" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT,
    "email"             TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "phone"             TEXT,
    "location"          TEXT,
    "linkedinUrl"       TEXT,
    "portfolioUrl"      TEXT,
    "summary"           TEXT,
    "skills"            JSONB NOT NULL DEFAULT '[]',
    "languages"         JSONB NOT NULL DEFAULT '[]',
    "workAuthorization" TEXT NOT NULL DEFAULT 'citizen',
    "deletedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtsCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsCandidate_email_key"  ON "AtsCandidate"("email");
CREATE UNIQUE INDEX "AtsCandidate_userId_key" ON "AtsCandidate"("userId");
CREATE INDEX        "AtsCandidate_userId_idx" ON "AtsCandidate"("userId");

ALTER TABLE "AtsCandidate" ADD CONSTRAINT "AtsCandidate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. AtsApplication ─────────────────────────────────────────────────────────

CREATE TABLE "AtsApplication" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId"          TEXT NOT NULL,
    "candidateId"    TEXT NOT NULL,
    "status"         "AtsApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "coverLetter"    TEXT,
    "resumeUrl"      TEXT,
    "resumeText"     TEXT,
    "experience"     JSONB NOT NULL DEFAULT '[]',
    "education"      JSONB NOT NULL DEFAULT '[]',
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "totalYearsExp"  INTEGER,
    "source"         TEXT NOT NULL DEFAULT 'careers_portal',
    "notes"          TEXT,
    "assignedTo"     TEXT,
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtsApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsApplication_jobId_candidateId_key"      ON "AtsApplication"("jobId", "candidateId");
CREATE INDEX        "AtsApplication_organizationId_status_idx"   ON "AtsApplication"("organizationId", "status");
CREATE INDEX        "AtsApplication_organizationId_jobId_idx"    ON "AtsApplication"("organizationId", "jobId");
CREATE INDEX        "AtsApplication_candidateId_idx"             ON "AtsApplication"("candidateId");

ALTER TABLE "AtsApplication" ADD CONSTRAINT "AtsApplication_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsApplication" ADD CONSTRAINT "AtsApplication_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id") ON UPDATE CASCADE;
ALTER TABLE "AtsApplication" ADD CONSTRAINT "AtsApplication_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON UPDATE CASCADE;

-- ── 6. AtsInterview ───────────────────────────────────────────────────────────

CREATE TABLE "AtsInterview" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,
    "applicationId"      TEXT NOT NULL,
    "interviewType"      "AtsInterviewType"     NOT NULL DEFAULT 'VIDEO_CALL',
    "scheduledAt"        TIMESTAMP(3) NOT NULL,
    "durationMinutes"    INTEGER NOT NULL DEFAULT 60,
    "interviewerId"      TEXT,
    "interviewerName"    TEXT,
    "location"           TEXT,
    "notes"              TEXT,
    "feedback"           TEXT,
    "technicalScore"     INTEGER,
    "culturalScore"      INTEGER,
    "communicationScore" INTEGER,
    "overallScore"       INTEGER,
    "decision"           "AtsInterviewDecision" NOT NULL DEFAULT 'PENDING',
    "completedAt"        TIMESTAMP(3),
    "deletedAt"          TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtsInterview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AtsInterview_organizationId_applicationId_idx" ON "AtsInterview"("organizationId", "applicationId");
CREATE INDEX "AtsInterview_organizationId_scheduledAt_idx"   ON "AtsInterview"("organizationId", "scheduledAt");

ALTER TABLE "AtsInterview" ADD CONSTRAINT "AtsInterview_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsInterview" ADD CONSTRAINT "AtsInterview_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "AtsApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 7. AtsPipelineEvent ───────────────────────────────────────────────────────

CREATE TABLE "AtsPipelineEvent" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId"  TEXT NOT NULL,
    "fromStatus"     "AtsApplicationStatus",
    "toStatus"       "AtsApplicationStatus" NOT NULL,
    "changedById"    TEXT,
    "changedByName"  TEXT,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtsPipelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AtsPipelineEvent_organizationId_applicationId_createdAt_idx"
    ON "AtsPipelineEvent"("organizationId", "applicationId", "createdAt");
CREATE INDEX "AtsPipelineEvent_organizationId_createdAt_idx"
    ON "AtsPipelineEvent"("organizationId", "createdAt");

ALTER TABLE "AtsPipelineEvent" ADD CONSTRAINT "AtsPipelineEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsPipelineEvent" ADD CONSTRAINT "AtsPipelineEvent_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "AtsApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 8. AtsCandidateScore ──────────────────────────────────────────────────────

CREATE TABLE "AtsCandidateScore" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,
    "applicationId"      TEXT NOT NULL,
    "skillScore"         INTEGER NOT NULL DEFAULT 0,
    "experienceScore"    INTEGER NOT NULL DEFAULT 0,
    "locationScore"      INTEGER NOT NULL DEFAULT 0,
    "authorizationScore" INTEGER NOT NULL DEFAULT 0,
    "salaryScore"        INTEGER NOT NULL DEFAULT 0,
    "industryScore"      INTEGER NOT NULL DEFAULT 0,
    "overallScore"       INTEGER NOT NULL DEFAULT 0,
    "riskFlags"          JSONB NOT NULL DEFAULT '[]',
    "explanations"       JSONB NOT NULL DEFAULT '[]',
    "scoredAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoringVersion"     TEXT NOT NULL DEFAULT '1.0',
    CONSTRAINT "AtsCandidateScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsCandidateScore_applicationId_key" ON "AtsCandidateScore"("applicationId");
CREATE INDEX        "AtsCandidateScore_organizationId_overallScore_idx"
    ON "AtsCandidateScore"("organizationId", "overallScore");

ALTER TABLE "AtsCandidateScore" ADD CONSTRAINT "AtsCandidateScore_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsCandidateScore" ADD CONSTRAINT "AtsCandidateScore_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "AtsApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
