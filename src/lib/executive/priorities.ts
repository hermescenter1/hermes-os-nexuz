/**
 * Executive Management Center — tomorrow's priorities.
 *
 * WHAT A PRIORITY IS HERE
 * -----------------------
 * Something a manager should act on before the end of the next business day,
 * placed there by ONE named rule from an ordered, written rule set. There is no
 * score. Every item carries the id of the rule that placed it and the numbers
 * that made the rule fire (how many days overdue, how long it has waited), so
 * the screen can say *why* in a sentence a manager can check against the
 * record.
 *
 * THE RULES, IN ORDER — the first rule an item matches decides its tier:
 *
 *   tier 1  CRITICAL_WORK_OVERDUE     a CRITICAL task or work order past its due date
 *   tier 1  CRITICAL_ALERT_OPEN       an open CRITICAL alert older than `alertAgeHours`
 *   tier 1  APPROVAL_CRITICALLY_LATE  an approval waiting `approvalCriticalDays` or more
 *   tier 2  HIGH_WORK_OVERDUE         a HIGH task or work order past its due date
 *   tier 2  URGENT_WORK_DUE_SOON      CRITICAL or HIGH work due before the end of tomorrow
 *   tier 2  APPROVAL_LATE             an approval waiting `approvalStaleDays` or more
 *   tier 2  HIGH_ALERT_OPEN           an open HIGH alert older than `alertAgeHours`
 *   tier 2  FOLLOW_UP_OVERDUE         a customer follow-up past the date it was promised for
 *   tier 3  WORK_OVERDUE              any other open work past its due date
 *   tier 3  WORK_DUE_SOON             any other open work due before the end of tomorrow
 *   tier 3  FOLLOW_UP_DUE_SOON        a customer follow-up due before the end of tomorrow
 *
 * WHY AN OVERDUE FOLLOW-UP IS TIER 2 AND OVERDUE WORK IS TIER 3. A LOW task
 * that slips is internal; a follow-up date is a commitment to someone outside
 * the organization who is waiting and cannot see why nothing happened. The
 * tier is a judgement, stated here so it can be argued with — and the rule is
 * still a rule: it fires on a date that has passed, nothing else. No
 * per-organization threshold is introduced for it yet; if one is wanted, it
 * belongs in `PriorityConfig` beside the others.
 *
 * Within a tier, the item under pressure longest comes first: earliest due date
 * for work, earliest raised for approvals and alerts. Ties break on id, so the
 * same records always produce the same list.
 *
 * The numeric thresholds are `PriorityConfig`. They are inputs, validated and
 * bounded, so that a later per-organization setting can change them without
 * changing the rules — and so the rule text on the screen can quote the values
 * that are actually in force.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *   · No opaque score, no weighting, no model. A rule either fires or it does not.
 *   · No item from a source the reader may not see. Work and approvals need
 *     `view_erp`; alerts need `view_industrial` AND are bounded by the reader's
 *     sites. A refused source is listed as excluded, with the reason — never
 *     silently dropped, because "nothing to do" and "nothing you may see" are
 *     different answers.
 *   · No unbounded read. Each source reads at most `CANDIDATE_LIMIT` rows,
 *     oldest pressure first, and says when it was cut.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  emptySection,
  operationalSection,
  refusedSection,
  type ExecutiveScope,
  type ExecutiveSection,
} from "./contract";
import { businessDayOf, nextBusinessDay, type BusinessDayWindow } from "./period";

/* ── Rules ─────────────────────────────────────────────────────────────────── */

export const PRIORITY_RULES = [
  { id: "CRITICAL_WORK_OVERDUE", tier: 1, params: [] },
  { id: "CRITICAL_ALERT_OPEN", tier: 1, params: ["alertAgeHours"] },
  { id: "APPROVAL_CRITICALLY_LATE", tier: 1, params: ["approvalCriticalDays"] },
  { id: "HIGH_WORK_OVERDUE", tier: 2, params: [] },
  { id: "URGENT_WORK_DUE_SOON", tier: 2, params: [] },
  { id: "APPROVAL_LATE", tier: 2, params: ["approvalStaleDays"] },
  { id: "HIGH_ALERT_OPEN", tier: 2, params: ["alertAgeHours"] },
  { id: "FOLLOW_UP_OVERDUE", tier: 2, params: [] },
  { id: "WORK_OVERDUE", tier: 3, params: [] },
  { id: "WORK_DUE_SOON", tier: 3, params: [] },
  { id: "FOLLOW_UP_DUE_SOON", tier: 3, params: [] },
] as const satisfies readonly { id: string; tier: 1 | 2 | 3; params: readonly (keyof PriorityConfig)[] }[];

