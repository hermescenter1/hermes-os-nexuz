/**
 * Executive Management Center — nightly report generation.
 *
 * WHAT MAKES THIS SAFE TO RUN FROM A SCHEDULER
 * --------------------------------------------
 * 1. IDEMPOTENT BY CONSTRAINT, not by check-then-write. Two replicas that start
 *    the same night at the same instant both try to INSERT version 1; the
 *    unique key `(organizationId, businessDate, version)` lets exactly one win,
 *    and the loser re-reads and reports ALREADY_REPORTED. There is no window in
 *    which a pre-flight "does it exist?" can be true for both.
 * 2. NEVER REPORTS AN UNFINISHED DAY. The window is a business day that has
 *    already ended in the organization's zone. A run at 23:00 cannot produce a
 *    report for the day it is still inside.
 * 3. CORRECTIONS DO NOT OVERWRITE. A regeneration writes a NEW version naming
 *    the one it supersedes, with the actor and the reason. Version 1 is never
 *    mutated, so "what did we believe that night" stays answerable.
 * 4. NOTIFIES AT MOST ONCE. The right to notify is CLAIMED with a conditional
 *    update (`notifiedAt IS NULL` -> now). Whoever's update reports a row count
 *    of 1 may send; everyone else must not. A crash after the claim loses a
 *    notification rather than duplicating one — the deliberate direction, since
 *    the report is still in the archive either way.
 * 5. DETERMINISTIC. The summary is the same aggregation the screen uses, over a
 *    fixed window. No LLM, no embeddings, no sampling, no wall-clock inside the
 *    figures.
 */

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { buildExecutiveSummary, type ExecutiveSummary } from "../summary";
import { resolveCompletedDay, lastCompletedBusinessDay } from "../period";
import type { ExecutiveScope } from "../contract";
import {
  CALC_VERSION,
  FIRST_VERSION,
  coverageOf,
  type GenerationOutcome,
  type SectionCoverage,
  type StoredReport,
} from "./contract";

const REASON_UNAVAILABLE = "executive.reasons.sourceUnavailable";

type Row = Record<string, unknown>;

