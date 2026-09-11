/**
 * PHASE 109-C-UI.2-R7 — durable metering for industrial execution.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN OUTBOX AND NOT A TRANSACTIONAL METER WRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * R6 measured the defect: `meterIndustrialEvent` starts a promise, is never
 * awaited, and swallows every error in `.catch(() => undefined)`. A usage row
 * can vanish with no trace, and the response is sent before anyone could know.
 * The owner ruled that out and offered two replacements.
 *
 * Putting the meter write inside the run's transaction was rejected, for three
 * reasons that are argued in full in the R7 report and summarised here:
 *
 *   1. It inverts the risk. A billing outage would then stop industrial
 *      analysis. The audit row is fail-closed BECAUSE the authorisation of an
 *      organisation-wide run rests on being audited; billing carries no such
 *      property, and an unbilled run is a commercial problem while an unanalysed
 *      plant is an operational one.
 *   2. `meterIndustrialEvent` has ~50 call sites across eight subsystems the
 *      R7 scope lock forbids touching. Making it awaited and transactional
 *      would change behaviour for all of them.
 *   3. `UsageRecord` cannot express exactly-once. It has no unique key and no
 *      columns for scope, site, actor or operation, so a retry cannot recognise
 *      its own earlier write.
 *
 * So the outbox row is written INSIDE the run's transaction. It commits exactly
 * when the run commits and never when the run does not — a crash between the
 * two is not possible, because there is no "between". Delivery to `UsageRecord`
 * is a separate step with bounded retries, backoff and a dead-letter state, and
 * nothing is ever dropped silently.
 *
 * EXACTLY-ONCE, IN TWO PLACES
 *   * At the SOURCE, by `UNIQUE (organizationId, idempotencyKey, metric)`. A
 *     replayed request cannot enqueue a second event, whichever process it
 *     reaches.
 *   * At DELIVERY, by a conditional status transition. Two workers race on
 *     `UPDATE ... WHERE id = ? AND status IN ('PENDING','RETRYING')`; the loser
 *     matches zero rows and skips. The `UsageRecord` insert lives in the same
 *     transaction as that claim, so a crash anywhere in between rolls both back
 *     and the event is retried, never half-delivered.
 */

import { getPrisma } from "@/lib/db/prisma";
import type { ScopeMode } from "./automation-scope";

export const METERING_OPERATION = "industrial.automation.run";
export const METERING_METRIC = "industrial_automation_runs";

/** Bounded: an event that cannot be delivered becomes visible, not immortal. */
export const MAX_DELIVERY_ATTEMPTS = 5;
/** 1s, 4s, 9s, 16s… — quadratic, so a broken downstream is not hammered. */
export const backoffMs = (attempt: number) => attempt * attempt * 1_000;

export type OutboxStatus = "PENDING" | "RETRYING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";

export interface MeteringEventInput {
  organizationId: string;
  siteId: string | null;
  scopeMode: ScopeMode;
  actorId: string | null;
  actorRole: string;
  authMethod: string;
  runId: string;
  requestId: string;
  idempotencyKey: string;
  value?: number;
}

type Model = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
};

const outboxOf = (client: unknown): Model | null =>
  ((client as Record<string, unknown>)?.industrialMeteringOutbox as Model) ?? null;

/** PostgreSQL unique violation. The one error that means "already enqueued". */
const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: unknown })?.code;
  return code === "23505" || code === "P2002";
};

/**
 * Enqueue one metering event. MUST be called with the run's transaction client.
 *
 * Throws only when the outbox is genuinely unusable. That is deliberate: this
 * runs inside the run's transaction, and an outbox that cannot be written is
 * the fire-and-forget failure returning by another door. A DUPLICATE, on the
 * other hand, is success — the unique key did its job and the event is already
 * recorded exactly once.
 */
export async function enqueueMeteringEvent(
  input: MeteringEventInput,
  client: unknown,
): Promise<"ENQUEUED" | "ALREADY_ENQUEUED"> {
  const m = outboxOf(client);
  if (!m) throw new Error("METERING_OUTBOX_UNAVAILABLE");

  try {
    await m.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        scopeMode: input.scopeMode,
        actorId: input.actorId,
        actorRole: input.actorRole,
        authMethod: input.authMethod,
        operation: METERING_OPERATION,
        metric: METERING_METRIC,
        value: input.value ?? 1,
        runId: input.runId,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return "ENQUEUED";
  } catch (e) {
    if (isUniqueViolation(e)) return "ALREADY_ENQUEUED";
    throw e;
  }
}