/**
 * The version of the RANKING RULES, distinct from `CALC_VERSION` (which
 * versions the report's arithmetic) and from the product version.
 *
 * It changes when a rule is added, removed or re-tiered — that is, whenever
 * two lists produced by different versions are not comparable. A frozen
 * nightly list records it, so a reader of an old report can tell whether its
 * ordering means the same thing as today's.
 *
 *   priority-rules-1  the nine original rules (slices D and E)
 *   priority-rules-2  slice J added FOLLOW_UP_OVERDUE (tier 2) and
 *                     FOLLOW_UP_DUE_SOON (tier 3), so a list from version 1
 *                     could not contain a customer follow-up at all
 */
export const PRIORITY_RULES_VERSION = "priority-rules-2";

export type PriorityRuleId = (typeof PRIORITY_RULES)[number]["id"];
export type PriorityTier = 1 | 2 | 3;

const TIER_OF: Record<PriorityRuleId, PriorityTier> = Object.fromEntries(
  PRIORITY_RULES.map(r => [r.id, r.tier]),
) as Record<PriorityRuleId, PriorityTier>;

/* ── Configuration ─────────────────────────────────────────────────────────── */

export interface PriorityConfig {
  /** An approval waiting at least this many days is late (tier 2). */
  readonly approvalStaleDays: number;
  /** ...and at least this many days is critically late (tier 1). */
  readonly approvalCriticalDays: number;
  /** An open alert younger than this is still being handled, not a priority. */
  readonly alertAgeHours: number;
  /** The longest list shown. */
  readonly maxItems: number;
}

export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  approvalStaleDays: 3,
  approvalCriticalDays: 7,
  alertAgeHours: 4,
  maxItems: 25,
};

/** Inclusive bounds. A value outside them is refused, not clamped silently. */
export const PRIORITY_CONFIG_BOUNDS: Readonly<Record<keyof PriorityConfig, readonly [number, number]>> = {
  approvalStaleDays: [1, 60],
  approvalCriticalDays: [1, 120],
  alertAgeHours: [0, 168],
  maxItems: [5, 100],
};

export type PriorityConfigProblem =
  | { readonly field: keyof PriorityConfig; readonly problem: "NOT_AN_INTEGER" | "OUT_OF_RANGE" }
  | { readonly field: "approvalCriticalDays"; readonly problem: "NOT_AFTER_STALE" };

/**
 * Validate a configuration. Returns every problem, not the first, so a
 * settings form can show them all at once. An empty list means valid.
 */
export function validatePriorityConfig(config: PriorityConfig): PriorityConfigProblem[] {
  const problems: PriorityConfigProblem[] = [];
  for (const field of Object.keys(PRIORITY_CONFIG_BOUNDS) as (keyof PriorityConfig)[]) {
    const value = config[field];
    const [min, max] = PRIORITY_CONFIG_BOUNDS[field];
    if (!Number.isInteger(value)) problems.push({ field, problem: "NOT_AN_INTEGER" });
    else if (value < min || value > max) problems.push({ field, problem: "OUT_OF_RANGE" });
  }
  // "Critically late" must come strictly after "late", or tier 2's approval
  // rule could never fire and the two would silently collapse into one.
  if (
    Number.isInteger(config.approvalCriticalDays) &&
    Number.isInteger(config.approvalStaleDays) &&
    config.approvalCriticalDays <= config.approvalStaleDays
  ) {
    problems.push({ field: "approvalCriticalDays", problem: "NOT_AFTER_STALE" });
  }
  return problems;
}

/* ── Candidates and classification (pure) ──────────────────────────────────── */

export type PriorityKind = "TASK" | "WORK_ORDER" | "APPROVAL" | "ALERT" | "CUSTOMER_FOLLOW_UP";
export type WorkPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertSeverity = "CRITICAL" | "HIGH";

