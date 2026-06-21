/**
 * Auth configuration (Phase 12A / Phase 28).
 *
 * Auth is "configured" when a seed admin is provided via env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD (ADMIN_NAME optional).
 *
 * Phase 28 adds:
 *   JWT_SECRET     — signing secret for access tokens (fallback: AUTH_SECRET)
 *   DATABASE_URL   — when present, full DB auth is enabled
 */

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}

export function adminSeed(): { email: string; password: string; name: string } | null {
  if (!isAuthConfigured()) return null;
  return {
    email: process.env.ADMIN_EMAIL as string,
    password: process.env.ADMIN_PASSWORD as string,
    name: process.env.ADMIN_NAME || "Administrator",
  };
}

/** HMAC session cookie (legacy Phase 12A path). */
export const SESSION_COOKIE = "hermes_session";

/** JWT access token cookie (Phase 28). */
export const ACCESS_TOKEN_COOKIE = "hermes_at";

/** Refresh token cookie (Phase 28). */
export const REFRESH_TOKEN_COOKIE = "hermes_rt";

/** JWT signing secret. Resolution order: JWT_SECRET → JWT_ACCESS_SECRET → AUTH_SECRET → NEXTAUTH_SECRET → insecure default. */
export function jwtSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "hermes-dev-jwt-insecure-not-for-production"
  );
}

/** Access token TTL seconds. */
export const ACCESS_TOKEN_TTL = 60 * 60 * 8; // 8 hours

/** Refresh token TTL seconds (no remember-me). */
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

/** Refresh token TTL seconds (remember-me). */
export const REFRESH_TOKEN_TTL_LONG = 60 * 60 * 24 * 30; // 30 days

/** Verification token TTL seconds. */
export const VERIFICATION_TOKEN_TTL = 60 * 60 * 24; // 24 hours

/** Password reset token TTL seconds. */
export const PASSWORD_RESET_TTL = 60 * 60; // 1 hour

/** Max failed login attempts before account lock. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Account lock duration in seconds. */
export const LOCK_DURATION = 60 * 15; // 15 minutes
