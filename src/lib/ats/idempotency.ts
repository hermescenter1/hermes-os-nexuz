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

import { getPrisma } from "@/lib/db/prisma";

import { IDEMPOTENCY_RETENTION_HOURS, hashKey } from "@/lib/idempotency/keys";

// Pure primitives live in the shared module; re-exported under their original
// names so every existing ATS importer and test keeps its contract.
export {
  IDEMPOTENCY_KEY_MIN_CHARS,
  IDEMPOTENCY_KEY_MAX_BYTES,
  IDEMPOTENCY_KEY_FORMAT,
  IDEMPOTENCY_RETENTION_HOURS,
  IDEMPOTENCY_HEADER,
  validateIdempotencyKey,
  canonicalizePayload,
  hashKey,
  fingerprintPayload,
} from "@/lib/idempotency/keys";
export type { KeyValidation } from "@/lib/idempotency/keys";

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
