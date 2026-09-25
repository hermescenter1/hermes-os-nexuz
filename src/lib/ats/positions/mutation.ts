/**
 * ATS-M1 — the one transaction runner every management mutation goes through
 * (positions and organization settings alike).
 *
 * Order inside the single transaction:
 *   1. the idempotency claim is inserted (serialises concurrent duplicates);
 *   2. the actor's ACTIVE membership of the organization is re-proven;
 *   3. the caller's work runs — every predicate carries the organization;
 *   4. the stored result is written onto the claim.
 * Any refusal thrown by the work rolls ALL of it back, claim included, so a
 * corrected retry is never blocked by a dead claim.
 */

import type { PositionErrorCode, ReadinessCode } from "./contract";
import {
  completeClaim,
  findReplay,
  insertClaim,
  isUniqueViolation,
  payloadFingerprint,
  type IdempotencyClaim,
  type IdempotencyReader,
  type IdempotencyTx,
} from "./idempotency";

export interface RefusalDetail {
  missing?: ReadinessCode[];
  protectedTerms?: string[];
  issues?: { path: string; message: string }[];
  linkedApplications?: number;
}

export type MutationResult<T> =
  | { ok: true; replayed: boolean; result: T }
  | { ok: false; code: PositionErrorCode; detail?: RefusalDetail };

export interface MutationContext {
  organizationId: string;
  actor: { userId: string; role: string };
  correlationId: string;
  idempotencyKey: string;
  now?: Date;
}

export class ManagementRefusal extends Error {
  constructor(
    public readonly code: PositionErrorCode,
    public readonly detail?: RefusalDetail,
  ) {
    super(code);
  }
}

export function zodIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  return error.issues.slice(0, 20).map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

export interface MutationTxBase extends IdempotencyTx {
  organizationMember: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
}

export interface MutationClient<TX> extends IdempotencyReader {
  $transaction: <R>(fn: (tx: TX) => Promise<R>) => Promise<R>;
}

export async function runMutation<T, TX extends MutationTxBase>(
  prisma: MutationClient<TX> | null,
  ctx: MutationContext,
  operation: string,
  target: string | null,
  body: unknown,
  work: (tx: TX, now: Date) => Promise<T>,
): Promise<MutationResult<T>> {
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };
  const now = ctx.now ?? new Date();
  const claim: IdempotencyClaim = {
    organizationId: ctx.organizationId,
    operation,
    key: ctx.idempotencyKey,
    // The acting USER is part of the fingerprint: a colleague who happens to
    // send the same key and body is a conflict, never a replay of someone
    // else's stored result.
    payloadHash: payloadFingerprint(operation, target, { actor: ctx.actor.userId, body }),
  };

  const replay = async (): Promise<MutationResult<T> | null> => {
    const v = await findReplay(prisma, claim, now);
    if (v.kind === "REPLAY") return { ok: true, replayed: true, result: v.result as T };
    if (v.kind === "CONFLICT") return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
    if (v.kind === "IN_PROGRESS") return { ok: false, code: "IDEMPOTENCY_IN_PROGRESS" };
    return null;
  };

  try {
    const early = await replay();
    if (early) return early;
  } catch {
    return { ok: false, code: "STORE_UNAVAILABLE" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await insertClaim(tx, claim, now);
      const membership = await tx.organizationMember.findFirst({
        where: { organizationId: ctx.organizationId, userId: ctx.actor.userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!membership) throw new ManagementRefusal("FORBIDDEN");
      const out = await work(tx, now);
      await completeClaim(tx, claim, out);
      return out;
    });
    return { ok: true, replayed: false, result };
  } catch (err) {
    if (err instanceof ManagementRefusal) return { ok: false, code: err.code, detail: err.detail };
    if (isUniqueViolation(err)) {
      // Either a concurrent twin committed first (replay it) or another unique
      // constraint — e.g. the requisition key — was hit (a genuine conflict).
      try {
        const late = await replay();
        if (late) return late;
      } catch {
        /* fall through */
      }
      return { ok: false, code: "CONFLICT" };
    }
    return { ok: false, code: "WRITE_FAILED" };
  }
}
