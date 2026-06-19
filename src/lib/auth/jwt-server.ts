/**
 * Server-only JWT token generation utilities (Phase 28).
 * Node.js only — never import from middleware or Edge Runtime code.
 */

import { randomBytes, createHash } from "node:crypto";

/** Generate a cryptographically random 48-byte hex refresh token. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

/** Store only the SHA-256 hash of the refresh token in the database. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically random 32-byte hex reset token. */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

/** Store only the SHA-256 hash of the reset token in the database. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically random 24-byte base64url verification token. */
export function generateVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}
