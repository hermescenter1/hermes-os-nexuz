// PHASE 94B — durable replay and idempotency reservation.
//
// WHY NOT AN IN-MEMORY SET
// A Map or Set survives neither a restart nor a second replica, so a replayed
// envelope would be accepted by any process that had not seen the nonce. The
// authority here is the DATABASE UNIQUE CONSTRAINT — `@@unique([gatewayId,
// nonce])` and `@@unique([organizationId, idempotencyKey])`. We do not "check
// then insert" (which races), we INSERT and let the constraint arbitrate: under
// concurrency exactly one writer wins and every other gets a unique violation.
//
// This module is deliberately storage-shaped rather than Prisma-typed so it can
// be unit-tested against a fake that reproduces the constraint semantics; the
// route supplies the real Prisma delegate inside a transaction.

/** Postgres unique-violation code, surfaced by Prisma as `code`. */
export const UNIQUE_VIOLATION = "P2002";

export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === UNIQUE_VIOLATION || code === "23505";
}

/** The minimal create surface a reservation needs. */
export interface CreateOnly<T> {
  create(args: { data: T }): Promise<unknown>;
}

export type ReserveOutcome = "RESERVED" | "DUPLICATE";

/**
 * Atomically claim a gateway nonce.
 *
 * Returns DUPLICATE when the (gatewayId, nonce) pair already exists — which is
 * exactly a replay. Because the decision is the INSERT itself, two concurrent
 * requests carrying the same nonce cannot both be told "RESERVED".
 */
export async function reserveNonce(
  model: CreateOnly<{
    organizationId: string;
    gatewayId: string;
    nonce: string;
    expiresAt: Date;
  }>,
  input: { organizationId: string; gatewayId: string; nonce: string; expiresAt: Date },
): Promise<ReserveOutcome> {
  try {
    await model.create({ data: input });
    return "RESERVED";
  } catch (err) {
    if (isUniqueViolation(err)) return "DUPLICATE";
    throw err;
  }
}

/**
 * Atomically claim an import idempotency key by creating the import row in a
 * non-terminal state.
 *
 * The row IS the reservation: a duplicate key cannot create a second import, so
 * a retried submission can never execute the import twice. The caller then
 * transitions the same row to APPLIED or FAILED — a failure therefore leaves a
 * row marked FAILED, never a phantom "completed" import.
 */
export async function reserveImport<TRow>(
  model: CreateOnly<Record<string, unknown>> & {
    findFirst(args: { where: Record<string, unknown> }): Promise<TRow | null>;
  },
  input: {
    organizationId: string;
    idempotencyKey: string;
    checksum: string;
    data: Record<string, unknown>;
  },
): Promise<
  | { outcome: "RESERVED" }
  | { outcome: "DUPLICATE_KEY"; existing: TRow | null }
  | { outcome: "DUPLICATE_CONTENT"; existing: TRow | null }
> {
  try {
    await model.create({ data: input.data });
    return { outcome: "RESERVED" };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Two distinct uniqueness rules can fire here and they mean different
    // things to the caller: the same KEY is a retry of one submission, while
    // the same CHECKSUM under a different key is the same content submitted
    // afresh. Both are safe to treat as "already imported", but the caller
    // reports them differently, so resolve which one it was.
    const byKey = await model.findFirst({
      where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
    });
    if (byKey) return { outcome: "DUPLICATE_KEY", existing: byKey };

    const byChecksum = await model.findFirst({
      where: { organizationId: input.organizationId, checksum: input.checksum },
    });
    return { outcome: "DUPLICATE_CONTENT", existing: byChecksum };
  }
}

/**
 * Nonces older than this may be pruned.
 *
 * Retention only bounds TABLE GROWTH — never correctness. A nonce is safe to
 * forget once it can no longer appear in a fresh envelope, because the
 * timestamp-skew gate rejects anything that old before replay is even
 * consulted. Cleanup failing therefore cannot admit a replay; it can only
 * leave rows behind.
 */
export function prunableBefore(now: Date, retentionMs: number): Date {
  return new Date(now.getTime() - retentionMs);
}