export interface DeliveryReport {
  claimed: number;
  delivered: number;
  retrying: number;
  deadLettered: number;
  skipped: number;
}

/**
 * Deliver due events to `UsageRecord`.
 *
 * One transaction per event, not one for the batch: a single poisonous row must
 * not roll back the events that succeeded alongside it.
 */
export async function deliverPendingMeteringEvents(opts?: {
  limit?: number;
  client?: unknown;
  nowMs?: number;
}): Promise<DeliveryReport> {
  const limit = opts?.limit ?? 50;
  const now = new Date(opts?.nowMs ?? Date.now());
  const report: DeliveryReport = {
    claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0,
  };

  const root = opts?.client ?? (await getPrisma());
  if (!root) return report;
  const m = outboxOf(root);
  if (!m) return report;

  const due = await m.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const row of due) {
    const id = String(row.id);
    const attempts = Number(row.attempts ?? 0) + 1;

    try {
      const outcome = await (
        root as unknown as {
          $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
        }
      ).$transaction(async (tx) => {
        const tm = outboxOf(tx);
        if (!tm) throw new Error("METERING_OUTBOX_UNAVAILABLE");

        /*
          THE CLAIM. This is the whole concurrency story: two workers issue the
          same conditional update, PostgreSQL serialises them on the row, and
          the second one re-evaluates `status` after the first commits and
          matches nothing. A claim that matches zero rows is not an error — it
          means another worker owns this event.
        */
        const claim = await tm.updateMany({
          where: { id, status: { in: ["PENDING", "RETRYING"] } },
          data: { status: "RETRYING", attempts, claimedAt: now },
        });
        if (claim.count === 0) return "SKIPPED" as const;

        const usage = (tx as Record<string, unknown>).usageRecord as Model;
        const created = await usage.create({
          data: {
            organizationId: String(row.organizationId),
            userId: (row.actorId as string | null) ?? null,
            metric: String(row.metric),
            value: row.value as never,
            recordedAt: now,
          },
        });

        await tm.updateMany({
          where: { id, status: "RETRYING" },
          data: {
            status: "DELIVERED",
            deliveredAt: now,
            usageRecordId: String(created.id),
            lastErrorCode: null,
          },
        });
        return "DELIVERED" as const;
      });

      if (outcome === "SKIPPED") report.skipped += 1;
      else { report.claimed += 1; report.delivered += 1; }
    } catch (e) {
      /*
        The delivery transaction rolled back, so `attempts` did not persist
        either — it is recomputed and written here, outside the failed
        transaction, together with the next decision.

        Nothing is swallowed: every failure either schedules a retry or lands in
        DEAD_LETTER, and both are visible states with a stable error code.
      */
      report.claimed += 1;
      const dead = attempts >= MAX_DELIVERY_ATTEMPTS;
      await m.updateMany({
        where: { id, status: { in: ["PENDING", "RETRYING"] } },
        data: {
          status: dead ? "DEAD_LETTER" : "RETRYING",
          attempts,
          lastErrorCode: deliveryErrorCode(e),
          nextAttemptAt: dead ? now : new Date(now.getTime() + backoffMs(attempts)),
        },
      });
      if (dead) report.deadLettered += 1;
      else report.retrying += 1;
    }
  }

  return report;
}

/**
 * A stable code, never the driver's message — that would put table and column
 * names into a row an operator reads, and occasionally a value with it.
 */
function deliveryErrorCode(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code)) return code;
  return "METERING_DELIVERY_FAILED";
}

/** Operational view: what is stuck, and what never made it. */
export async function meteringOutboxHealth(organizationId?: string): Promise<
  Record<OutboxStatus, number>
> {
  const empty: Record<OutboxStatus, number> = {
    PENDING: 0, RETRYING: 0, DELIVERED: 0, FAILED: 0, DEAD_LETTER: 0,
  };
  const client = await getPrisma();
  const m = client ? outboxOf(client) : null;
  if (!m) return empty;

  for (const status of Object.keys(empty) as OutboxStatus[]) {
    empty[status] = await m.count({
      where: { status, ...(organizationId ? { organizationId } : {}) },
    });
  }
  return empty;
}
