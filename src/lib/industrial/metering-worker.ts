/**
 * PHASE 109-C-UI.2-R8 — the metering outbox worker.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT R8 FOUND BEFORE WRITING ANY OF THIS
 * ─────────────────────────────────────────────────────────────────────────────
 * The brief said not to invent a second scheduler if a shared one exists. There
 * is none. This repository has no cron, no BullMQ, no `node-cron`, no
 * server-side `setInterval`, no scheduled GitHub workflow, and no worker service
 * in any compose file. Its established pattern for work outside a request is a
 * profile-gated one-shot container running a `scripts/**\/*.mjs` that builds its
 * own Prisma client, and `tsx` is not even a declared dependency.
 *
 * So the delivery logic is NOT re-implemented in a script. It stays here, in the
 * TypeScript the tests actually exercise, and the runner is a thin trigger. R4
 * and R5 both cost a full evidence run to the same lesson: a re-implementation
 * of the rule under test proves nothing about the rule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO GUARANTEES, DELIBERATELY SEPARATE
 * ─────────────────────────────────────────────────────────────────────────────
 * CORRECTNESS — exactly-once delivery — is enforced per row by the conditional
 * status transition in `deliverPendingMeteringEvents` (R7). It holds with no
 * lease at all, with any number of replicas.
 *
 * COORDINATION — one sweeper at a time — is this file's lease. It stops replicas
 * doing redundant work and competing for the same rows. It is not load-bearing
 * for correctness, and saying so plainly matters: a reader who believes the
 * lease is what prevents double billing would draw the wrong conclusion the
 * first time it expires.
 *
 * The mutation matrix breaks them separately, and both go red.
 */

import { getPrisma } from "@/lib/db/prisma";
import { incCounter, setGauge } from "@/lib/observability/metrics";
import {
  deliverPendingMeteringEvents,
  type DeliveryReport,
  type OutboxStatus,
} from "./metering-outbox";

/** One job, one lease row. */
export const METERING_LEASE_NAME = "industrial.metering.outbox";

/**
 * How long a holder owns the job before the lease is up for grabs.
 *
 * Long enough that a slow pass does not lose its own lease mid-flight, short
 * enough that a crashed replica does not park the job for minutes. A pass is
 * bounded at 50 events, each a single small transaction.
 */
export const LEASE_TTL_MS = 60_000;

/** A crashed holder is never waited on manually; the lease simply expires. */
export const LEASE_RENEW_MS = 20_000;

type LeaseRow = {
  name: string;
  holder: string;
  expiresAt: Date;
  fencingToken: bigint | number;
};

type Model = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
};

const leaseOf = (client: unknown): Model | null =>
  ((client as Record<string, unknown>)?.workerLease as Model) ?? null;

const outboxOf = (client: unknown): Model | null =>
  ((client as Record<string, unknown>)?.industrialMeteringOutbox as Model) ?? null;

const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: unknown })?.code;
  return code === "23505" || code === "P2002";
};

export interface LeaseHandle {
  holder: string;
  fencingToken: number;
  expiresAt: Date;
}

/**
 * Try to take the job lease.
 *
 * Returns null when someone else holds it and their lease has not expired —
 * which is a normal outcome, not an error. Every path is a CONDITIONAL write:
 * the row is only claimed when it does not exist, or when its `expiresAt` has
 * already passed, or when this holder already owns it.
 */
