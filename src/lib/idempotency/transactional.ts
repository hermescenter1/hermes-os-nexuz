/**
 * Transactional idempotent writes (HRIS-0.5).
 *
 * The idempotency row, the mutation and its audit event are written in ONE
 * database transaction. A committed result therefore always has its key row,
 * and a rolled-back write never leaves a key behind.
 *
 * Contract:
 *   * scope = (organizationId, operation, keyHash): the same raw key in another
 *     tenant, or for another operation, is a different row;
 *   * same key + same canonical payload  -> the stored result is replayed and
 *     `write` is NOT called again;
 *   * same key + different payload       -> refused (`KEY_REUSED`), no write;
 *   * a concurrent duplicate loses on the unique constraint, the transaction
 *     rolls back, and the loser is re-resolved as replay or refusal;
 *   * expired rows (retention window) are treated as unseen.
 *
 * The raw key is never stored or logged; only its SHA-256 is persisted.
 */

import { createHash } from "node:crypto";
import {
  IDEMPOTENCY_RETENTION_HOURS,
  canonicalizePayload,
  hashKey,
  validateIdempotencyKey,
} from "./keys";

export type IdempotencyKeyFailure = "KEY_INVALID" | "KEY_REUSED";

export type IdempotentSuccess<T> = { kind: "created"; value: T } | { kind: "replayed"; value: T | null };

export type IdempotentWriteOutcome<T> = IdempotentSuccess<T> | { kind: "refused"; reason: IdempotencyKeyFailure };

export interface IdempotencyKeyRow {
  payloadHash: string;
  resultType: string;
  resultId: string;
  expiresAt: Date;
}

/** The subset of a Prisma transaction client this helper uses. */
export interface IdempotencyDelegate {
  findUnique(args: unknown): Promise<IdempotencyKeyRow | null>;
  deleteMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
}

export interface IdempotencyStore {
  $transaction<R>(fn: (tx: { idempotencyKey: IdempotencyDelegate }) => Promise<R>): Promise<R>;
  idempotencyKey: IdempotencyDelegate;
}

export interface IdempotentWriteInput<T, Tx> {
  store: IdempotencyStore;
  organizationId: string;
  actorUserId: string;
  operation: string;
  rawKey: string | null | undefined;
  payload: unknown;
  /** Runs inside the transaction: mutation + audit. Returns the durable result id. */
  write: (tx: Tx & { idempotencyKey: IdempotencyDelegate }) => Promise<{ resultType: string; resultId: string; value: T }>;
  /** Loads a previously stored result for replay. Must be org-scoped. */
  replay: (resultType: string, resultId: string) => Promise<T | null>;
  now?: Date;
}

/** SHA-256 of the canonical payload. Scope (org + operation) is in the key row, not the digest. */
export function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalizePayload(payload), "utf8").digest("hex");
}

/** Resolves a Prisma unique-violation on the idempotency key (and only that). */
function isKeyConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: { target?: unknown; modelName?: unknown } };
  if (e.code !== "P2002") return false;
  // A driver adapter (@prisma/adapter-pg) reports the model, not `target`.
  // Verified on PostgreSQL 16: meta = { modelName: "IdempotencyKey", driverAdapterError: ... }.
  if (e.meta?.modelName === "IdempotencyKey") return true;
  const target = JSON.stringify(e.meta?.target ?? "");
  return target.includes("keyHash") || target.includes("IdempotencyKey");
}

export async function runIdempotentWrite<T, Tx>(input: IdempotentWriteInput<T, Tx>): Promise<IdempotentWriteOutcome<T>> {
  // `rawKey` is already canonical (see canonicalIdempotencyKey): no trimming here.
  // A key with surrounding whitespace is therefore refused, never silently hashed differently.
  const rawKey = input.rawKey;
  if (typeof rawKey !== "string" || rawKey !== rawKey.trim() || !validateIdempotencyKey(rawKey).ok) {
    return { kind: "refused", reason: "KEY_INVALID" };
  }

  const now = input.now ?? new Date();
  const keyHash = hashKey(rawKey);
  const digest = payloadDigest(input.payload);
  const where = {
    where: {
      organizationId_operation_keyHash: {
        organizationId: input.organizationId,
        operation: input.operation,
        keyHash,
      },
    },
  };

  const existing = await input.store.idempotencyKey.findUnique(where);
  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    if (existing.payloadHash !== digest) return { kind: "refused", reason: "KEY_REUSED" };
    return { kind: "replayed", value: await input.replay(existing.resultType, existing.resultId) };
  }
  if (existing) {
    // Expired: treat as unseen.
    await input.store.idempotencyKey.deleteMany({
      where: { organizationId: input.organizationId, operation: input.operation, keyHash },
    });
  }

  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 3600_000);
  try {
    const result = await input.store.$transaction(async (tx) => {
      const written = await input.write(tx as unknown as Tx & { idempotencyKey: IdempotencyDelegate });
      await tx.idempotencyKey.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          operation: input.operation,
          keyHash,
          payloadHash: digest,
          resultType: written.resultType,
          resultId: written.resultId,
          expiresAt,
        },
      });
      return written;
    });
    return { kind: "created", value: result.value };
  } catch (err) {
    if (!isKeyConflict(err)) throw err;
    // A concurrent request claimed the key first; our transaction rolled back.
    const winner = await input.store.idempotencyKey.findUnique(where);
    if (!winner) return { kind: "refused", reason: "KEY_REUSED" };
    if (winner.payloadHash !== digest) return { kind: "refused", reason: "KEY_REUSED" };
    return { kind: "replayed", value: await input.replay(winner.resultType, winner.resultId) };
  }
}
