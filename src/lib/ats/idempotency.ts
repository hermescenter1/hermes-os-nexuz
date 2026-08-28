/**
 * PHASE 104-B1 — payload-bound idempotency for public recruitment writes.
 *
 * Contract (45-recruitment-privacy-contract.md §13):
 *
 *   * the raw key is NEVER stored or logged — only its SHA-256;
 *   * the record binds the key hash to an HMAC-SHA-256 fingerprint of the
 *     CANONICAL validated payload — never the raw JSON text;
 *   * canonicalization sorts object keys recursively (deterministic field
 *     order) and the caller passes only durable fields (volatile ones —
 *     timestamps, IPs, correlation ids — must not reach the fingerprint);
 *   * same key + same fingerprint  → the SAME stored result, WRITE_COUNT=0;
 *   * same key + different payload → generic refusal, WRITE_COUNT=0, no
 *     disclosure that the key was ever seen;
 *   * the claim is ATOMIC: an INSERT under the unique constraint
 *     (organizationId, jobId, keyHash) — never check-then-insert;
 *   * key FORMAT is validated (base64url alphabet, 22..128 chars); the
 *     length floor is what 128 random bits would occupy in base64url, and is
 *     documented as a format minimum — never as an entropy guarantee;
 *   * expired claims (24 h) are treated as unseen.
 */

import { createHash, createHmac } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";

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

export type ClaimOutcome =
  | { outcome: "CLAIMED"; claimId: string }
  | { outcome: "REPLAY"; resultId: string | null }
  | { outcome: "PAYLOAD_MISMATCH" }
  | { outcome: "PENDING" }
  | { outcome: "STORE_UNAVAILABLE" };

type IdemModel = {
  create: (a: unknown) => Promise<{ id: string }>;
  findUnique: (a: unknown) => Promise<{ id: string; payloadHash: string; status: string; resultId: string | null; expiresAt: Date } | null>;
  update: (a: unknown) => Promise<unknown>;
  delete: (a: unknown) => Promise<unknown>;
};

async function model(): Promise<IdemModel | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const m = (prisma as unknown as { recruitmentIdempotencyKey?: IdemModel }).recruitmentIdempotencyKey;
  return m && typeof m.create === "function" ? m : null;
}

/**
 * Atomically claim the key for this (organization, job, payload). The INSERT
 * itself is the lock: a concurrent duplicate loses on the unique constraint
 * and is routed through the replay/mismatch branches.
 */
export async function claimIdempotencyKey(args: {
  organizationId: string;
  jobId: string;
  rawKey: string;
  payloadHash: string;
  now?: Date;
}): Promise<ClaimOutcome> {
  const m = await model();
  if (!m) return { outcome: "STORE_UNAVAILABLE" };
  const now = args.now ?? new Date();
  const keyHash = hashKey(args.rawKey);
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 3600_000);

  try {
    const row = await m.create({
      data: {
        organizationId: args.organizationId,
        jobId: args.jobId,
        keyHash,
        payloadHash: args.payloadHash,
        status: "CLAIMED",
        expiresAt,
      },
      select: { id: true },
    });
    return { outcome: "CLAIMED", claimId: row.id };
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") return { outcome: "STORE_UNAVAILABLE" };
  }

  const existing = await m.findUnique({
    where: {
      organizationId_jobId_keyHash: {
        organizationId: args.organizationId,
        jobId: args.jobId,
        keyHash,
      },
    },
    select: { id: true, payloadHash: true, status: true, resultId: true, expiresAt: true },
  });
  if (!existing) return { outcome: "STORE_UNAVAILABLE" };

  // An expired claim is treated as unseen: delete and re-claim once.
  if (existing.expiresAt.getTime() <= now.getTime()) {
    try {
      await m.delete({ where: { id: existing.id } });
    } catch {
      /* concurrent cleanup is fine */
    }
    try {
      const row = await m.create({
        data: {
          organizationId: args.organizationId,
          jobId: args.jobId,
          keyHash,
          payloadHash: args.payloadHash,
          status: "CLAIMED",
          expiresAt,
        },
        select: { id: true },
      });
      return { outcome: "CLAIMED", claimId: row.id };
    } catch {
      return { outcome: "PENDING" };
    }
  }

  if (existing.payloadHash !== args.payloadHash) return { outcome: "PAYLOAD_MISMATCH" };
  if (existing.status === "COMPLETED") return { outcome: "REPLAY", resultId: existing.resultId };
  return { outcome: "PENDING" };
}

/** Mark a claim completed with the durable result id. */
export async function completeIdempotencyClaim(claimId: string, resultId: string): Promise<void> {
  const m = await model();
  if (!m) return;
  try {
    await m.update({ where: { id: claimId }, data: { status: "COMPLETED", resultId } });
  } catch {
    /* the applier's transaction already committed; completion is best-effort */
  }
}

/** Release a claim whose write failed, so a retry can try again. */
export async function releaseIdempotencyClaim(claimId: string): Promise<void> {
  const m = await model();
  if (!m) return;
  try {
    await m.delete({ where: { id: claimId } });
  } catch {
    /* already gone */
  }
}