export async function acquireLease(opts: {
  holder: string;
  client?: unknown;
  nowMs?: number;
  name?: string;
  ttlMs?: number;
}): Promise<LeaseHandle | null> {
  const name = opts.name ?? METERING_LEASE_NAME;
  const now = new Date(opts.nowMs ?? Date.now());
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? LEASE_TTL_MS));

  const client = opts.client ?? (await getPrisma());
  if (!client) return null;
  const m = leaseOf(client);
  if (!m) return null;

  const existing = (await m.findFirst({ where: { name } })) as LeaseRow | null;

  if (!existing) {
    /*
      No row yet. Two replicas starting together will both reach this branch,
      and the PRIMARY KEY decides between them — the loser catches the unique
      violation and re-reads. Nothing here relies on the read being atomic with
      the write, because it is not.
    */
    try {
      const row = (await m.create({
        data: { name, holder: opts.holder, acquiredAt: now, heartbeatAt: now, expiresAt, fencingToken: 1 },
      })) as unknown as LeaseRow;
      return { holder: opts.holder, fencingToken: Number(row.fencingToken), expiresAt };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return null;
    }
  }

  const heldByMe = existing.holder === opts.holder;
  const stale = new Date(existing.expiresAt).getTime() <= now.getTime();
  if (!heldByMe && !stale) return null;

  /*
    THE CONDITIONAL CLAIM, and the whole distributed-lock story.

    `expiresAt` is repeated in the WHERE clause with the value this replica
    READ. Two replicas that both saw the same stale lease issue the same update;
    PostgreSQL serialises them on the row, and the second one re-evaluates the
    predicate after the first commits, finds `expiresAt` moved, and matches zero
    rows. Dropping either predicate lets both win — which is exactly what the M1
    control does.
  */
  const nextToken = Number(existing.fencingToken) + 1;
  const claim = await m.updateMany({
    where: heldByMe
      ? { name, holder: opts.holder }
      : { name, holder: existing.holder, expiresAt: existing.expiresAt },
    data: { holder: opts.holder, acquiredAt: now, heartbeatAt: now, expiresAt, fencingToken: nextToken },
  });
  if (claim.count === 0) return null;

  return { holder: opts.holder, fencingToken: nextToken, expiresAt };
}

/**
 * Extend a lease this replica still owns.
 *
 * Guarded by the fencing token: a holder that was paused past its expiry, and
 * whose lease was taken by someone else, renews nothing and learns it lost.
 */
export async function renewLease(opts: {
  handle: LeaseHandle;
  client?: unknown;
  nowMs?: number;
  name?: string;
  ttlMs?: number;
}): Promise<LeaseHandle | null> {
  const name = opts.name ?? METERING_LEASE_NAME;
  const now = new Date(opts.nowMs ?? Date.now());
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? LEASE_TTL_MS));

  const client = opts.client ?? (await getPrisma());
  if (!client) return null;
  const m = leaseOf(client);
  if (!m) return null;

  const ok = await m.updateMany({
    where: { name, holder: opts.handle.holder, fencingToken: opts.handle.fencingToken },
    data: { heartbeatAt: now, expiresAt },
  });
  if (ok.count === 0) return null;
  return { ...opts.handle, expiresAt };
}

/**
 * Give the lease up early.
 *
 * Also fenced: a superseded holder shutting down must not clear a lease that
 * now belongs to someone else. Releasing is an optimisation — the expiry alone
 * is enough — so a failed release is not an error.
 */
export async function releaseLease(opts: {
  handle: LeaseHandle;
  client?: unknown;
  nowMs?: number;
  name?: string;
}): Promise<boolean> {
  const name = opts.name ?? METERING_LEASE_NAME;
  const now = new Date(opts.nowMs ?? Date.now());
  const client = opts.client ?? (await getPrisma());
  if (!client) return false;
  const m = leaseOf(client);
  if (!m) return false;

  const done = await m.updateMany({
    where: { name, holder: opts.handle.holder, fencingToken: opts.handle.fencingToken },
    data: { expiresAt: now },
  });
  return done.count > 0;
}

export interface PassResult extends DeliveryReport {
  /** false when another replica holds the lease. Not an error. */
  acquired: boolean;
  holder: string | null;
  fencingToken: number | null;
}

/**
 * One bounded pass: take the lease, deliver what is due, publish metrics, let go.
 *
 * Bounded on purpose. An unbounded drain would hold the lease for as long as the
 * backlog takes and make "the worker is stuck" indistinguishable from "the
 * worker is busy". The caller polls; each call is short and observable.
 */
