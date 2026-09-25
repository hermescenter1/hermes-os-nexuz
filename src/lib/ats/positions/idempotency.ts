/**
 * ATS-M1 — idempotency for management mutations.
 *
 * Every mutating request of the position and settings surface carries an
 * `Idempotency-Key` header (required — a request without one is refused, not
 * guessed). The claim is written FIRST inside the same transaction as the
 * mutation it guards:
 *
 *   * first request   → claim inserted, work done, stored result updated, commit;
 *   * later duplicate → the committed claim is found before any work and its
 *                       stored result is REPLAYED — no second row, no second
 *                       audit entry;
 *   * concurrent twin → its claim INSERT waits on the unique index, fails once
 *                       the first commits, and the caller replays the result;
 *   * same key, different payload → refused (IDEMPOTENCY_KEY_REUSED), never
 *                       silently applied to the other request's result.
 *
 * Never the raw key: the table holds SHA-256(key). The payload fingerprint is
 * SHA-256 over a canonical (key-sorted) JSON of the operation, its target and
 * the VALIDATED body — management payloads carry no candidate data, so an
 * unkeyed digest is enough here (the public intake uses an HMAC for PII).
 */

import { createHash } from "node:crypto";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

export function readIdempotencyKey(req: { headers: { get(name: string): string | null } }): string | null {
  const raw = req.headers.get(IDEMPOTENCY_HEADER);
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return KEY_PATTERN.test(key) ? key : null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function payloadFingerprint(operation: string, target: string | null, body: unknown): string {
  return sha256(JSON.stringify(canonical({ operation, target, body })));
}

export interface IdempotencyClaim {
  organizationId: string;
  operation: string;
  key: string;
  payloadHash: string;
}

export interface ClaimRow {
  payloadHash: string;
  resultJson: unknown;
  expiresAt: Date;
}

export interface IdempotencyTx {
  atsManagementIdempotencyKey: {
    findUnique: (a: unknown) => Promise<ClaimRow | null>;
    deleteMany: (a: unknown) => Promise<unknown>;
    create: (a: unknown) => Promise<unknown>;
    updateMany: (a: unknown) => Promise<{ count: number }>;
  };
}

export interface IdempotencyReader {
  atsManagementIdempotencyKey: {
    findUnique: (a: unknown) => Promise<ClaimRow | null>;
  };
}

/** The marker a claim carries until its transaction stores the real result. */
const IN_FLIGHT = { pending: true } as const;

function uniqueWhere(c: IdempotencyClaim) {
  return {
    organizationId_operation_keyHash: {
      organizationId: c.organizationId,
      operation: c.operation,
      keyHash: sha256(c.key),
    },
  };
}

export type ReplayVerdict =
  | { kind: "NONE" }
  | { kind: "REPLAY"; result: unknown }
  | { kind: "CONFLICT" }
  | { kind: "IN_PROGRESS" };

/** Look for a committed, unexpired claim for this key. */
export async function findReplay(db: IdempotencyReader, c: IdempotencyClaim, now: Date): Promise<ReplayVerdict> {
  const row = await db.atsManagementIdempotencyKey.findUnique({ where: uniqueWhere(c) });
  if (!row || row.expiresAt.getTime() <= now.getTime()) return { kind: "NONE" };
  if (row.payloadHash !== c.payloadHash) return { kind: "CONFLICT" };
  const result = row.resultJson as Record<string, unknown> | null;
  if (!result || (result as { pending?: unknown }).pending === true) return { kind: "IN_PROGRESS" };
  return { kind: "REPLAY", result };
}

/**
 * Insert the claim as the FIRST write of the caller's transaction. An expired
 * claim for the same key is removed first (it is not an audit record — it is
 * a 24-hour dedupe marker), so a key may be reused after its window.
 */
export async function insertClaim(tx: IdempotencyTx, c: IdempotencyClaim, now: Date): Promise<void> {
  const keyHash = sha256(c.key);
  await tx.atsManagementIdempotencyKey.deleteMany({
    where: { organizationId: c.organizationId, operation: c.operation, keyHash, expiresAt: { lte: now } },
  });
  await tx.atsManagementIdempotencyKey.create({
    data: {
      organizationId: c.organizationId,
      operation: c.operation,
      keyHash,
      payloadHash: c.payloadHash,
      resultJson: IN_FLIGHT,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    },
  });
}

/** Store the final result on the claim, inside the same transaction. */
export async function completeClaim(tx: IdempotencyTx, c: IdempotencyClaim, result: unknown): Promise<void> {
  await tx.atsManagementIdempotencyKey.updateMany({
    where: { organizationId: c.organizationId, operation: c.operation, keyHash: sha256(c.key) },
    data: { resultJson: result },
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
