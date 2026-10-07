/**
 * Generic, domain-neutral idempotency primitives (HRIS-0.5 extraction).
 *
 * Moved verbatim from src/lib/ats/idempotency.ts so ERP and other write paths
 * share one implementation. The ATS module re-exports these names; its
 * behaviour and tests are unchanged. Nothing here knows about recruitment.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * B1.1 truth correction: a length floor CANNOT prove client entropy — a
 * 22-character constant passes any length check. The contract is therefore a
 * validated FORMAT, documented as exactly that:
 *
 *   - base64url alphabet only ([A-Za-z0-9_-])
 *   - at least 22 characters (what 128 random bits WOULD occupy in base64url)
 *   - at most 128 bytes
 *
 * The randomness itself remains the client's obligation and is deliberately
 * not claimed as guaranteed anywhere in this module or its evidence.
 */
export const IDEMPOTENCY_KEY_MIN_CHARS = 22;
export const IDEMPOTENCY_KEY_MAX_BYTES = 128;
export const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9_-]+$/;
export const IDEMPOTENCY_RETENTION_HOURS = 24;
export const IDEMPOTENCY_HEADER = "idempotency-key";

/**
 * The canonical form of a raw Idempotency-Key: surrounding whitespace removed,
 * or null when nothing remains. It is applied ONCE, at the request boundary, and
 * the result is the only value used for validation, hashing, lookup and storage.
 * Trimming again deeper in the stack would let two spellings of one key diverge.
 */
export function canonicalIdempotencyKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export type KeyValidation =
  | { ok: true }
  | { ok: false; reason: "MISSING" | "TOO_LONG" | "TOO_SHORT" | "BAD_FORMAT" };

export function validateIdempotencyKey(key: string | null | undefined): KeyValidation {
  if (typeof key !== "string" || key.trim().length === 0) return { ok: false, reason: "MISSING" };
  if (Buffer.byteLength(key, "utf8") > IDEMPOTENCY_KEY_MAX_BYTES) return { ok: false, reason: "TOO_LONG" };
  const k = key.trim();
  if (k.length < IDEMPOTENCY_KEY_MIN_CHARS) return { ok: false, reason: "TOO_SHORT" };
  if (!IDEMPOTENCY_KEY_FORMAT.test(k)) return { ok: false, reason: "BAD_FORMAT" };
  return { ok: true };
}

/** Deterministic canonical JSON: object keys sorted recursively. */
export function canonicalizePayload(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function fingerprintPayload(canonicalPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(canonicalPayload, "utf8").digest("hex");
}
