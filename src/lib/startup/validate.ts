/**
 * Production startup validation (Phase 45).
 *
 * FATAL checks abort the process when NODE_ENV=production.
 * WARNING checks log and continue in all environments.
 *
 * Secret values are NEVER logged — only presence and format are checked.
 */

import { jwtSecret } from "@/lib/auth/config";
import { logger } from "@/lib/logger";

const INSECURE_JWT_DEFAULT = "hermes-dev-jwt-insecure-not-for-production";

export interface CheckResult {
  id:      string;
  level:   "FATAL" | "WARNING" | "OK";
  message: string;
}

function runChecks(): CheckResult[] {
  const isProd = process.env.NODE_ENV === "production";
  const results: CheckResult[] = [];

  // F1 / F2 — JWT secret
  const secret = jwtSecret();
  if (isProd && secret === INSECURE_JWT_DEFAULT) {
    results.push({
      id:      "F1_JWT_INSECURE_DEFAULT",
      level:   "FATAL",
      message: "JWT secret is the hardcoded dev default. Set JWT_SECRET (min 64 hex chars: openssl rand -hex 64).",
    });
    logger.fatal("[startup] FATAL F1_JWT_INSECURE_DEFAULT: JWT secret is the insecure default.");
  } else if (isProd && secret.length < 32) {
    results.push({
      id:      "F2_JWT_TOO_SHORT",
      level:   "FATAL",
      message: `JWT secret is ${secret.length} chars; minimum 32 required. Regenerate with: openssl rand -hex 64`,
    });
    logger.fatal(`[startup] FATAL F2_JWT_TOO_SHORT: JWT secret length=${secret.length}`);
  } else {
    results.push({ id: "F1_F2_JWT_SECRET", level: "OK", message: "JWT secret present and sufficient length." });
  }

  // F3 — DATABASE_URL absent in production (unless session mode explicitly set)
  if (isProd && !process.env.DATABASE_URL && process.env.HERMES_STORAGE_MODE !== "session") {
    results.push({
      id:      "F3_DATABASE_URL_MISSING",
      level:   "FATAL",
      message:
        "DATABASE_URL is not set in production. All data will be lost on restart. " +
        "Set DATABASE_URL or set HERMES_STORAGE_MODE=session to acknowledge intentional session mode.",
    });
    logger.fatal("[startup] FATAL F3_DATABASE_URL_MISSING: DATABASE_URL absent without session mode override.");
  } else {
    results.push({ id: "F3_DATABASE_URL", level: "OK", message: "Database configuration OK." });
  }

  // W1 — Redis URL absent (auth rate-limiter falls back to in-process)
  if (!process.env.REDIS_URL) {
    results.push({
      id:      "W1_REDIS_URL_MISSING",
      level:   "WARNING",
      message: "REDIS_URL not set. Auth and API rate-limiters will use in-process fallback (not multi-instance safe).",
    });
    logger.warn("[startup] WARNING W1_REDIS_URL_MISSING: REDIS_URL absent — in-process rate-limiter active.");
  } else {
    results.push({ id: "W1_REDIS_URL", level: "OK", message: "REDIS_URL present." });
  }

  // W2 — Email provider is console in production
  if (isProd && (!process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === "console")) {
    results.push({
      id:      "W2_EMAIL_CONSOLE",
      level:   "WARNING",
      message: "EMAIL_PROVIDER=console in production. Transactional emails will be printed to stdout, not delivered.",
    });
    logger.warn("[startup] WARNING W2_EMAIL_CONSOLE: email delivery is disabled (console mode).");
  } else {
    results.push({ id: "W2_EMAIL_PROVIDER", level: "OK", message: "Email provider configured." });
  }

  // W2B — Resend API key absent when provider=resend
  if (process.env.EMAIL_PROVIDER === "resend" && !process.env.RESEND_API_KEY) {
    const level = isProd ? "FATAL" : "WARNING" as const;
    results.push({
      id:      "W2B_RESEND_API_KEY_MISSING",
      level,
      message: "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set. Email delivery will fail silently.",
    });
    if (isProd) {
      logger.fatal("[startup] FATAL W2B_RESEND_API_KEY_MISSING: RESEND_API_KEY required when EMAIL_PROVIDER=resend.");
    } else {
      logger.warn("[startup] WARNING W2B_RESEND_API_KEY_MISSING: RESEND_API_KEY not set — Resend will fall back to console.");
    }
  } else if (process.env.EMAIL_PROVIDER === "resend") {
    results.push({ id: "W2B_RESEND_API_KEY", level: "OK", message: "RESEND_API_KEY present." });
  }

  // W3 — APP_URL is localhost in production
  if (isProd && (process.env.APP_URL ?? "").includes("localhost")) {
    results.push({
      id:      "W3_APP_URL_LOCALHOST",
      level:   "WARNING",
      message: "APP_URL contains localhost. Email links and CORS origin checks will be incorrect in production.",
    });
    logger.warn("[startup] WARNING W3_APP_URL_LOCALHOST: APP_URL=" + process.env.APP_URL);
  } else {
    results.push({ id: "W3_APP_URL", level: "OK", message: "APP_URL OK." });
  }

  // W4 — Admin seed email absent
  if (!process.env.ADMIN_EMAIL) {
    results.push({
      id:      "W4_ADMIN_EMAIL_MISSING",
      level:   "WARNING",
      message: "ADMIN_EMAIL not set. No seed administrator account will be created on first boot.",
    });
    logger.warn("[startup] WARNING W4_ADMIN_EMAIL_MISSING: seed admin not configured.");
  } else {
    results.push({ id: "W4_ADMIN_EMAIL", level: "OK", message: "ADMIN_EMAIL present." });
  }

  // W5 — Known weak credential values (only when JWT default is not the issue)
  if (
    secret !== INSECURE_JWT_DEFAULT && (
      process.env.AUTH_SECRET    === "hermes-dev-insecure-secret-not-for-production" ||
      process.env.NEXTAUTH_SECRET === "HermesOS2026SuperSecretKey"
    )
  ) {
    results.push({
      id:      "W5_KNOWN_WEAK_CREDENTIAL",
      level:   "WARNING",
      message: "AUTH_SECRET or NEXTAUTH_SECRET is a known example value. Rotate before accepting real users.",
    });
    logger.warn("[startup] WARNING W5_KNOWN_WEAK_CREDENTIAL: known example credential in use.");
  } else {
    results.push({ id: "W5_CREDENTIALS", level: "OK", message: "No known weak credentials detected." });
  }

  // W6 — Default database / Redis passwords
  if (
    process.env.POSTGRES_PASSWORD === "changeme" ||
    process.env.REDIS_PASSWORD    === "changeme"
  ) {
    results.push({
      id:      "W6_DEFAULT_PASSWORDS",
      level:   "WARNING",
      message: 'POSTGRES_PASSWORD or REDIS_PASSWORD is "changeme". Rotate credentials before production use.',
    });
    logger.warn("[startup] WARNING W6_DEFAULT_PASSWORDS: default infrastructure passwords in use.");
  } else {
    results.push({ id: "W6_PASSWORDS", level: "OK", message: "Infrastructure passwords OK." });
  }

  // W7 — Intentional session mode in production
  if (isProd && process.env.HERMES_STORAGE_MODE === "session") {
    results.push({
      id:      "W7_SESSION_MODE_IN_PRODUCTION",
      level:   "WARNING",
      message: "HERMES_STORAGE_MODE=session in production. All data will be lost on process restart.",
    });
    logger.warn("[startup] WARNING W7_SESSION_MODE_IN_PRODUCTION: volatile storage in production.");
  } else {
    results.push({ id: "W7_STORAGE_MODE", level: "OK", message: "Storage mode OK." });
  }

  return results;
}

// Module-level startup state read by /api/admin/system
const _state = {
  results:    [] as CheckResult[],
  fatalCount: 0,
  ran:        false,
};

export function getStartupResults(): {
  results: CheckResult[];
  fatalCount: number;
  ran: boolean;
} {
  return { ..._state };
}

/** Run all startup checks. Aborts via process.exit(1) on FATAL in production. */
export function executeAndMaybeAbort(): void {
  const results    = runChecks();
  const fatalCount = results.filter((r) => r.level === "FATAL").length;

  _state.results    = results;
  _state.fatalCount = fatalCount;
  _state.ran        = true;

  if (fatalCount > 0 && process.env.NODE_ENV === "production") {
    logger.fatal(
      "[startup] ABORTING: one or more FATAL startup checks failed. Resolve and restart.",
      { fatalCount },
    );
    process.exit(1);
  }

  logger.info("[startup] Startup validation complete.", {
    total:    results.length,
    fatal:    fatalCount,
    warnings: results.filter((r) => r.level === "WARNING").length,
    ok:       results.filter((r) => r.level === "OK").length,
  });
}
