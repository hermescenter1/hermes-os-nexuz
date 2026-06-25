-- Phase 60: Hermes Training Academy
-- Additive only: new OrgRole values, 9 new tables, FK constraints.
-- No existing tables are altered. Safe to run on a live database.

-- ── 1. Extend OrgRole enum ────────────────────────────────────────────────────
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'ACADEMY_ADMIN';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'CUSTOMER_SUCCESS_MANAGER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'STUDENT';

-- ── 2. AcademyCourse ──────────────────────────────────────────────────────────

CREATE TABLE "AcademyCourse" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "slug"              TEXT NOT NULL,
    "description"       TEXT NOT NULL,
    "category"          TEXT NOT NULL DEFAULT 'general',
    "level"             TEXT NOT NULL DEFAULT 'beginner',
    "estimatedHours"    INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl"      TEXT,
    "isPublished"       BOOLEAN NOT NULL DEFAULT false,
    "isFeatured"        BOOLEAN NOT NULL DEFAULT false,
    "enrollmentType"    TEXT NOT NULL DEFAULT 'open',
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "passingScore"      INTEGER NOT NULL DEFAULT 80,
    "instructorName"    TEXT,
    "instructorBio"     TEXT,
    "tags"              JSONB NOT NULL DEFAULT '[]',
    "targetAudience"    JSONB NOT NULL DEFAULT '[]',
    "createdById"       TEXT,
    "deletedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyCourse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyCourse_organizationId_slug_key" ON "AcademyCourse"("organizationId", "slug");
CREATE INDEX "AcademyCourse_organizationId_isPublished_idx"  ON "AcademyCourse"("organizationId", "isPublished");
CREATE INDEX "AcademyCourse_organizationId_category_idx"     ON "AcademyCourse"("organizationId", "category");

ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. AcademyModule ──────────────────────────────────────────────────────────

