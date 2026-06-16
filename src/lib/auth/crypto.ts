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

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}
