// PHASE 96 runtime — atomic resource reservation.
//
// Prevents read-then-write races on metered limits. The count and the create run
// in ONE Serializable transaction; two simultaneous creates against the same
// ceiling cannot both succeed (one serialization-conflicts and either retries or
// is rejected). Used for seat/site/gateway/asset creation once a numeric limit
// is configured (or supplied by an override).

import type { PrismaClient } from "@prisma/client";

export type ReserveResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "PLAN_LIMIT_REACHED" };

const SERIALIZATION_ERROR_CODES = new Set(["P2034", "40001", "40P01"]);

function isSerializationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code !== undefined && SERIALIZATION_ERROR_CODES.has(code);
}

class LimitReachedError extends Error {
  constructor() {
    super("PLAN_LIMIT_REACHED");
    this.name = "LimitReachedError";
  }
}

/**
 * Atomically reserve one unit of a metered resource and create it. `count`
 * returns the current consumed units WITHIN the transaction; if `count + units`
 * would exceed `limit`, the whole transaction aborts and PLAN_LIMIT_REACHED is
 * returned (no partial write). Serialization conflicts retry up to maxRetries.
 */
export async function reserveAndCreate<T>(params: {
  client: PrismaClient;
  limit: number;
  units?: number;
  count: (tx: PrismaClient) => Promise<number>;
  create: (tx: PrismaClient) => Promise<T>;
  maxRetries?: number;
}): Promise<ReserveResult<T>> {
  const units = params.units ?? 1;
  const maxRetries = params.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await params.client.$transaction(
        async (tx) => {
          const used = await params.count(tx as unknown as PrismaClient);
          if (used + units > params.limit) throw new LimitReachedError();
          return await params.create(tx as unknown as PrismaClient);
        },
        { isolationLevel: "Serializable" },
      );
      return { ok: true, value };
    } catch (err) {
      if (err instanceof LimitReachedError) return { ok: false, reason: "PLAN_LIMIT_REACHED" };
      if (isSerializationError(err) && attempt < maxRetries) continue; // retry
      throw err;
    }
  }
  // Exhausted retries under sustained contention → fail closed as limit-reached.
  return { ok: false, reason: "PLAN_LIMIT_REACHED" };
}
