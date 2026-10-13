/**
 * Executive Management Center — the nightly report worker.
 *
 * ONE PASS = one bounded sweep over the organizations that are due a report.
 *
 * COORDINATION vs CORRECTNESS, kept apart (the same split the metering worker
 * documents, and worth restating because a reader who confuses them draws the
 * wrong conclusion the first time the lease expires):
 *
 *   · CORRECTNESS — at most one report per organization per night — is enforced
 *     PER ROW by the unique key `(organizationId, businessDate, version)`. It
 *     holds with no lease at all, with any number of replicas, and it is what
 *     `generate.test.ts` exercises with two concurrent runs.
 *   · COORDINATION — one sweeper at a time — is the lease below. It stops
 *     replicas doing redundant work; it is NOT load-bearing for correctness.
 *
 * The lease is the SAME primitive the metering worker uses, with a different
 * name. `acquireLease` takes the job name as a parameter precisely so a second
 * job needs no second implementation.
 *
 * BOUNDED BY CONSTRUCTION, COMPLETE BY CURSOR: one pass handles at most
 * `maxOrganizations`, in id order, starting AFTER `afterOrganizationId`, and
 * returns `nextAfterOrganizationId` — null once the last organization has been
 * visited. The runner chains passes until it is null, so every tenant is
 * reached however many there are, and no single request becomes a long job.
 * (Before this, every pass read the same first 50 ids, so tenant 51 was never
 * reported.) Organizations already reported for their night are skipped by the
 * cheap existence read inside `generateDailyReport`.
 *
 * The lease is renewed while a batch runs and released when it ends, so the
 * next chained request — a new holder — can take it at once. A pass that loses
 * its lease mid-batch stops and says so.
 */

import { getPrisma } from "@/lib/db/prisma";
import { acquireLease, releaseLease, renewLease, type LeaseHandle } from "@/lib/industrial/metering-worker";
import { getNotificationService } from "@/lib/notifications/service";
import { defaultSettings, loadExecutiveSettingsMany, type SettingsDb } from "../settings";
import { lastCompletedBusinessDay } from "../period";
import type { ExecutiveScope } from "../contract";
import { claimNotification, generateDailyReport, releaseNotificationClaim } from "./generate";
import type { GenerationOutcome } from "./contract";

/** One job, one lease row. */
export const REPORT_LEASE_NAME = "executive.daily.report";

/** Long enough for a slow pass, short enough that a crashed replica frees it. */
export const REPORT_LEASE_TTL_MS = 120_000;

/** A pass never touches more organizations than this; the cursor covers the rest. */
export const DEFAULT_MAX_ORGANIZATIONS = 50;

/** Who is told a report is ready: the organization's active owners and administrators. */
export const NOTIFY_ROLES = ["OWNER", "ADMIN"] as const;

/** A ceiling on recipients per report, so one organization cannot fan out unboundedly. */
export const MAX_NOTIFY_RECIPIENTS = 25;

/** Why a report that exists could not be announced. Operator-facing codes. */
export type UndeliveredReason = "NO_RECIPIENT" | "DELIVERY_FAILED";

export interface PassReport {
  readonly ranAt: string;
  readonly leaseHeld: boolean;
  /**
   * The night in the DEFAULT zone. Each organization reports its own last
   * completed day in its own zone; `distinctBusinessDates` lists every night
   * this pass actually targeted.
   */
  readonly businessDate: string | null;
  readonly distinctBusinessDates: readonly string[];
  readonly considered: number;
  readonly created: number;
  readonly alreadyReported: number;
  readonly skippedNotFinished: number;
  readonly failed: number;
  readonly notified: number;
  /** Organizations whose generation failed, so a failure is attributable. */
  readonly failures: ReadonlyArray<{ organizationId: string; reasonKey: string }>;
  /**
   * Reports that exist but reached nobody. Their claim was given back, so a
   * later pass retries; listing them here is what makes the gap visible.
   */
  readonly undelivered: ReadonlyArray<{ organizationId: string; businessDate: string; reason: UndeliveredReason }>;
  /** The cursor this pass started after; null for the first batch. */
  readonly afterOrganizationId: string | null;
  /** Where the next pass starts; null once every organization has been visited. */
  readonly nextAfterOrganizationId: string | null;
  /** The lease was taken over mid-batch; the batch stopped where it was. */
  readonly leaseLost: boolean;
}

