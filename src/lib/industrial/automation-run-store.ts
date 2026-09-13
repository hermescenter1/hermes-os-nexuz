/**
 * PHASE 109-C-UI.2-R3 — durable state for an automation run (F-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS IN THE DATABASE
 * ─────────────────────────────────────────────────────────────────────────────
 * The sibling endpoint `POST /api/industrial-graph/rebuild` guards concurrency
 * with an in-process `Set`. That is honest for a single replica and worthless
 * for two: each process holds its own Set, so both admit the run. A retry that
 * lands on a different instance has the same problem for idempotency.
 *
 * So both guarantees are delegated to constraints the database enforces:
 *
 *   idempotency   UNIQUE (organizationId, idempotencyKey)
 *                 The loser of the race READS the winner's row and returns the
 *                 winner's result. A replay never produces a second execution.
 *
 *   concurrency   UNIQUE (organizationId, siteScopeKey) WHERE status IN
 *                 ('ACCEPTED','RUNNING')  — partial, so a finished run does not
 *                 block the next one, and NOT over a nullable column, so two
 *                 ORGANISATION-mode runs cannot both pass on distinct NULLs.
 *
 * Neither is a lock this code takes and must remember to release: both are
 * facts about the rows, so a crashed replica cannot leak a held lock. What a
 * crash CAN leave is a row stuck in RUNNING, which `expiresAt` and the sweep
 * below resolve — the only mechanism here that involves a clock.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  countersAreConsistent,
  emptyCounters,
  scopeKey,
  type RunCounters,
  type RunRequest,
} from "./automation-scope";

/** A run still ACCEPTED/RUNNING after this long is presumed abandoned. */
export const RUN_LEASE_MS = 15 * 60 * 1000;

export type RunStatus = "ACCEPTED" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface RunRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly scopeMode: "SITE" | "ORGANISATION";
  readonly status: RunStatus;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly actorId: string | null;
  readonly actorRole: string;
  readonly authMethod: string;
  readonly reason: string | null;
  readonly sitesIncluded: readonly string[];
  readonly sitesExcluded: readonly string[];
  readonly counters: RunCounters;
  readonly failureCode: string | null;
  readonly failures: readonly { assetId: string; code: string }[];
  readonly startedAt: string;
  readonly completedAt: string | null;
}

/** What `claimRun` decided. Three outcomes, none of which is "ran it twice". */
export type ClaimOutcome =
  /** This caller owns the run and must execute it. */
  | { readonly outcome: "CLAIMED"; readonly run: RunRecord }
  /** The same key and the same scope: return its stored result, run nothing. */
  | { readonly outcome: "REPLAY"; readonly run: RunRecord }
  /**
   * The same key naming a DIFFERENT scope. Answering with the stored run would
   * tell the caller an operation happened that did not.
   */
  | { readonly outcome: "KEY_SCOPE_MISMATCH"; readonly run: RunRecord }
  /** Another run holds this scope. */
  | { readonly outcome: "SCOPE_BUSY"; readonly run: RunRecord | null }
  /** No database. Never a silent success. */
  | { readonly outcome: "UNAVAILABLE"; readonly run: null };

type Model = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toRecord(r: Record<string, unknown>): RunRecord {
  return {
    id: String(r.id),
    organizationId: String(r.organizationId),
    siteId: r.siteId === null || r.siteId === undefined ? null : String(r.siteId),
    scopeMode: r.scopeMode === "ORGANISATION" ? "ORGANISATION" : "SITE",
    status: String(r.status) as RunStatus,
    idempotencyKey: String(r.idempotencyKey),
    requestId: String(r.requestId),
    actorId: r.actorId === null || r.actorId === undefined ? null : String(r.actorId),
    actorRole: String(r.actorRole ?? ""),
    authMethod: String(r.authMethod ?? ""),
    reason: r.reason === null || r.reason === undefined ? null : String(r.reason),
    sitesIncluded: asStringArray(r.sitesIncluded),
    sitesExcluded: asStringArray(r.sitesExcluded),
    counters: {
      assetsDiscovered: num(r.assetsDiscovered),
      assetsAttempted: num(r.assetsAttempted),
      assetsProcessed: num(r.assetsProcessed),
      assetsFailed: num(r.assetsFailed),
      snapshotsCreated: num(r.snapshotsCreated),
      riskScoresCreated: num(r.riskScoresCreated),
      alertsCreated: num(r.alertsCreated),
      recommendationsCreated: num(r.recommendationsCreated),
    },
    failureCode: r.failureCode === null || r.failureCode === undefined ? null : String(r.failureCode),
    failures: Array.isArray(r.failures)
      ? (r.failures as { assetId?: unknown; code?: unknown }[])
          .filter((f) => f && typeof f === "object")
          .map((f) => ({ assetId: String(f.assetId ?? ""), code: String(f.code ?? "UNKNOWN") }))
      : [],
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : String(r.startedAt ?? ""),
    completedAt:
      r.completedAt instanceof Date
        ? r.completedAt.toISOString()
        : r.completedAt
          ? String(r.completedAt)
          : null,
  };
}

/** A unique-constraint violation, whichever driver reported it. */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2002" || code === "23505") return true;
  return /unique constraint|duplicate key/i.test(String((e as Error)?.message ?? ""));
}

