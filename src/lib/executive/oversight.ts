/**
 * Executive Management Center — financial activity and approval oversight.
 *
 * WHAT THIS IS
 * ------------
 * The part of brief §4 ("oversight of financial activity") that the product's
 * existing records can genuinely answer, plus the approval queue a manager
 * needs in order to see WHOSE decision is blocking work:
 *
 *   · cost recorded against projects in the period, PER CURRENCY;
 *   · the same, broken down by category;
 *   · who recorded it (the accountant-activity question, answered from the
 *     `createdBy` column of the cost rows rather than from logins or clicks);
 *   · projects whose recorded cost exceeds their budget;
 *   · approvals awaiting a decision, by the approver role of the step that is
 *     currently blocking each one, and by how long they have waited;
 *   · approvals decided in the period, and by whom.
 *
 * WHAT THIS REFUSES TO DO
 * -----------------------
 *   · It never sums money across currencies. There is no exchange-rate model
 *     anywhere in this product and `ErpProjectCost.currency` is a free string,
 *     so a single "total cost" would add dollars to rials. Every amount is
 *     reported inside its own currency and the shape carries
 *     `exchangeRateAvailable: false` so the UI must say why.
 *   · It is not accounting. There is no ledger, no receivable, no payable and no
 *     reconciliation entity; `ledgerAvailable: false` states it.
 *   · It never infers who an unattributed entry belongs to. A cost row with no
 *     `createdBy` is counted as unattributed, which is a data-quality fact the
 *     manager should see, not something to paper over.
 *   · It never widens a scope. Every query carries the server-resolved
 *     `organizationId`; legacy rows whose `organizationId` is NULL are excluded
 *     by that same equality, so they can never leak into a tenant's figures.
 *
 * AXES
 * ----
 * Money is `view_erp_compensation` (the financial axis) — the same permission the
 * ERP data layer already uses for budget and actual cost. Approvals carry no
 * amount, so they sit on `view_erp` (the operations axis). The two sections are
 * resolved and refused independently.
 *
 * QUERY BUDGET
 * ------------
 * cost activity  2 currency group-bys + 1 category group-by + 2 recorder
 *                group-bys + 1 project count + 1 bounded project list
 * approvals      1 count + 1 bounded list (one nested step each) + 2 group-bys
 * names          1 user lookup for every id both sections need, together
 * Every query is organization-scoped and every list is bounded by `take`; no
 * query is issued per row of another result.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  computeDelta,
  emptySection,
  operationalSection,
  refusedSection,
  type ExecutiveAuthority,
  type ExecutiveScope,
  type ExecutiveSection,
  type MetricDelta,
  type PeriodDescriptor,
} from "./contract";
import { resolveRange, type ExecutiveRange, type ResolvedRange } from "./period";

/* ── i18n reason keys ──────────────────────────────────────────────────────── */

export const OVERSIGHT_REASON = {
  forbiddenFinancial: "executive.reasons.forbiddenFinancial",
  forbiddenOperations: "executive.reasons.forbiddenOperations",
  noRows: "executive.reasons.noRows",
  sourceUnavailable: "executive.reasons.sourceUnavailable",
} as const;

/* ── Bounds ────────────────────────────────────────────────────────────────── */

/** Currencies are few; this cap exists so a corrupt column cannot explode a page. */
export const CURRENCY_LIMIT = 20;
export const CATEGORY_LIMIT = 20;
export const RECORDER_LIMIT = 10;
export const DECIDER_LIMIT = 10;
export const OVER_BUDGET_LIMIT = 10;
/** Projects with a budget, read to find the over-budget ones. */
export const PROJECT_SAMPLE_LIMIT = 500;
/** Oldest pending approvals read to break the queue down by role and age. */
export const PENDING_SAMPLE_LIMIT = 200;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/* ── Published shapes ──────────────────────────────────────────────────────── */