type Row = Record<string, unknown>;

interface OrgDelegate {
  findMany(args: unknown): Promise<Row[]>;
}
interface MemberDelegate {
  findMany(args: unknown): Promise<Row[]>;
}

const emptyPass = (nowMs: number, leaseHeld: boolean, after: string | null = null): PassReport => ({
  ranAt: new Date(nowMs).toISOString(),
  leaseHeld,
  businessDate: null,
  distinctBusinessDates: [],
  considered: 0,
  created: 0,
  alreadyReported: 0,
  skippedNotFinished: 0,
  failed: 0,
  notified: 0,
  failures: [],
  undelivered: [],
  afterOrganizationId: after,
  nextAfterOrganizationId: null,
  leaseLost: false,
});

/**
 * The scope a REPORT runs under.
 *
 * Deliberately NOT a reader's scope. A nightly report is produced by the system
 * for the organization as a whole, so it is generated at the organization's
 * full breadth — every axis, every site — and the PER-READER narrowing happens
 * when somebody opens it, against their permissions at that moment. Freezing
 * one reader's view into the archive would mean the report said different
 * things depending on who happened to trigger it.
 */
function systemScopeFor(args: {
  organizationId: string;
  timeZone: string;
  cutoffMinutes: number;
  siteIds: readonly string[];
}): ExecutiveScope {
  return {
    userId: "system:executive-report",
    organizationId: args.organizationId,
    memberId: "system",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true },
    // EVERY active site of this organization. An empty list here would make the
    // industrial section fail closed in every report, which would look like a
    // permission refusal rather than what it is.
    allowedSiteIds: args.siteIds,
    timeZone: args.timeZone,
    dayCutoffMinutes: args.cutoffMinutes,
    correlationId: `executive-report:${args.organizationId}`,
  };
}

/** Every ACTIVE site of one organization. Bounded; an unreadable list is empty. */
async function siteIdsOf(client: unknown, organizationId: string): Promise<string[]> {
  const sites = (client as { industrialSite?: OrgDelegate }).industrialSite;
  if (!sites) return [];
  try {
    const rows = await sites.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true },
      take: 1_000,
    });
    return rows.map(r => String(r.id));
  } catch {
    return [];
  }
}

/**
 * Run one bounded pass.
 *
 * `nowMs` is injected so a pass is a function of its inputs: the same instant
 * produces the same target night, which is what makes the job testable and
 * replayable. `clock` is the wall clock used only to decide when the lease
 * needs renewing during a long batch.
 */
export async function runReportPass(args: {
  nowMs: number;
  holder: string;
  maxOrganizations?: number;
  /** Start after this organization id (exclusive); omit for the first batch. */
  afterOrganizationId?: string | null;
  /** Skips the lease. Only for a single-shot operator run. */
  withoutLease?: boolean;
  clock?: () => number;
}): Promise<PassReport> {
  const { nowMs, holder } = args;
  const max = Math.max(1, args.maxOrganizations ?? DEFAULT_MAX_ORGANIZATIONS);
  const after = args.afterOrganizationId ?? null;
  const clock = args.clock ?? Date.now;

  const client = await getPrisma();
  if (!client) return emptyPass(nowMs, false, after);

  let lease: LeaseHandle | null = null;
  if (!args.withoutLease) {
    lease = await acquireLease({
      holder,
      client,
      nowMs,
      name: REPORT_LEASE_NAME,
      ttlMs: REPORT_LEASE_TTL_MS,
    });
    // Someone else holds it. That is a normal outcome, not an error.
    if (!lease) return emptyPass(nowMs, false, after);
  }

  try {
    return await runBatch({ client, nowMs, max, after, clock, lease });
  } finally {
    // Give the lease back at once: the next chained request is a new holder and
    // must not wait out the TTL. Fenced, so a superseded holder clears nothing.
    if (lease) {
      await releaseLease({ handle: lease, client, nowMs: clock(), name: REPORT_LEASE_NAME }).catch(() => false);
    }
  }
}