CREATE TABLE "AcademyModule" (
    "id"             TEXT NOT NULL,
    "courseId"       TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "orderIndex"     INTEGER NOT NULL DEFAULT 0,
    "isPublished"    BOOLEAN NOT NULL DEFAULT true,
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyModule_courseId_orderIndex_idx" ON "AcademyModule"("courseId", "orderIndex");

ALTER TABLE "AcademyModule" ADD CONSTRAINT "AcademyModule_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. AcademyLesson ──────────────────────────────────────────────────────────

CREATE TABLE "AcademyLesson" (
    "id"              TEXT NOT NULL,
    "moduleId"        TEXT NOT NULL,
    "courseId"        TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "content"         TEXT,
    "lessonType"      TEXT NOT NULL DEFAULT 'text',
    "videoUrl"        TEXT,
    "resourceUrl"     TEXT,
    "resourceName"    TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "orderIndex"      INTEGER NOT NULL DEFAULT 0,
    "isPublished"     BOOLEAN NOT NULL DEFAULT true,
    "isFree"          BOOLEAN NOT NULL DEFAULT false,
    "deletedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyLesson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyLesson_courseId_orderIndex_idx"  ON "AcademyLesson"("courseId", "orderIndex");
CREATE INDEX "AcademyLesson_moduleId_orderIndex_idx"  ON "AcademyLesson"("moduleId", "orderIndex");

ALTER TABLE "AcademyLesson" ADD CONSTRAINT "AcademyLesson_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "AcademyModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyLesson" ADD CONSTRAINT "AcademyLesson_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. AcademyQuiz ────────────────────────────────────────────────────────────

CREATE TABLE "AcademyQuiz" (
    "id"               TEXT NOT NULL,
    "courseId"         TEXT NOT NULL,
    "lessonId"         TEXT,
    "organizationId"   TEXT NOT NULL,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "passingScore"     INTEGER NOT NULL DEFAULT 80,
    "timeLimitMinutes" INTEGER,
    "maxAttempts"      INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "isPublished"      BOOLEAN NOT NULL DEFAULT true,
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyQuiz_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyQuiz_courseId_idx"  ON "AcademyQuiz"("courseId");
CREATE INDEX "AcademyQuiz_lessonId_idx"  ON "AcademyQuiz"("lessonId");

ALTER TABLE "AcademyQuiz" ADD CONSTRAINT "AcademyQuiz_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyQuiz" ADD CONSTRAINT "AcademyQuiz_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "AcademyLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. AcademyQuizQuestion ────────────────────────────────────────────────────

CREATE TABLE "AcademyQuizQuestion" (
    "id"             TEXT NOT NULL,
    "quizId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "questionText"   TEXT NOT NULL,
    "questionType"   TEXT NOT NULL DEFAULT 'single_choice',
    "options"        JSONB NOT NULL DEFAULT '[]',
    "correctAnswers" JSONB NOT NULL DEFAULT '[]',
    "explanation"    TEXT,
    "points"         INTEGER NOT NULL DEFAULT 1,
    "orderIndex"     INTEGER NOT NULL DEFAULT 0,
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyQuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyQuizQuestion_quizId_orderIndex_idx" ON "AcademyQuizQuestion"("quizId", "orderIndex");

ALTER TABLE "AcademyQuizQuestion" ADD CONSTRAINT "AcademyQuizQuestion_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "AcademyQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 7. AcademyEnrollment ─────────────────────────────────────────────────────

CREATE TABLE "AcademyEnrollment" (
    "id"              TEXT NOT NULL,
    "courseId"        TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "candidateId"     TEXT,
    "enrolledById"    TEXT,
    "completedAt"     TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "expiresAt"       TIMESTAMP(3),
    "source"          TEXT NOT NULL DEFAULT 'self',
    "deletedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyEnrollment_courseId_userId_key" ON "AcademyEnrollment"("courseId", "userId");
CREATE INDEX "AcademyEnrollment_organizationId_userId_idx"  ON "AcademyEnrollment"("organizationId", "userId");
CREATE INDEX "AcademyEnrollment_organizationId_courseId_idx" ON "AcademyEnrollment"("organizationId", "courseId");
CREATE INDEX "AcademyEnrollment_candidateId_idx"            ON "AcademyEnrollment"("candidateId");

ALTER TABLE "AcademyEnrollment" ADD CONSTRAINT "AcademyEnrollment_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyEnrollment" ADD CONSTRAINT "AcademyEnrollment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyEnrollment" ADD CONSTRAINT "AcademyEnrollment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyEnrollment" ADD CONSTRAINT "AcademyEnrollment_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 8. AcademyProgress ───────────────────────────────────────────────────────

CREATE TABLE "AcademyProgress" (
    "id"               TEXT NOT NULL,
    "enrollmentId"     TEXT NOT NULL,
    "lessonId"         TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "completedAt"      TIMESTAMP(3),
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyProgress_enrollmentId_lessonId_key" ON "AcademyProgress"("enrollmentId", "lessonId");
CREATE INDEX "AcademyProgress_enrollmentId_idx" ON "AcademyProgress"("enrollmentId");
CREATE INDEX "AcademyProgress_userId_idx"        ON "AcademyProgress"("userId");

ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "AcademyEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "AcademyLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 9. AcademyCertificate ─────────────────────────────────────────────────────

CREATE TABLE "AcademyCertificate" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "courseId"          TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "enrollmentId"      TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "issuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"         TIMESTAMP(3),
    "metadata"          JSONB NOT NULL DEFAULT '{}',
    "deletedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyCertificate_enrollmentId_key"      ON "AcademyCertificate"("enrollmentId");
CREATE UNIQUE INDEX "AcademyCertificate_certificateNumber_key"  ON "AcademyCertificate"("certificateNumber");
CREATE UNIQUE INDEX "AcademyCertificate_verificationToken_key"  ON "AcademyCertificate"("verificationToken");
CREATE INDEX "AcademyCertificate_organizationId_userId_idx"    ON "AcademyCertificate"("organizationId", "userId");
CREATE INDEX "AcademyCertificate_organizationId_courseId_idx"  ON "AcademyCertificate"("organizationId", "courseId");
CREATE INDEX "AcademyCertificate_verificationToken_idx"        ON "AcademyCertificate"("verificationToken");

ALTER TABLE "AcademyCertificate" ADD CONSTRAINT "AcademyCertificate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyCertificate" ADD CONSTRAINT "AcademyCertificate_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON UPDATE CASCADE;
ALTER TABLE "AcademyCertificate" ADD CONSTRAINT "AcademyCertificate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "AcademyCertificate" ADD CONSTRAINT "AcademyCertificate_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "AcademyEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 10. AcademyQuizAttempt ───────────────────────────────────────────────────

CREATE TABLE "AcademyQuizAttempt" (
    "id"               TEXT NOT NULL,
    "quizId"           TEXT NOT NULL,
    "enrollmentId"     TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "answers"          JSONB NOT NULL DEFAULT '[]',
    "score"            INTEGER NOT NULL DEFAULT 0,
    "passed"           BOOLEAN NOT NULL DEFAULT false,
    "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"      TIMESTAMP(3),
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "attemptNumber"    INTEGER NOT NULL DEFAULT 1,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyQuizAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyQuizAttempt_quizId_enrollmentId_idx" ON "AcademyQuizAttempt"("quizId", "enrollmentId");
CREATE INDEX "AcademyQuizAttempt_enrollmentId_idx"        ON "AcademyQuizAttempt"("enrollmentId");
CREATE INDEX "AcademyQuizAttempt_userId_idx"              ON "AcademyQuizAttempt"("userId");

ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "AcademyQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "AcademyEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