export type Candidate =
  | {
      readonly kind: "TASK" | "WORK_ORDER";
      readonly id: string;
      readonly title: string;
      readonly priority: WorkPriority;
      readonly dueMs: number;
      readonly createdMs: number;
    }
  | { readonly kind: "APPROVAL"; readonly id: string; readonly title: string; readonly createdMs: number }
  | {
      readonly kind: "ALERT";
      readonly id: string;
      readonly title: string;
      readonly severity: AlertSeverity;
      readonly createdMs: number;
    }
  | {
      /**
       * A customer whose next action is due. `title` is the customer's own
       * display name, which is why this source needs `view_customers` and not
       * the operations axis.
       */
      readonly kind: "CUSTOMER_FOLLOW_UP";
      readonly id: string;
      readonly title: string;
      readonly dueMs: number;
      readonly createdMs: number;
    };

export interface PriorityReason {
  readonly ruleId: PriorityRuleId;
  /** Whole days and remaining hours past due (work) or waiting (approvals, alerts). */
  readonly days: number;
  readonly hours: number;
  /** For "due soon" rules: when it falls due. */
  readonly dueAtIso: string | null;
}

export interface PriorityItem {
  readonly kind: PriorityKind;
  readonly id: string;
  readonly title: string;
  readonly tier: PriorityTier;
  readonly reason: PriorityReason;
  /** The instant the pressure is measured from — the sort key within a tier. */
  readonly pressureSinceIso: string;
  readonly detailPath: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function split(ms: number): { days: number; hours: number } {
  const safe = Math.max(0, ms);
  return { days: Math.floor(safe / DAY_MS), hours: Math.floor((safe % DAY_MS) / HOUR_MS) };
}

function detailPathOf(c: Candidate): string {
  switch (c.kind) {
    case "TASK":
      return `erp/tasks/${c.id}`;
    case "WORK_ORDER":
      return `erp/work-orders/${c.id}`;
    case "APPROVAL":
      return "erp/approvals?status=PENDING";
    case "ALERT":
      return "dashboard/operations/alerts";
    case "CUSTOMER_FOLLOW_UP":
      return `dashboard/clients/${c.id}`;
  }
}

/**
 * Apply the ordered rules to one candidate. Returns null when no rule fires —
 * which is a real answer ("not a priority before the end of tomorrow"), not an
 * error.
 */
export function classify(
  c: Candidate,
  ctx: { readonly nowMs: number; readonly horizonEndMs: number; readonly config: PriorityConfig },
): PriorityItem | null {
  const { nowMs, horizonEndMs, config } = ctx;
  let ruleId: PriorityRuleId | null = null;
  let pressureMs = c.createdMs;
  let elapsedMs = 0;
  let dueAtIso: string | null = null;

  if (c.kind === "TASK" || c.kind === "WORK_ORDER") {
    pressureMs = c.dueMs;
    const overdue = c.dueMs < nowMs;
    const dueSoon = !overdue && c.dueMs < horizonEndMs;
    const urgent = c.priority === "CRITICAL" || c.priority === "HIGH";
    if (overdue) {
      elapsedMs = nowMs - c.dueMs;
      ruleId =
        c.priority === "CRITICAL" ? "CRITICAL_WORK_OVERDUE" : c.priority === "HIGH" ? "HIGH_WORK_OVERDUE" : "WORK_OVERDUE";
    } else if (dueSoon) {
      dueAtIso = new Date(c.dueMs).toISOString();
      ruleId = urgent ? "URGENT_WORK_DUE_SOON" : "WORK_DUE_SOON";
    }
  } else if (c.kind === "APPROVAL") {
    pressureMs = c.createdMs;
    elapsedMs = nowMs - c.createdMs;
    if (elapsedMs >= config.approvalCriticalDays * DAY_MS) ruleId = "APPROVAL_CRITICALLY_LATE";
    else if (elapsedMs >= config.approvalStaleDays * DAY_MS) ruleId = "APPROVAL_LATE";
  } else if (c.kind === "ALERT") {
    pressureMs = c.createdMs;
    elapsedMs = nowMs - c.createdMs;
    if (elapsedMs >= config.alertAgeHours * HOUR_MS) {
      ruleId = c.severity === "CRITICAL" ? "CRITICAL_ALERT_OPEN" : "HIGH_ALERT_OPEN";
    }
  } else if (c.kind === "CUSTOMER_FOLLOW_UP") {
    // The promised date, exactly as work uses its due date: overdue measures
    // from the date, "due soon" names it.
    pressureMs = c.dueMs;
    if (c.dueMs < nowMs) {
      elapsedMs = nowMs - c.dueMs;
      ruleId = "FOLLOW_UP_OVERDUE";
    } else if (c.dueMs < horizonEndMs) {
      dueAtIso = new Date(c.dueMs).toISOString();
      ruleId = "FOLLOW_UP_DUE_SOON";
    }
  }

  if (ruleId === null) return null;
  const { days, hours } = split(elapsedMs);
  return {
    kind: c.kind,
    id: c.id,
    title: c.title,
    tier: TIER_OF[ruleId],
    reason: { ruleId, days, hours, dueAtIso },
    pressureSinceIso: new Date(pressureMs).toISOString(),
    detailPath: detailPathOf(c),
  };
}

/** Tier first, then longest under pressure, then id — a total, stable order. */
export function compareItems(a: PriorityItem, b: PriorityItem): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.pressureSinceIso !== b.pressureSinceIso) return a.pressureSinceIso < b.pressureSinceIso ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ── Database seam ─────────────────────────────────────────────────────────── */