async function runBatch(ctx: {
  client: unknown;
  nowMs: number;
  max: number;
  after: string | null;
  clock: () => number;
  lease: LeaseHandle | null;
}): Promise<PassReport> {
  const { client, nowMs, max, after, clock } = ctx;
  let lease = ctx.lease;

  // The night in the DEFAULT zone, reported at pass level for operators. The
  // per-organization target is resolved below from each tenant's own zone.
  const fallbackZone = defaultSettings().values;
  const target = lastCompletedBusinessDay({
    nowMs,
    timeZone: fallbackZone.timeZone,
    cutoffMinutes: fallbackZone.dayCutoffMinutes,
  }).dateKey;

  const orgs = (client as { organization?: OrgDelegate }).organization;
  if (!orgs) return { ...emptyPass(nowMs, lease !== null, after), businessDate: target };

  let rows: Row[];
  try {
    rows = await orgs.findMany({
      select: { id: true },
      ...(after ? { where: { id: { gt: after } } } : {}),
      orderBy: { id: "asc" },
      take: max,
    });
  } catch {
    return { ...emptyPass(nowMs, lease !== null, after), businessDate: target };
  }

  let created = 0;
  let alreadyReported = 0;
  let skippedNotFinished = 0;
  let failed = 0;
  let notified = 0;
  let leaseLost = false;
  let lastVisited: string | null = after;
  const failures: Array<{ organizationId: string; reasonKey: string }> = [];
  const undelivered: Array<{ organizationId: string; businessDate: string; reason: UndeliveredReason }> = [];
  const targets = new Set<string>();

  // ONE bounded read for every organization in this pass, not one per tenant.
  const settingsByOrg = await loadExecutiveSettingsMany(
    rows.map(r => String(r.id)),
    client as SettingsDb,
  );

  let renewedAt = clock();
  for (const row of rows) {
    // Renew well before expiry. Losing the lease means another replica has
    // taken over: stop here rather than race it, and say where we stopped.
    if (lease && clock() - renewedAt > REPORT_LEASE_TTL_MS / 3) {
      lease = await renewLease({
        handle: lease,
        client,
        nowMs: clock(),
        name: REPORT_LEASE_NAME,
        ttlMs: REPORT_LEASE_TTL_MS,
      }).catch(() => null);
      renewedAt = clock();
      if (!lease) {
        leaseLost = true;
        break;
      }
    }

    const organizationId = String(row.id);
    lastVisited = organizationId;
    // Each tenant's OWN zone and cutoff decide which night is finished for it.
    // Two organizations in different zones can legitimately be reporting
    // different dates in the same pass.
    const zone = (settingsByOrg.get(organizationId) ?? defaultSettings()).values;
    const orgTarget = lastCompletedBusinessDay({
      nowMs,
      timeZone: zone.timeZone,
      cutoffMinutes: zone.dayCutoffMinutes,
    }).dateKey;
    targets.add(orgTarget);
    const scope = systemScopeFor({
      organizationId,
      timeZone: zone.timeZone,
      cutoffMinutes: zone.dayCutoffMinutes,
      siteIds: await siteIdsOf(client, organizationId),
    });

    let outcome: GenerationOutcome;
    try {
      outcome = await generateDailyReport({ scope, nowMs, businessDate: orgTarget });
    } catch {
      failed += 1;
      failures.push({ organizationId, reasonKey: "executive.reasons.sourceUnavailable" });
      continue;
    }

    let toAnnounce: { businessDate: string; version: number } | null = null;
    if (outcome.kind === "CREATED" || outcome.kind === "CORRECTED") {
      created += 1;
      toAnnounce = outcome.report;
    } else if (outcome.kind === "ALREADY_REPORTED") {
      alreadyReported += 1;
      // A report whose announcement reached nobody had its claim given back;
      // this is the retry. A report already announced is left alone, at no cost.
      if (outcome.report.notifiedAtIso === null) toAnnounce = outcome.report;
    } else if (outcome.kind === "SKIPPED_NOT_FINISHED") {
      skippedNotFinished += 1;
    } else {
      failed += 1;
      failures.push({ organizationId, reasonKey: outcome.reasonKey });
    }

    if (toAnnounce) {
      const result = await announce(client, organizationId, toAnnounce, nowMs);
      if (result === "SENT") notified += 1;
      else if (result !== "NOT_CLAIMED") {
        undelivered.push({ organizationId, businessDate: toAnnounce.businessDate, reason: result });
      }
    }
  }

  // A full batch may have more behind it; a short one was the last. A batch cut
  // short by a lost lease resumes after the last organization it visited.
  const more = leaseLost || rows.length === max;
  return {
    ranAt: new Date(nowMs).toISOString(),
    leaseHeld: ctx.lease !== null,
    businessDate: target,
    distinctBusinessDates: [...targets].sort(),
    considered: rows.length,
    created,
    alreadyReported,
    skippedNotFinished,
    failed,
    notified,
    failures,
    undelivered,
    afterOrganizationId: after,
    nextAfterOrganizationId: more ? lastVisited : null,
    leaseLost,
  };
}