export interface CurrencyTotal {
  /** As stored. Never normalised, because normalising is a conversion. */
  readonly currency: string;
  readonly amount: number;
  readonly entries: number;
  readonly baselineAmount: number | null;
  readonly delta: MetricDelta;
}

export interface CategoryTotal {
  readonly currency: string;
  /** `null` when the cost row carries no category. */
  readonly category: string | null;
  readonly amount: number;
  readonly entries: number;
}

export interface CurrencyAmount {
  readonly currency: string;
  readonly amount: number;
}

export interface RecorderActivity {
  readonly userId: string;
  /** `null` when the id no longer resolves to a user — shown, never guessed. */
  readonly displayName: string | null;
  readonly entries: number;
  readonly amounts: readonly CurrencyAmount[];
}

export interface ProjectBudgetLine {
  readonly projectId: string;
  readonly name: string;
  readonly budget: number;
  readonly actualCost: number;
  /** `actualCost - budget`; positive means over budget. */
  readonly overrun: number;
}

export interface CostActivity {
  /** Cost rows are windowed on their own `date` — when the cost was incurred. */
  readonly byCurrency: readonly CurrencyTotal[];
  readonly currenciesTruncated: boolean;
  readonly byCategory: readonly CategoryTotal[];
  readonly categoriesTruncated: boolean;
  /** Recording activity is windowed on `createdAt` — when it was entered. */
  readonly recorders: readonly RecorderActivity[];
  readonly recordersTruncated: boolean;
  /** Entries recorded in the period with no `createdBy` at all. */
  readonly unattributedEntries: number;
  readonly overBudget: readonly ProjectBudgetLine[];
  /** Over-budget projects among those read; see `projectsSampled`. */
  readonly overBudgetCount: number;
  readonly projectsWithBudget: number;
  readonly projectsSampled: number;
  /** True when more projects carry a budget than were read. */
  readonly projectsTruncated: boolean;
  /** Stated gap: no exchange-rate model exists, so currencies are never summed. */
  readonly exchangeRateAvailable: false;
  /** Stated gap: no ledger exists, so this is cost oversight, not accounting. */
  readonly ledgerAvailable: false;
}

export interface AgeBuckets {
  readonly underOneDay: number;
  readonly oneToThreeDays: number;
  readonly threeToSevenDays: number;
  readonly overSevenDays: number;
}

export interface PendingByRole {
  /** The approver role of the lowest-order pending step; `null` when none exists. */
  readonly approverRole: string | null;
  readonly total: number;
  readonly age: AgeBuckets;
}

export interface DeciderActivity {
  readonly userId: string;
  readonly displayName: string | null;
  readonly approved: number;
  readonly rejected: number;
}

export interface ApprovalOversight {
  /** Exact, from a count — not from the sample below. */
  readonly pendingTotal: number;
  readonly pendingByRole: readonly PendingByRole[];
  /** How many pending requests the role and age breakdown covers. */
  readonly pendingSampled: number;
  /** True when the breakdown covers only the oldest `pendingSampled`. */
  readonly pendingTruncated: boolean;
  readonly oldestPendingIso: string | null;
  readonly decidedApproved: number;
  readonly decidedRejected: number;
  readonly decidedCancelled: number;
  readonly deciders: readonly DeciderActivity[];
  readonly decidersTruncated: boolean;
  /** Decisions in the period with no `decidedBy`. */
  readonly unattributedDecisions: number;
}

export interface FinancialOversight {
  readonly generatedAtIso: string;
  readonly range: ExecutiveRange;
  readonly period: { readonly current: PeriodDescriptor; readonly baseline: PeriodDescriptor };
  readonly timeZone: string;
  readonly authority: ExecutiveAuthority;
  readonly sections: {
    readonly costActivity: ExecutiveSection<CostActivity>;
    readonly approvals: ExecutiveSection<ApprovalOversight>;
  };
}

/* ── Database seam ─────────────────────────────────────────────────────────── */

