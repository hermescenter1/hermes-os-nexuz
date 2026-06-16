/**
 * Auth configuration detection (Phase 12A).
 *
 * Auth is "configured" when a seed admin is provided via env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD (ADMIN_NAME optional).
 *
 * When auth is NOT configured the app still builds and runs; protected routes
 * render a setup-required message instead of crashing, and public pages are
 * entirely unaffected. Secrets are never hardcoded.
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

export const SESSION_COOKIE = "hermes_session";