interface FindManyDelegate {
  findMany(args: unknown): Promise<unknown[]>;
}

export interface PrioritiesDb {
  erpTask: FindManyDelegate;
  erpWorkOrder: FindManyDelegate;
  erpApprovalRequest: FindManyDelegate;
  assetAlert: FindManyDelegate;
  party: FindManyDelegate;
}

async function db(): Promise<PrioritiesDb | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const d = prisma as unknown as PrioritiesDb;
  if (!d.erpTask || !d.erpWorkOrder || !d.erpApprovalRequest || !d.assetAlert || !d.party) return null;
  return d;
}

/** Rows read per source. Oldest pressure first, so a cut drops the least urgent. */
export const CANDIDATE_LIMIT = 200;

/** The same "open" definitions the management view and the ERP layer use. */
const CLOSED_TASK = ["DONE", "CANCELLED"] as const;
const CLOSED_WORK_ORDER = ["COMPLETED", "CANCELLED"] as const;

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function ms(v: unknown): number | null {
  return v instanceof Date && Number.isFinite(v.getTime()) ? v.getTime() : null;
}
const WORK_PRIORITIES: readonly WorkPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function toWork(kind: "TASK" | "WORK_ORDER", raw: unknown): Candidate | null {
  const r = rec(raw);
  const id = str(r.id);
  const title = str(r.title);
  const dueMs = ms(r.dueDate);
  const createdMs = ms(r.createdAt);
  const priority = str(r.priority) as WorkPriority | null;
  // A row that cannot be read fully is skipped rather than guessed at: an
  // unknown priority must not be ranked as LOW, and a missing due date is not
  // "due now".
  if (!id || !title || dueMs === null || createdMs === null || !priority || !WORK_PRIORITIES.includes(priority)) {
    return null;
  }
  return { kind, id, title, priority, dueMs, createdMs };
}

/* ── Assembly ──────────────────────────────────────────────────────────────── */

export const PRIORITY_REASON = {
  forbiddenOperations: "executive.reasons.forbiddenOperations",
  forbiddenIndustrial: "executive.reasons.forbiddenIndustrial",
  forbiddenCustomers: "executive.reasons.forbiddenCustomers",
  noSites: "executive.reasons.noSites",
  noRows: "executive.reasons.noRows",
  sourceUnavailable: "executive.reasons.sourceUnavailable",
} as const;

export type PrioritySource = "tasks" | "workOrders" | "approvals" | "alerts" | "customerFollowUps";

export interface SourceNote {
  readonly source: PrioritySource;
  /** `null` when the source was read. */
  readonly excludedReasonKey: string | null;
  /** True when the source returned `CANDIDATE_LIMIT` rows and may hold more. */
  readonly truncated: boolean;
}

export interface PriorityList {
  readonly items: readonly PriorityItem[];
  /** Over every classified candidate, before `maxItems` is applied. */
  readonly tierCounts: Readonly<Record<PriorityTier, number>>;
  readonly totalPriorities: number;
  /** True when more priorities exist than `maxItems` shows. */
  readonly listTruncated: boolean;
  readonly sources: readonly SourceNote[];
}

export interface TomorrowsPriorities {
  readonly generatedAtIso: string;
  readonly timeZone: string;
  /** End of the next business day in the reporting zone — the horizon. */
  readonly horizonEndIso: string;
  /** `YYYY-MM-DD` of the day these priorities are FOR, in `timeZone`. */
  readonly targetBusinessDate: string;
  /** `YYYY-MM-DD` the horizon was measured from. */
  readonly anchorBusinessDate: string;
  readonly config: PriorityConfig;
  readonly priorities: ExecutiveSection<PriorityList>;
}

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