/**
 * Announce one report, at most once, and never pretend it was announced.
 *
 * Claim first (so two replicas cannot both send), then deliver. If nobody
 * received it, the claim is given back so a later pass retries, and the caller
 * lists it as undelivered — the report row never says "notified" when nobody
 * was.
 */
async function announce(
  client: unknown,
  organizationId: string,
  report: { businessDate: string; version: number },
  nowMs: number,
): Promise<"SENT" | "NOT_CLAIMED" | UndeliveredReason> {
  const claimed = await claimNotification({
    organizationId,
    businessDate: report.businessDate,
    version: report.version,
    nowMs,
  }).catch(() => false);
  if (!claimed) return "NOT_CLAIMED";

  const delivery = await notifyRecipients(client, organizationId, report.businessDate);
  if (delivery.sent > 0) return "SENT";

  await releaseNotificationClaim({
    organizationId,
    businessDate: report.businessDate,
    version: report.version,
    claimedAtMs: nowMs,
  }).catch(() => false);
  return delivery.recipients === 0 ? "NO_RECIPIENT" : "DELIVERY_FAILED";
}

/**
 * Tell the organization's active owners and administrators that a report is
 * ready.
 *
 * IN-APP ONLY, on purpose. The brief allows an external channel only where a
 * real connection and an explicit manager setting exist; neither exists in this
 * product today, so inventing an email path here would be shipping a channel
 * nobody configured. The notification carries no figures — only that a report
 * exists — so an alert sitting in someone's list never becomes a side channel
 * around the permission check they have to pass to open it.
 */
async function notifyRecipients(
  client: unknown,
  organizationId: string,
  businessDate: string,
): Promise<{ recipients: number; sent: number }> {
  const members = (client as { organizationMember?: MemberDelegate }).organizationMember;
  if (!members) return { recipients: 0, sent: 0 };

  let userIds: string[];
  try {
    const rows = await members.findMany({
      where: { organizationId, status: "ACTIVE", role: { in: [...NOTIFY_ROLES] } },
      select: { userId: true },
      orderBy: { userId: "asc" },
      take: MAX_NOTIFY_RECIPIENTS,
    });
    userIds = [...new Set(rows.map(r => r.userId).filter((u): u is string => typeof u === "string" && u !== ""))];
  } catch {
    return { recipients: 0, sent: 0 };
  }

  let sent = 0;
  for (const userId of userIds) {
    try {
      const created = await getNotificationService().create({
        userId,
        organizationId,
        type: "info",
        title: "Executive daily report",
        message: `The management report for ${businessDate} is ready.`,
        metadata: { kind: "executive.report", businessDate },
      });
      if (created !== null) sent += 1;
    } catch {
      // One recipient's failure must not stop the others.
    }
  }
  return { recipients: userIds.length, sent };
}