/**
 * The narrow surface this module reads. Declared structurally so the tests can
 * hand in a fake that records every `where` — which is how tenant scoping is
 * asserted on the QUERY, not inferred from the output.
 */
interface GroupByDelegate {
  groupBy(args: unknown): Promise<unknown[]>;
}
interface CountDelegate {
  count(args: unknown): Promise<number>;
}
interface FindManyDelegate {
  findMany(args: unknown): Promise<unknown[]>;
}

export interface OversightDb {
  erpProjectCost: GroupByDelegate & CountDelegate;
  erpProject: CountDelegate & FindManyDelegate;
  erpApprovalRequest: CountDelegate & FindManyDelegate & GroupByDelegate;
  user: FindManyDelegate;
}

async function db(): Promise<OversightDb | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const d = prisma as unknown as OversightDb;
  if (!d.erpProjectCost || !d.erpProject || !d.erpApprovalRequest || !d.user) return null;
  return d;
}

/* ── Row parsing ───────────────────────────────────────────────────────────── */

/*
 * Prisma group-by rows are typed loosely here on purpose: the seam above is
 * structural, so each row is read defensively. A field of the wrong shape is
 * treated as absent rather than coerced — a NaN amount must not become 0.
 */

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Prisma returns Decimal-like objects for some numeric aggregates.
  if (value !== null && typeof value === "object" && "toNumber" in value) {
    const n = (value as { toNumber: () => unknown }).toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function sumAmount(row: unknown): number {
  return num(record(record(row)._sum).amount) ?? 0;
}

/** `_count: { field: true }` rows carry the count under the field's name. */
function countField(row: unknown, field: string): number {
  return num(record(record(row)._count)[field]) ?? 0;
}

function countAll(row: unknown): number {
  const c = record(row)._count;
  if (typeof c === "number") return c;
  return num(record(c)._all) ?? 0;
}

/* ── Cost activity ─────────────────────────────────────────────────────────── */

function inWindow(fromMs: number, toMs: number) {
  return { gte: new Date(fromMs), lt: new Date(toMs) };
}

async function costActivitySection(args: {
  scope: ExecutiveScope;
  range: ResolvedRange;
  client: OversightDb;
}): Promise<{ userIds: string[]; build: (names: Map<string, string>) => ExecutiveSection<CostActivity> }> {
  const { scope, range, client } = args;
  const organizationId = scope.organizationId;

  const currentDate = inWindow(range.currentStartMs, range.currentEndMs);
  const baselineDate = inWindow(range.baselineStartMs, range.baselineEndMs);

  const recordedWindow = inWindow(range.currentStartMs, range.currentEndMs);

  const [
    currentByCurrency,
    baselineByCurrency,
    byCategoryRows,
    recorderRows,
    unattributedEntries,
    projectsWithBudget,
    projectRows,
  ] = await Promise.all([
      client.erpProjectCost.groupBy({
        by: ["currency"],
        where: { organizationId, date: currentDate },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { currency: "asc" },
        take: CURRENCY_LIMIT + 1,
      }),
      client.erpProjectCost.groupBy({
        by: ["currency"],
        where: { organizationId, date: baselineDate },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { currency: "asc" },
        take: CURRENCY_LIMIT + 1,
      }),
      client.erpProjectCost.groupBy({
        by: ["currency", "category"],
        where: { organizationId, date: currentDate },
        _sum: { amount: true },
        _count: { _all: true },
        // Grouped by currency FIRST: ranking categories by amount across
        // currencies would compare rials with dollars, which is the very sum
        // this module refuses to make.
        orderBy: [{ currency: "asc" }, { _sum: { amount: "desc" } }],
        take: CATEGORY_LIMIT + 1,
      }),
      // WHO RECORDED, windowed on when the entry was MADE. NULL is excluded
      // here and counted exactly below, so it can neither take a slot from a
      // real recorder nor be cut off by the limit. One extra row is read so
      // truncation is detected rather than assumed.
      client.erpProjectCost.groupBy({
        by: ["createdBy"],
        where: { organizationId, createdBy: { not: null }, createdAt: recordedWindow },
        _count: { createdBy: true },
        orderBy: { _count: { createdBy: "desc" } },
        take: RECORDER_LIMIT + 1,
      }),
      client.erpProjectCost.count({
        where: { organizationId, createdBy: null, createdAt: recordedWindow },
      }),
      client.erpProject.count({
        where: { organizationId, deletedAt: null, budget: { not: null } },
      }),
      client.erpProject.findMany({
        where: { organizationId, deletedAt: null, budget: { not: null } },
        select: { id: true, name: true, budget: true, actualCost: true },
        orderBy: { createdAt: "desc" },
        take: PROJECT_SAMPLE_LIMIT,
      }),
    ]);

  // Currencies
  const baselineMap = new Map<string, number>();
  for (const row of baselineByCurrency) {
    const currency = str(record(row).currency);
    if (currency !== null) baselineMap.set(currency, sumAmount(row));
  }
  const currenciesTruncated = currentByCurrency.length > CURRENCY_LIMIT;
  const byCurrency: CurrencyTotal[] = currentByCurrency
    .slice(0, CURRENCY_LIMIT)
    .map(row => {
      const currency = str(record(row).currency) ?? "";
      const amount = sumAmount(row);
      // A currency with no row in the baseline had zero recorded cost there —
      // the source answered, and the answer was "nothing". That is 0, not null.
      const baselineAmount = baselineMap.get(currency) ?? 0;
      return {
        currency,
        amount,
        entries: countAll(row),
        baselineAmount,
        delta: computeDelta({ current: amount, previous: baselineAmount, baselineComplete: range.baseline.complete }),
      };
    })
    .filter(c => c.currency.length > 0);

  // Categories
  const categoriesTruncated = byCategoryRows.length > CATEGORY_LIMIT;
  const byCategory: CategoryTotal[] = byCategoryRows.slice(0, CATEGORY_LIMIT).map(row => ({
    currency: str(record(row).currency) ?? "",
    category: str(record(row).category),
    amount: sumAmount(row),
    entries: countAll(row),
  }));

  // Recorders
  const attributed: { userId: string; entries: number }[] = [];
  for (const row of recorderRows) {
    const userId = str(record(row).createdBy);
    if (userId === null) continue;
    attributed.push({ userId, entries: countField(row, "createdBy") });
  }
  const recordersTruncated = attributed.length > RECORDER_LIMIT;
  const topRecorders = attributed.slice(0, RECORDER_LIMIT);
  const recorderIds = topRecorders.map(r => r.userId);

  // Per-currency amounts for exactly those recorders: one query, bounded by the
  // id list, so no per-recorder lookup.
  const recorderAmountRows = recorderIds.length
    ? await client.erpProjectCost.groupBy({
        by: ["createdBy", "currency"],
        where: {
          organizationId,
          createdBy: { in: recorderIds },
          createdAt: recordedWindow,
        },
        _sum: { amount: true },
        orderBy: { createdBy: "asc" },
        take: recorderIds.length * CURRENCY_LIMIT,
      })
    : [];
  const amountsByRecorder = new Map<string, CurrencyAmount[]>();
  for (const row of recorderAmountRows) {
    const userId = str(record(row).createdBy);
    const currency = str(record(row).currency);
    if (userId === null || currency === null) continue;
    const list = amountsByRecorder.get(userId) ?? [];
    list.push({ currency, amount: sumAmount(row) });
    amountsByRecorder.set(userId, list);
  }

  // Projects over budget
  const lines: ProjectBudgetLine[] = [];
  for (const raw of projectRows) {
    const row = record(raw);
    const projectId = str(row.id);
    const name = str(row.name);
    const budget = num(row.budget);
    const actualCost = num(row.actualCost);
    // A project whose budget or cost cannot be read is skipped, not treated as
    // on budget: "unknown" must not be counted as "fine".
    if (projectId === null || name === null || budget === null || actualCost === null) continue;
    if (actualCost > budget) lines.push({ projectId, name, budget, actualCost, overrun: actualCost - budget });
  }
  lines.sort((a, b) => b.overrun - a.overrun);

  const projectsSampled = projectRows.length;

  const build = (names: Map<string, string>): ExecutiveSection<CostActivity> => {
    const recorders: RecorderActivity[] = topRecorders.map(r => ({
      userId: r.userId,
      displayName: names.get(r.userId) ?? null,
      entries: r.entries,
      amounts: (amountsByRecorder.get(r.userId) ?? []).sort((a, b) => a.currency.localeCompare(b.currency)),
    }));

    const nothingAtAll =
      byCurrency.length === 0 && recorders.length === 0 && unattributedEntries === 0 && projectsWithBudget === 0;
    if (nothingAtAll) return emptySection(OVERSIGHT_REASON.noRows);

    return operationalSection<CostActivity>({
      byCurrency,
      currenciesTruncated,
      byCategory,
      categoriesTruncated,
      recorders,
      recordersTruncated,
      unattributedEntries,
      overBudget: lines.slice(0, OVER_BUDGET_LIMIT),
      overBudgetCount: lines.length,
      projectsWithBudget,
      projectsSampled,
      projectsTruncated: projectsWithBudget > projectsSampled,
      exchangeRateAvailable: false,
      ledgerAvailable: false,
    });
  };

  return { userIds: recorderIds, build };
}

/* ── Approvals ─────────────────────────────────────────────────────────────── */

function ageBucket(waitedMs: number): keyof AgeBuckets {
  if (waitedMs < DAY_MS) return "underOneDay";
  if (waitedMs < 3 * DAY_MS) return "oneToThreeDays";
  if (waitedMs < 7 * DAY_MS) return "threeToSevenDays";
  return "overSevenDays";
}

function emptyBuckets(): { -readonly [K in keyof AgeBuckets]: number } {
  return { underOneDay: 0, oneToThreeDays: 0, threeToSevenDays: 0, overSevenDays: 0 };
}

async function approvalsSection(args: {
  scope: ExecutiveScope;
  range: ResolvedRange;
  nowMs: number;
  client: OversightDb;
}): Promise<{ userIds: string[]; build: (names: Map<string, string>) => ExecutiveSection<ApprovalOversight> }> {
  const { scope, range, nowMs, client } = args;
  const organizationId = scope.organizationId;
  const decidedWindow = inWindow(range.currentStartMs, range.currentEndMs);

  const [pendingTotal, pendingRows, decidedByStatus, topDeciderRows, unattributedDecisions] = await Promise.all([
    client.erpApprovalRequest.count({ where: { organizationId, status: "PENDING" } }),
    // OLDEST FIRST: when the queue is longer than the sample, the breakdown
    // covers the requests that have waited longest — the ones a manager most
    // needs to see — and says it is a sample.
    client.erpApprovalRequest.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: PENDING_SAMPLE_LIMIT,
      select: {
        createdAt: true,
        steps: {
          where: { status: "PENDING" },
          orderBy: { order: "asc" },
          take: 1,
          select: { approverRole: true },
        },
      },
    }),
    client.erpApprovalRequest.groupBy({
      by: ["status"],
      where: { organizationId, decidedAt: decidedWindow },
      _count: { _all: true },
    }),
    // Ranked by VOLUME, NULL excluded and counted exactly on its own - the
    // same shape as the recorders, for the same reasons.
    client.erpApprovalRequest.groupBy({
      by: ["decidedBy"],
      where: { organizationId, decidedBy: { not: null }, decidedAt: decidedWindow },
      _count: { decidedBy: true },
      orderBy: { _count: { decidedBy: "desc" } },
      take: DECIDER_LIMIT + 1,
    }),
    client.erpApprovalRequest.count({
      where: { organizationId, decidedBy: null, decidedAt: decidedWindow },
    }),
  ]);

  // Pending, by the role of the step that is blocking each request.
  const byRole = new Map<string, { total: number; age: ReturnType<typeof emptyBuckets> }>();
  let oldestMs: number | null = null;
  for (const raw of pendingRows) {
    const row = record(raw);
    const created = row.createdAt instanceof Date ? row.createdAt.getTime() : null;
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const role = steps.length > 0 ? str(record(steps[0]).approverRole) : null;
    // The NULL role is its own bucket: a pending request with no pending step
    // is blocked on nobody, which is itself a workflow fault worth seeing.
    const key = role ?? "\u0000none";
    const entry = byRole.get(key) ?? { total: 0, age: emptyBuckets() };
    entry.total += 1;
    if (created !== null) {
      entry.age[ageBucket(Math.max(0, nowMs - created))] += 1;
      if (oldestMs === null || created < oldestMs) oldestMs = created;
    }
    byRole.set(key, entry);
  }
  const pendingByRole: PendingByRole[] = [...byRole.entries()]
    .map(([key, v]) => ({ approverRole: key === "\u0000none" ? null : key, total: v.total, age: v.age }))
    .sort((a, b) => b.total - a.total);

  // Decided, by outcome.
  let decidedApproved = 0;
  let decidedRejected = 0;
  let decidedCancelled = 0;
  for (const row of decidedByStatus) {
    const status = str(record(row).status);
    const n = countAll(row);
    if (status === "APPROVED") decidedApproved += n;
    else if (status === "REJECTED") decidedRejected += n;
    else if (status === "CANCELLED") decidedCancelled += n;
  }

  // Decided, by whom: the top deciders by volume, then the outcome split for
  // exactly those ids in one bounded query.
  const rankedIds: string[] = [];
  for (const row of topDeciderRows) {
    const userId = str(record(row).decidedBy);
    if (userId !== null) rankedIds.push(userId);
  }
  const decidersTruncated = rankedIds.length > DECIDER_LIMIT;
  const deciderIds = rankedIds.slice(0, DECIDER_LIMIT);

  const outcomeRows = deciderIds.length
    ? await client.erpApprovalRequest.groupBy({
        by: ["decidedBy", "status"],
        where: { organizationId, decidedBy: { in: deciderIds }, decidedAt: decidedWindow },
        _count: { _all: true },
        orderBy: { decidedBy: "asc" },
        take: deciderIds.length * 4,
      })
    : [];
  const perDecider = new Map<string, { approved: number; rejected: number }>();
  for (const id of deciderIds) perDecider.set(id, { approved: 0, rejected: 0 });
  for (const row of outcomeRows) {
    const userId = str(record(row).decidedBy);
    const status = str(record(row).status);
    const entry = userId === null ? undefined : perDecider.get(userId);
    if (!entry) continue;
    if (status === "APPROVED") entry.approved += countAll(row);
    else if (status === "REJECTED") entry.rejected += countAll(row);
  }
  // Order is the database's volume ranking, preserved.
  const topDeciders = deciderIds.map(userId => ({
    userId,
    ...(perDecider.get(userId) ?? { approved: 0, rejected: 0 }),
  }));

  const build = (names: Map<string, string>): ExecutiveSection<ApprovalOversight> => {
    const nothingAtAll = pendingTotal === 0 && decidedApproved + decidedRejected + decidedCancelled === 0;
    if (nothingAtAll) return emptySection(OVERSIGHT_REASON.noRows);
    return operationalSection<ApprovalOversight>({
      pendingTotal,
      pendingByRole,
      pendingSampled: pendingRows.length,
      pendingTruncated: pendingTotal > pendingRows.length,
      oldestPendingIso: oldestMs === null ? null : new Date(oldestMs).toISOString(),
      decidedApproved,
      decidedRejected,
      decidedCancelled,
      deciders: topDeciders.map(d => ({
        userId: d.userId,
        displayName: names.get(d.userId) ?? null,
        approved: d.approved,
        rejected: d.rejected,
      })),
      decidersTruncated,
      unattributedDecisions,
    });
  };

  return { userIds: topDeciders.map(d => d.userId), build };
}