export async function buildTomorrowsPriorities(args: {
  scope: ExecutiveScope;
  nowMs: number;
  config?: PriorityConfig;
  /**
   * The business day the horizon is measured FROM. Omitted on the live
   * screen, where "today" is whatever day `nowMs` falls in.
   *
   * The nightly report supplies it, and must: that pass runs AFTER the day it
   * reports on has ended, so by its own clock "today" is already the next day
   * and `nextBusinessDay` would reach for the day after THAT. A report about
   * Monday would carry Wednesday's priorities. The day the list is for has to
   * come from the report, not from the moment the worker happened to wake.
   */
  anchorDay?: BusinessDayWindow;
  /** Test seam. Production code leaves it out. */
  client?: PrioritiesDb | null;
}): Promise<TomorrowsPriorities> {
  const { scope, nowMs } = args;
  const config = args.config ?? DEFAULT_PRIORITY_CONFIG;
  if (validatePriorityConfig(config).length > 0) {
    // A bad configuration is a programming or data error upstream; refusing is
    // safer than ranking with thresholds nobody chose.
    throw new RangeError("invalid priority configuration");
  }

  const today =
    args.anchorDay ??
    businessDayOf({ nowMs, timeZone: scope.timeZone, cutoffMinutes: scope.dayCutoffMinutes });
  const target = nextBusinessDay(today);
  const horizonEndMs = target.endMs;

  const base = {
    generatedAtIso: new Date(nowMs).toISOString(),
    timeZone: scope.timeZone,
    horizonEndIso: new Date(horizonEndMs).toISOString(),
    targetBusinessDate: target.dateKey,
    anchorBusinessDate: today.dateKey,
    config,
  };

  const canWork = scope.authority.operations;
  const canAlerts = scope.authority.industrial && scope.allowedSiteIds.length > 0;
  // `view_customers`, not the operations axis: a follow-up item carries the
  // customer's NAME, so it is governed by the permission over the customer
  // records themselves.
  const canFollowUps = scope.authority.customers;
  if (!canWork && !scope.authority.industrial && !canFollowUps) {
    return { ...base, priorities: refusedSection("FORBIDDEN", PRIORITY_REASON.forbiddenOperations) };
  }

  const client = args.client === undefined ? await db() : args.client;
  if (!client) return { ...base, priorities: refusedSection("UNAVAILABLE", PRIORITY_REASON.sourceUnavailable) };

  const organizationId = scope.organizationId;
  const horizon = new Date(horizonEndMs);
  const select = { id: true, title: true, priority: true, dueDate: true, createdAt: true };

  // A refused source issues NO query.
  const [tasks, workOrders, approvals, alerts, followUps] = await Promise.all([
    canWork
      ? settle(() =>
          client.erpTask.findMany({
            where: { organizationId, deletedAt: null, status: { notIn: [...CLOSED_TASK] }, dueDate: { lt: horizon } },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            take: CANDIDATE_LIMIT,
            select,
          }),
        )
      : null,
    canWork
      ? settle(() =>
          client.erpWorkOrder.findMany({
            where: {
              organizationId,
              deletedAt: null,
              status: { notIn: [...CLOSED_WORK_ORDER] },
              dueDate: { lt: horizon },
            },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            take: CANDIDATE_LIMIT,
            select,
          }),
        )
      : null,
    canWork
      ? settle(() =>
          client.erpApprovalRequest.findMany({
            // Only approvals already late enough to fire a rule are read.
            where: {
              organizationId,
              status: "PENDING",
              createdAt: { lte: new Date(nowMs - config.approvalStaleDays * DAY_MS) },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: CANDIDATE_LIMIT,
            select: { id: true, title: true, createdAt: true },
          }),
        )
      : null,
    canAlerts
      ? settle(() =>
          client.assetAlert.findMany({
            where: {
              organizationId,
              dismissed: false,
              resolvedAt: null,
              severity: { in: ["CRITICAL", "HIGH"] },
              createdAt: { lte: new Date(nowMs - config.alertAgeHours * HOUR_MS) },
              // Site scope narrows the QUERY, exactly as on the management view.
              asset: { organizationId, siteId: { in: [...scope.allowedSiteIds] } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: CANDIDATE_LIMIT,
            select: { id: true, title: true, severity: true, createdAt: true },
          }),
        )
      : null,
    canFollowUps
      ? settle(() =>
          client.party.findMany({
            // Only customers with a promised date before the horizon are read,
            // and the (organizationId, nextActionAt) index serves exactly this.
            where: {
              organizationId,
              kind: "CUSTOMER",
              archivedAt: null,
              nextActionAt: { not: null, lt: horizon },
            },
            orderBy: [{ nextActionAt: "asc" }, { id: "asc" }],
            take: CANDIDATE_LIMIT,
            select: { id: true, displayName: true, nextActionAt: true, createdAt: true },
          }),
        )
      : null,
  ]);

  // A source that failed is UNAVAILABLE for the whole list: ranking without it
  // would present a partial picture as the full one.
  for (const r of [tasks, workOrders, approvals, alerts, followUps]) {
    if (r !== null && !r.ok) {
      return { ...base, priorities: refusedSection("UNAVAILABLE", PRIORITY_REASON.sourceUnavailable) };
    }
  }

  const rows = (r: typeof tasks): unknown[] => (r && r.ok ? r.value : []);
  const candidates: Candidate[] = [
    ...rows(tasks).map(r => toWork("TASK", r)),
    ...rows(workOrders).map(r => toWork("WORK_ORDER", r)),
    ...rows(approvals).map(raw => {
      const r = rec(raw);
      const id = str(r.id);
      const title = str(r.title);
      const createdMs = ms(r.createdAt);
      return id && title && createdMs !== null ? ({ kind: "APPROVAL", id, title, createdMs } as const) : null;
    }),
    ...rows(alerts).map(raw => {
      const r = rec(raw);
      const id = str(r.id);
      const title = str(r.title);
      const createdMs = ms(r.createdAt);
      const severity = str(r.severity);
      return id && title && createdMs !== null && (severity === "CRITICAL" || severity === "HIGH")
        ? ({ kind: "ALERT", id, title, severity, createdMs } as const)
        : null;
    }),
    ...rows(followUps).map(raw => {
      const r = rec(raw);
      const id = str(r.id);
      const title = str(r.displayName);
      const dueMs = ms(r.nextActionAt);
      const createdMs = ms(r.createdAt);
      // A customer with no promised date is not a follow-up at all; the query
      // already excludes them, and a row that cannot be read fully is skipped
      // rather than given a date it does not have.
      return id && title && dueMs !== null && createdMs !== null
        ? ({ kind: "CUSTOMER_FOLLOW_UP", id, title, dueMs, createdMs } as const)
        : null;
    }),
  ].filter((c): c is Candidate => c !== null);

  const classified = candidates
    .map(c => classify(c, { nowMs, horizonEndMs, config }))
    .filter((i): i is PriorityItem => i !== null)
    .sort(compareItems);

  const tierCounts: Record<PriorityTier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const item of classified) tierCounts[item.tier] += 1;

  const note = (source: PrioritySource, r: typeof tasks, refusedKey: string): SourceNote =>
    r === null
      ? { source, excludedReasonKey: refusedKey, truncated: false }
      : { source, excludedReasonKey: null, truncated: rows(r).length >= CANDIDATE_LIMIT };

  const sources: SourceNote[] = [
    note("tasks", tasks, PRIORITY_REASON.forbiddenOperations),
    note("workOrders", workOrders, PRIORITY_REASON.forbiddenOperations),
    note("approvals", approvals, PRIORITY_REASON.forbiddenOperations),
    note(
      "alerts",
      alerts,
      scope.authority.industrial ? PRIORITY_REASON.noSites : PRIORITY_REASON.forbiddenIndustrial,
    ),
    note("customerFollowUps", followUps, PRIORITY_REASON.forbiddenCustomers),
  ];

  if (classified.length === 0) {
    // EMPTY carries no data by contract, so the per-source exclusions would be
    // lost; when any source was excluded the reader must still learn that the
    // list is empty only for what they may see.
    const anyExcluded = sources.some(s => s.excludedReasonKey !== null);
    if (!anyExcluded) return { ...base, priorities: emptySection(PRIORITY_REASON.noRows) };
  }

  return {
    ...base,
    priorities: operationalSection<PriorityList>({
      items: classified.slice(0, config.maxItems),
      tierCounts,
      totalPriorities: classified.length,
      listTruncated: classified.length > config.maxItems,
      sources,
    }),
  };
}

export const __test = { split, HOUR_MS, DAY_MS };
