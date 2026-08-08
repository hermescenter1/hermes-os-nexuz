/**
 * Phase 97 Part G — export download-capability token.
 *
 * The plaintext token is cryptographically random and returned to the caller
 * exactly once at issuance. Only its SHA-256 hash is ever persisted (never the
 * plaintext, never a raw database id), so a database or log leak cannot yield a
 * usable capability. Redemption hashes the presented token and matches the hash.
 */
import { randomBytes, createHash } from "node:crypto";

export function hashExportToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function generateExportToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("base64url"); // 256 bits of entropy
  return { plaintext, hash: hashExportToken(plaintext) };
}

/** Structural check before hashing a presented token — never reveals validity. */
export function looksLikeExportToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(token);
}
