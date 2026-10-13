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
 * BOUNDED BY CONSTRUCTION: one pass handles at most `maxOrganizations`, so a
 * platform with thousands of tenants makes progress every tick instead of one
 * enormous transaction that never finishes. Organizations already reported for
 * the target night are skipped by the cheap existence read inside
 * `generateDailyReport`, so a repeat pass costs one query each.
 */

import { getPrisma } from "@/lib/db/prisma";
import { acquireLease, type LeaseHandle } from "@/lib/industrial/metering-worker";
import { getNotificationService } from "@/lib/notifications/service";
import { defaultSettings, loadExecutiveSettingsMany, type SettingsDb } from "../settings";
import { lastCompletedBusinessDay } from "../period";
import type { ExecutiveScope } from "../contract";
import { claimNotification, generateDailyReport } from "./generate";
import type { GenerationOutcome } from "./contract";

/** One job, one lease row. */
export const REPORT_LEASE_NAME = "executive.daily.report";

/** Long enough for a slow pass, short enough that a crashed replica frees it. */
export const REPORT_LEASE_TTL_MS = 120_000;

/** A pass never touches more organizations than this. */
export const DEFAULT_MAX_ORGANIZATIONS = 50;

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
}

type Row = Record<string, unknown>;

interface OrgDelegate {
  findMany(args: unknown): Promise<Row[]>;
}
interface MemberDelegate {
  findFirst(args: unknown): Promise<Row | null>;
}

const emptyPass = (nowMs: number, leaseHeld: boolean): PassReport => ({
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
 * replayable.
 */
export async function runReportPass(args: {
  nowMs: number;
  holder: string;
  maxOrganizations?: number;
  /** Skips the lease. Only for a single-shot operator run. */
  withoutLease?: boolean;
}): Promise<PassReport> {
  const { nowMs, holder } = args;
  const max = Math.max(1, args.maxOrganizations ?? DEFAULT_MAX_ORGANIZATIONS);

  const client = await getPrisma();
  if (!client) return emptyPass(nowMs, false);

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
    if (!lease) return emptyPass(nowMs, false);
  }

  // The night in the DEFAULT zone, reported at pass level for operators. The
  // per-organization target is resolved below from each tenant's own zone.
  const fallbackZone = defaultSettings().values;
  const target = lastCompletedBusinessDay({
    nowMs,
    timeZone: fallbackZone.timeZone,
    cutoffMinutes: fallbackZone.dayCutoffMinutes,
  }).dateKey;

  const orgs = (client as unknown as { organization?: OrgDelegate }).organization;
  if (!orgs) return { ...emptyPass(nowMs, lease !== null), businessDate: target };

  let rows: Row[];
  try {
    rows = await orgs.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: max });
  } catch {
    return { ...emptyPass(nowMs, lease !== null), businessDate: target };
  }

  let created = 0;
  let alreadyReported = 0;
  let skippedNotFinished = 0;
  let failed = 0;
  let notified = 0;
  const failures: Array<{ organizationId: string; reasonKey: string }> = [];
  const targets = new Set<string>();

  // ONE bounded read for every organization in this pass, not one per tenant.
  const settingsByOrg = await loadExecutiveSettingsMany(
    rows.map(r => String(r.id)),
    client as unknown as SettingsDb,
  );

  for (const row of rows) {
    const organizationId = String(row.id);
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

    if (outcome.kind === "CREATED" || outcome.kind === "CORRECTED") {
      created += 1;
      // Claim first, then send. A crash between the two loses a notification
      // rather than duplicating one; the report is in the archive either way.
      const mayNotify = await claimNotification({
        organizationId,
        businessDate: outcome.report.businessDate,
        version: outcome.report.version,
        nowMs,
      });
      if (mayNotify && (await notifyOwners(client, organizationId, outcome.report.businessDate))) {
        notified += 1;
      }
    } else if (outcome.kind === "ALREADY_REPORTED") {
      alreadyReported += 1;
    } else if (outcome.kind === "SKIPPED_NOT_FINISHED") {
      skippedNotFinished += 1;
    } else {
      failed += 1;
      failures.push({ organizationId, reasonKey: outcome.reasonKey });
    }
  }

  return {
    ranAt: new Date(nowMs).toISOString(),
    leaseHeld: lease !== null,
    businessDate: target,
    distinctBusinessDates: [...targets].sort(),
    considered: rows.length,
    created,
    alreadyReported,
    skippedNotFinished,
    failed,
    notified,
    failures,
  };
}

/**
 * Tell the organization's OWNER that a report is ready.
 *
 * IN-APP ONLY, on purpose. The brief allows an external channel only where a
 * real connection and an explicit manager setting exist; neither exists in this
 * product today, so inventing an email path here would be shipping a channel
 * nobody configured. The notification carries no figures — only that a report
 * exists — so an alert sitting in someone's list never becomes a side channel
 * around the permission check they have to pass to open it.
 */
async function notifyOwners(client: unknown, organizationId: string, businessDate: string): Promise<boolean> {
  const members = (client as { organizationMember?: MemberDelegate }).organizationMember;
  if (!members) return false;

  try {
    const owner = await members.findFirst({
      where: { organizationId, role: "OWNER", status: "ACTIVE" },
      select: { userId: true },
    });
    if (!owner?.userId) return false;

    const sent = await getNotificationService().create({
      userId: String(owner.userId),
      organizationId,
      type: "info",
      title: "Executive daily report",
      message: `The management report for ${businessDate} is ready.`,
      metadata: { kind: "executive.report", businessDate },
    });
    return sent !== null;
  } catch {
    return false;
  }
}