export async function runMeteringDeliveryPass(opts?: {
  holder?: string;
  limit?: number;
  client?: unknown;
  nowMs?: number;
}): Promise<PassResult> {
  const holder = opts?.holder ?? defaultHolder();
  const client = opts?.client ?? (await getPrisma());
  const empty: PassResult = {
    acquired: false, holder: null, fencingToken: null,
    claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0,
  };
  if (!client) return empty;

  const handle = await acquireLease({ holder, client, nowMs: opts?.nowMs });
  if (!handle) {
    incCounter("industrial_metering_worker_passes_total", { outcome: "not_leader" });
    return empty;
  }

  try {
    const report = await deliverPendingMeteringEvents({
      limit: opts?.limit,
      client,
      nowMs: opts?.nowMs,
    });

    incCounter("industrial_metering_delivered_total", undefined, report.delivered);
    incCounter("industrial_metering_retries_total", undefined, report.retrying);
    incCounter("industrial_metering_dead_letter_total", undefined, report.deadLettered);
    incCounter("industrial_metering_worker_passes_total", { outcome: "ok" });

    await publishMeteringGauges({ client, nowMs: opts?.nowMs });

    return { ...report, acquired: true, holder, fencingToken: handle.fencingToken };
  } catch (e) {
    incCounter("industrial_metering_worker_passes_total", { outcome: "error" });
    throw e;
  } finally {
    /*
      Always released, including on the throwing path. A pass that died holding
      the lease would otherwise park the job for the full TTL — recoverable, but
      needlessly slow, and it would make a transient fault look like a stuck
      worker in the metrics.
    */
    await releaseLease({ handle, client, nowMs: opts?.nowMs }).catch(() => false);
  }
}

export interface MeteringHealth {
  counts: Record<OutboxStatus, number>;
  /** Age in milliseconds of the oldest event still awaiting delivery. */
  oldestPendingAgeMs: number;
  lease: { holder: string; expiresAt: string; heldNow: boolean } | null;
}

/**
 * The operational view. Read-only, and the source of the gauges.
 *
 * `oldestPendingAgeMs` is the number that actually tells an operator whether the
 * worker is running: totals can look healthy while nothing has moved for hours.
 */
export async function meteringHealth(opts?: {
  client?: unknown;
  nowMs?: number;
}): Promise<MeteringHealth> {
  const now = opts?.nowMs ?? Date.now();
  const counts: Record<OutboxStatus, number> = {
    PENDING: 0, RETRYING: 0, DELIVERED: 0, FAILED: 0, DEAD_LETTER: 0,
  };
  const empty: MeteringHealth = { counts, oldestPendingAgeMs: 0, lease: null };

  const client = opts?.client ?? (await getPrisma());
  if (!client) return empty;
  const outbox = outboxOf(client);
  if (!outbox) return empty;

  for (const status of Object.keys(counts) as OutboxStatus[]) {
    counts[status] = await outbox.count({ where: { status } });
  }

  const oldest = await outbox.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] } },
    orderBy: { createdAt: "asc" },
    take: 1,
  });
  const oldestPendingAgeMs =
    oldest.length === 0 ? 0 : Math.max(0, now - new Date(String(oldest[0].createdAt)).getTime());

  let lease: MeteringHealth["lease"] = null;
  const lm = leaseOf(client);
  if (lm) {
    const row = (await lm.findFirst({ where: { name: METERING_LEASE_NAME } })) as LeaseRow | null;
    if (row) {
      lease = {
        holder: row.holder,
        expiresAt: new Date(row.expiresAt).toISOString(),
        heldNow: new Date(row.expiresAt).getTime() > now,
      };
    }
  }

  return { counts, oldestPendingAgeMs, lease };
}

/** Publish the health snapshot as gauges. Called after every pass. */
export async function publishMeteringGauges(opts?: {
  client?: unknown;
  nowMs?: number;
}): Promise<MeteringHealth> {
  const h = await meteringHealth(opts);
  setGauge("industrial_metering_outbox_pending", h.counts.PENDING);
  setGauge("industrial_metering_outbox_retrying", h.counts.RETRYING);
  setGauge("industrial_metering_outbox_delivered", h.counts.DELIVERED);
  setGauge("industrial_metering_outbox_dead_letter", h.counts.DEAD_LETTER);
  setGauge("industrial_metering_oldest_pending_age_seconds", Math.round(h.oldestPendingAgeMs / 1000));
  return h;
}

/**
 * An opaque holder id.
 *
 * Deliberately NOT a hostname or a pod name: the lease row is operational data
 * that an operator reads, and a hostname in a single-tenant deployment can name
 * the tenant. A random id per process is enough to tell replicas apart.
 */
let cachedHolder: string | null = null;
export function defaultHolder(): string {
  if (!cachedHolder) {
    cachedHolder = `worker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return cachedHolder;
}