/* ── Names ─────────────────────────────────────────────────────────────────── */

/**
 * ONE lookup for every id both sections need. Only the display name is read —
 * never the email — because the question being answered is "who", and an email
 * address is more than that question needs.
 */
async function resolveNames(client: OversightDb, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await client.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
    take: unique.length,
  });
  const names = new Map<string, string>();
  for (const raw of rows) {
    const row = record(raw);
    const id = str(row.id);
    const name = str(row.name);
    if (id !== null && name !== null) names.set(id, name);
  }
  return names;
}

/* ── Assembly ──────────────────────────────────────────────────────────────── */

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    // The driver message never leaves this module.
    return { ok: false };
  }
}

export async function buildFinancialOversight(args: {
  scope: ExecutiveScope;
  range: ExecutiveRange;
  nowMs: number;
  /** Test seam. Production code leaves it out and reads the shared client. */
  client?: OversightDb | null;
}): Promise<FinancialOversight> {
  const { scope, range: rangeKey, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();
  const range = resolveRange({
    range: rangeKey,
    nowMs,
    timeZone: scope.timeZone,
    cutoffMinutes: scope.dayCutoffMinutes,
  });

  const base = {
    generatedAtIso: nowIso,
    range: rangeKey,
    period: { current: range.current, baseline: range.baseline },
    timeZone: scope.timeZone,
    authority: scope.authority,
  };

  const client = args.client === undefined ? await db() : args.client;
  if (!client) {
    const unavailable = OVERSIGHT_REASON.sourceUnavailable;
    return {
      ...base,
      sections: {
        costActivity: scope.authority.financial
          ? refusedSection("UNAVAILABLE", unavailable)
          : refusedSection("FORBIDDEN", OVERSIGHT_REASON.forbiddenFinancial),
        approvals: scope.authority.operations
          ? refusedSection("UNAVAILABLE", unavailable)
          : refusedSection("FORBIDDEN", OVERSIGHT_REASON.forbiddenOperations),
      },
    };
  }

  // A refused axis issues NO query at all: the permission is checked before the
  // database is touched, not applied to the result afterwards.
  const [cost, approvals] = await Promise.all([
    scope.authority.financial ? settle(() => costActivitySection({ scope, range, client })) : Promise.resolve(null),
    scope.authority.operations ? settle(() => approvalsSection({ scope, range, nowMs, client })) : Promise.resolve(null),
  ]);

  const ids = [
    ...(cost && cost.ok ? cost.value.userIds : []),
    ...(approvals && approvals.ok ? approvals.value.userIds : []),
  ];
  // A failed name lookup degrades to "name unavailable", never to a failed
  // section: the figures are still correct without the label.
  const namesResult = ids.length ? await settle(() => resolveNames(client, ids)) : { ok: true as const, value: new Map<string, string>() };
  const names = namesResult.ok ? namesResult.value : new Map<string, string>();

  const costActivity: ExecutiveSection<CostActivity> =
    cost === null
      ? refusedSection("FORBIDDEN", OVERSIGHT_REASON.forbiddenFinancial)
      : cost.ok
        ? cost.value.build(names)
        : refusedSection("UNAVAILABLE", OVERSIGHT_REASON.sourceUnavailable);

  const approvalsSectionResult: ExecutiveSection<ApprovalOversight> =
    approvals === null
      ? refusedSection("FORBIDDEN", OVERSIGHT_REASON.forbiddenOperations)
      : approvals.ok
        ? approvals.value.build(names)
        : refusedSection("UNAVAILABLE", OVERSIGHT_REASON.sourceUnavailable);

  return { ...base, sections: { costActivity, approvals: approvalsSectionResult } };
}

export const __test = { ageBucket, HOUR_MS, DAY_MS };
