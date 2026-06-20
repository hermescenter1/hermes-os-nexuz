-- Phase 28: Authentication & Security Foundation
-- Additive migration: extends User, adds RefreshToken, VerificationToken, PasswordResetToken

-- Extend User with Phase 28 fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified"       BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt"     TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil"         TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt"         TIMESTAMP(3);

-- AuditLog performance indexes (additive)
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

-- RefreshToken
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"         TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "tokenHash"  TEXT         NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "revokedAt"  TIMESTAMP(3),
    "deviceInfo" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX        IF NOT EXISTS "RefreshToken_userId_idx"    ON "RefreshToken"("userId");
CREATE INDEX        IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
ALTER TABLE "RefreshToken"
    ADD CONSTRAINT"RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VerificationToken
CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key"   ON "VerificationToken"("token");
CREATE INDEX        IF NOT EXISTS "VerificationToken_userId_idx"  ON "VerificationToken"("userId");
ALTER TABLE "VerificationToken"
    ADD CONSTRAINT"VerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PasswordResetToken
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX        IF NOT EXISTS "PasswordResetToken_userId_idx"    ON "PasswordResetToken"("userId");
ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT"PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