interface ReportDelegate {
  create(args: unknown): Promise<Row>;
  findFirst(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
}

function delegateOf(client: unknown): ReportDelegate | null {
  const d = (client as Record<string, unknown> | null)?.executiveDailyReport;
  return d && typeof (d as ReportDelegate).create === "function" ? (d as ReportDelegate) : null;
}

/** A unique-violation from either the driver or Prisma. */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return code === "P2002" || code === "23505";
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

const isoOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : iso(v);

function toStored(row: Row): StoredReport {
  return {
    organizationId: String(row.organizationId),
    businessDate: String(row.businessDate),
    version: Number(row.version),
    timeZone: String(row.timeZone),
    dayCutoffMinutes: Number(row.dayCutoffMinutes ?? 0),
    periodStartIso: iso(row.periodStart),
    periodEndIso: iso(row.periodEnd),
    generatedAtIso: iso(row.generatedAt),
    dataCutoffIso: iso(row.dataCutoffAt),
    calcVersion: String(row.calcVersion),
    coverage: (row.sourceCoverage ?? []) as SectionCoverage[],
    notifiedAtIso: isoOrNull(row.notifiedAt),
    supersedesVersion: row.supersedesVersion === null || row.supersedesVersion === undefined
      ? null
      : Number(row.supersedesVersion),
    regeneratedBy: row.regeneratedBy === null || row.regeneratedBy === undefined ? null : String(row.regeneratedBy),
    regenerationReason:
      row.regenerationReason === null || row.regenerationReason === undefined
        ? null
        : String(row.regenerationReason),
    snapshot: row.snapshot as unknown as ExecutiveSummary,
  };
}

/**
 * Report one business day for one organization.
 *
 * `businessDate` may be omitted, in which case the LAST COMPLETED day in the
 * organization's zone is used — the normal nightly path. Supplying it is for a
 * deliberate catch-up or a correction.
 */
export async function generateDailyReport(args: {
  scope: ExecutiveScope;
  nowMs: number;
  businessDate?: string;
  /** A correction. Requires an actor and a reason; both are audited. */
  correction?: { actorUserId: string; reason: string };
}): Promise<GenerationOutcome> {
  const { scope, nowMs } = args;

  const client = await getPrisma();
  const reports = delegateOf(client);
  if (!reports) return { kind: "FAILED", reasonKey: REASON_UNAVAILABLE };

  // The day to report. Never the one currently in progress.
  const target =
    args.businessDate ??
    lastCompletedBusinessDay({
      nowMs,
      timeZone: scope.timeZone,
      cutoffMinutes: scope.dayCutoffMinutes,
    }).dateKey;

  const window = resolveCompletedDay({
    dateKey: target,
    timeZone: scope.timeZone,
    cutoffMinutes: scope.dayCutoffMinutes,
  });

  // Refuse a day that has not finished. A caller may name any date; this is the
  // guard that stops a half-day being frozen as if it were whole.
  if (window.currentEndMs > nowMs) {
    return { kind: "SKIPPED_NOT_FINISHED", businessDate: target };
  }

  // The existing report for this night, if any. Read BEFORE building, so the
  // ordinary repeat run costs one cheap query instead of a full aggregation.
  const existing = (await reports.findMany({
    where: { organizationId: scope.organizationId, businessDate: target },
    orderBy: { version: "desc" },
    take: 1,
  }))[0];

  if (existing && !args.correction) {
    return { kind: "ALREADY_REPORTED", report: toStored(existing) };
  }

  const version = existing ? Number(existing.version) + 1 : FIRST_VERSION;

  // The SAME aggregation the screen uses, over the finished window.
  let summary: ExecutiveSummary;
  try {
    summary = await buildExecutiveSummary({
      scope,
      range: "today",
      // The figures' "computed at" is the real instant of generation; the
      // WINDOW is the finished day, supplied explicitly.
      nowMs,
      window,
    });
  } catch {
    return { kind: "FAILED", reasonKey: REASON_UNAVAILABLE };
  }

  const coverage = coverageOf(summary);

  const data = {
    organizationId: scope.organizationId,
    businessDate: target,
    version,
    timeZone: scope.timeZone,
    dayCutoffMinutes: scope.dayCutoffMinutes,
    periodStart: new Date(window.currentStartMs),
    periodEnd: new Date(window.currentEndMs),
    generatedAt: new Date(nowMs),
    // The data cutoff is the END OF THE WINDOW, not "now": nothing after the
    // day boundary is in these figures, and saying otherwise would overstate
    // how current the report is.
    dataCutoffAt: new Date(window.currentEndMs),
    calcVersion: CALC_VERSION,
    snapshot: summary as unknown as Record<string, unknown>,
    sourceCoverage: coverage as unknown as Record<string, unknown>,
    supersedesVersion: existing ? Number(existing.version) : null,
    regeneratedBy: args.correction?.actorUserId ?? null,
    regenerationReason: args.correction?.reason ?? null,
  };

  let created: Row;
  try {
    created = await reports.create({ data });
  } catch (err) {
    if (!isUniqueViolation(err)) return { kind: "FAILED", reasonKey: REASON_UNAVAILABLE };
    // Lost the race. Someone else wrote this exact version; converge on theirs.
    const winner = (await reports.findMany({
      where: { organizationId: scope.organizationId, businessDate: target },
      orderBy: { version: "desc" },
      take: 1,
    }))[0];
    if (!winner) return { kind: "FAILED", reasonKey: REASON_UNAVAILABLE };
    return { kind: "ALREADY_REPORTED", report: toStored(winner) };
  }

  // A correction is an accountable act, so it is audited with the actor and the
  // reason. The ordinary nightly run is not audited per organization: it is
  // routine machine work, and an audit row per tenant per night is noise that
  // buries the events that matter.
  if (args.correction) {
    await recordAuditEvent({
      userId: args.correction.actorUserId,
      organizationId: scope.organizationId,
      action: "executive.report.regenerate",
      entityType: "ExecutiveDailyReport",
      entityId: String(created.id),
      outcome: "SUCCESS",
      correlationId: scope.correlationId,
      metadata: {
        businessDate: target,
        version,
        supersedesVersion: data.supersedesVersion,
        reason: args.correction.reason,
        calcVersion: CALC_VERSION,
      },
    }).catch(() => undefined);
  }

  return { kind: args.correction ? "CORRECTED" : "CREATED", report: toStored(created) };
}

/**
 * Claim the right to notify about a report, exactly once.
 *
 * Returns true to AT MOST ONE caller. The claim is the conditional update
 * itself — `notifiedAt IS NULL` -> now — so two replicas holding the same row
 * cannot both proceed, and no lock is needed.
 *
 * Deliberately claim-then-send, not send-then-mark: a crash between the two
 * loses a notification, whereas the other order duplicates one. The report is
 * in the archive regardless, so a lost notification is recoverable by looking
 * at the dashboard; a duplicate at 3 a.m. is not recoverable at all.
 */
export async function claimNotification(args: {
  organizationId: string;
  businessDate: string;
  version: number;
  nowMs: number;
}): Promise<boolean> {
  const client = await getPrisma();
  const reports = delegateOf(client);
  if (!reports) return false;

  const claimed = await reports.updateMany({
    where: {
      organizationId: args.organizationId,
      businessDate: args.businessDate,
      version: args.version,
      notifiedAt: null,
    },
    data: { notifiedAt: new Date(args.nowMs) },
  });
  return claimed.count === 1;
}

/**
 * Give back a notification claim that delivered to nobody.
 *
 * A claim is spent the moment it is taken; if nobody could be told (no active
 * owner or administrator, or every send failed) and the claim stayed, the row
 * would say "notified" while nobody was, and no later pass would ever try
 * again. Releasing it makes the next pass retry.
 *
 * FENCED ON THE CLAIM'S OWN TIMESTAMP: only the exact claim this caller took is
 * cleared, never one another replica took since.
 */
export async function releaseNotificationClaim(args: {
  organizationId: string;
  businessDate: string;
  version: number;
  claimedAtMs: number;
}): Promise<boolean> {
  const client = await getPrisma();
  const reports = delegateOf(client);
  if (!reports) return false;

  const released = await reports.updateMany({
    where: {
      organizationId: args.organizationId,
      businessDate: args.businessDate,
      version: args.version,
      notifiedAt: new Date(args.claimedAtMs),
    },
    data: { notifiedAt: null },
  });
  return released.count === 1;
}