export interface ClaimInput {
  readonly organizationId: string;
  readonly request: RunRequest;
  readonly requestId: string;
  readonly actorId: string | null;
  readonly actorRole: string;
  readonly authMethod: string;
  readonly sitesIncluded: readonly string[];
  readonly sitesExcluded: readonly string[];
  readonly nowMs: number;
}

/**
 * Reclaim scopes whose lease has run out.
 *
 * Bounded by the same organisation as the caller — a sweep is not a licence to
 * touch another tenant's rows. Runs BEFORE the insert so a crashed replica
 * cannot hold a site's automation hostage.
 */
async function sweepExpired(m: Model, organizationId: string, nowMs: number): Promise<void> {
  await m.updateMany({
    where: {
      organizationId,
      status: { in: ["ACCEPTED", "RUNNING"] },
      expiresAt: { lt: new Date(nowMs) },
    },
    data: { status: "EXPIRED", failureCode: "LEASE_EXPIRED", completedAt: new Date(nowMs) },
  });
}

/**
 * Take the scope, or explain why not.
 *
 * The order matters: the replay check comes first, so a retry of a key whose run
 * is still in flight is answered as a REPLAY rather than as SCOPE_BUSY. The
 * caller asked "did my request happen?", and the honest answer is the run it
 * already owns, not a 409 about someone else's.
 */
export async function claimRun(input: ClaimInput): Promise<ClaimOutcome> {
  const db = await getPrisma();
  if (!db) return { outcome: "UNAVAILABLE", run: null };
  const m = (db as unknown as Record<string, Model>).industrialAutomationRun;

  const { organizationId, request, nowMs } = input;

  const existing = await m.findFirst({
    where: { organizationId, idempotencyKey: request.idempotencyKey },
  });
  if (existing) return replayOrMismatch(toRecord(existing), request);

  await sweepExpired(m, organizationId, nowMs);

  const counters = emptyCounters();
  try {
    const row = await m.create({
      data: {
        organizationId,
        siteId: request.siteId,
        siteScopeKey: scopeKey(request),
        scopeMode: request.scopeMode,
        status: "ACCEPTED",
        idempotencyKey: request.idempotencyKey,
        requestId: input.requestId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        authMethod: input.authMethod,
        reason: request.reason,
        sitesIncluded: [...input.sitesIncluded],
        sitesExcluded: [...input.sitesExcluded],
        ...counters,
        expiresAt: new Date(nowMs + RUN_LEASE_MS),
      },
    });
    return { outcome: "CLAIMED", run: toRecord(row) };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Two constraints can produce this. Re-reading tells us which, without
    // guessing: our own key means a concurrent retry of THIS request; anything
    // else means a different run already holds the scope.
    const mine = await m.findFirst({
      where: { organizationId, idempotencyKey: request.idempotencyKey },
    });
    if (mine) return replayOrMismatch(toRecord(mine), request);
    const holder = await m.findFirst({
      where: {
        organizationId,
        siteScopeKey: scopeKey(request),
        status: { in: ["ACCEPTED", "RUNNING"] },
      },
    });
    return { outcome: "SCOPE_BUSY", run: holder ? toRecord(holder) : null };
  }
}

/**
 * A key identifies one operation, not just one tenant.
 *
 * The stored run's scope has to match the scope being asked for, or the answer
 * would describe a different operation than the caller requested.
 */
function replayOrMismatch(run: RunRecord, request: RunRequest): ClaimOutcome {
  const sameScope = run.scopeMode === request.scopeMode && run.siteId === request.siteId;
  return sameScope ? { outcome: "REPLAY", run } : { outcome: "KEY_SCOPE_MISMATCH", run };
}

export async function markRunning(runId: string, nowMs: number): Promise<void> {
  const db = await getPrisma();
  if (!db) return;
  const m = (db as unknown as Record<string, Model>).industrialAutomationRun;
  await m.update({
    where: { id: runId },
    data: { status: "RUNNING", heartbeatAt: new Date(nowMs) },
  });
}

export interface FinishInput {
  readonly runId: string;
  readonly counters: RunCounters;
  readonly failures: readonly { assetId: string; code: string }[];
  readonly nowMs: number;
  /** Set only when the run itself failed, not when individual assets did. */
  readonly failureCode?: string;
}

/**
 * Close the run and publish its counts.
 *
 * The counters are checked before they are stored. F-06 was a response whose
 * headline number contradicted its own error list; a run that cannot produce
 * self-consistent counts is recorded as FAILED with `COUNTER_INCONSISTENCY`
 * rather than publishing numbers nobody can trust.
 */
export async function finishRun(input: FinishInput): Promise<RunRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as unknown as Record<string, Model>).industrialAutomationRun;

  const consistent = countersAreConsistent(input.counters);
  const failureCode = input.failureCode ?? (consistent ? null : "COUNTER_INCONSISTENCY");
  const status = failureCode === null ? "COMPLETED" : "FAILED";

  const row = await m.update({
    where: { id: input.runId },
    data: {
      status,
      failureCode,
      failures: input.failures.slice(0, 100).map((f) => ({ assetId: f.assetId, code: f.code })),
      ...input.counters,
      completedAt: new Date(input.nowMs),
      heartbeatAt: new Date(input.nowMs),
    },
  });
  return toRecord(row);
}
