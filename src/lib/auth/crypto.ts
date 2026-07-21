import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

/**
 * Auth crypto (Phase 12A) — Node built-ins only, no external dependencies, so
 * the app builds with nothing extra installed.
 *
 * Passwords: scrypt with a per-hash random salt, stored as "salt:hash".
 * Sessions: a compact signed token "payloadB64.sigB64" (HMAC-SHA256). The
 * signing secret comes from AUTH_SECRET; when absent we fall back to a
 * non-persistent dev secret (sessions simply don't survive restart, which is
 * fine for the setup-required dev state).
 */

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(password, salt, KEYLEN);
  const orig = Buffer.from(hash, "hex");
  if (calc.length !== orig.length) return false;
  return timingSafeEqual(calc, orig);
}

function secret(): string {
  return process.env.AUTH_SECRET || "hermes-dev-insecure-secret-not-for-production";
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
  iat: number;
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * PHASE 90 — absolute server-side lifetime for the legacy HMAC session cookie.
 *
 * The cookie carries a browser-side `maxAge` (8h, or 30d with remember-me), but
 * that only makes the BROWSER forget it. Before this phase `verifySession`
 * never looked at `iat`, so a token string captured from a log, a backup, a
 * shared machine or an XSS exfiltration stayed valid forever. This ceiling is
 * the longest lifetime the login route ever issues (remember-me = 30 days), so
 * no legitimate session is cut short, while a replayed ancient token now fails
 * closed.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    // Signature proved integrity; now enforce freshness. A malformed, missing
    // or future-dated `iat` is treated as untrustworthy rather than eternal.
    const iat = Number(payload?.iat);
    if (!Number.isFinite(iat) || iat <= 0) return null;
    const ageSeconds = (Date.now() - iat) / 1000;
    if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}
