/**
 * Executive Management Center — the summary aggregation.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *   · It never invents a number. Every value is a count, a sum or a timestamp
 *     read from a real tenant row, or it is `null` with a stated reason.
 *   · It never reports a trend it cannot define. Point-in-time counts (how many
 *     approvals are pending *right now*) carry
 *     `INCOMPARABLE / NO_BASELINE`, because the schema stores no historical
 *     snapshot of them and a comparison would have to be fabricated. Only
 *     genuinely windowed metrics — things that happened *between two instants* —
 *     carry a delta.
 *   · It never lets one failure blank the page. Each section is resolved
 *     independently and a thrown error becomes `UNAVAILABLE` for that section
 *     alone (brief §10: "the failure of one widget must not break the whole
 *     dashboard").
 *   · It never widens a scope. Industrial reads are bounded by
 *     `allowedSiteIds` and fail closed on an empty list; money figures appear
 *     only on the financial axis; nothing is read from the client.
 *
 * QUERY BUDGET
 * ------------
 * One request issues at most:
 *   operations  1 ERP overview (9 + 5 bounded queries, pre-existing) + 4 counts
 *   financial   0 additional (served from the same ERP overview)
 *   industrial  1 gateway list (bounded) + 1 org telemetry probe + 3 counts
 * Every count is org-scoped, every list is bounded by `take`, and nothing is
 * fetched per row of another result, so there is no N+1 path here.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getErpOverview, type ErpOverviewView } from "@/lib/erp/operations";
// TYPE-ONLY. A value import of `@/lib/erp/tenant` would pull the request guards
// and, through them, the session chain into this module graph.
import type { ErpScope } from "@/lib/erp/tenant";
import {
  classifyFreshness,
  computeDelta,
  emptySection,
  isTrustworthy,
  operationalSection,
  refusedSection,
  type ExecutiveMetric,
  type ExecutiveSection,
  type MetricProvenance,
  type PeriodDescriptor,
  type SourceFreshness,
} from "./contract";
import { resolveRange, type ExecutiveRange, type ResolvedRange } from "./period";
import { resolveReportingZone } from "./config";
import type { ExecutiveAuthority, ExecutiveScope } from "./contract";

/* ── i18n reason keys ──────────────────────────────────────────────────────── */

export const REASON = {
  forbiddenOperations: "executive.reasons.forbiddenOperations",
  forbiddenFinancial: "executive.reasons.forbiddenFinancial",
  forbiddenIndustrial: "executive.reasons.forbiddenIndustrial",
  noSites: "executive.reasons.noSites",
  noRows: "executive.reasons.noRows",
  sourceUnavailable: "executive.reasons.sourceUnavailable",
  noLedger: "executive.reasons.noLedger",
  customersNotTenantScoped: "executive.reasons.customersNotTenantScoped",
} as const;

export const SOURCE = {
  erpProject: "executive.sources.erpProject",
  erpTask: "executive.sources.erpTask",
  erpWorkOrder: "executive.sources.erpWorkOrder",
  erpApproval: "executive.sources.erpApproval",
  erpInventory: "executive.sources.erpInventory",
  gatewayHeartbeat: "executive.sources.gatewayHeartbeat",
  telemetry: "executive.sources.telemetry",
  assetAlert: "executive.sources.assetAlert",
} as const;

/* ── Published shapes ──────────────────────────────────────────────────────── */

export interface OperationsSummary {
  readonly metrics: readonly ExecutiveMetric[];
}

export interface FinancialSummary {
  readonly metrics: readonly ExecutiveMetric[];
  /** Stated gap: the product has no general ledger, so this is not accounting. */
  readonly ledgerAvailable: false;
}

export interface SiteConnectivity {
  readonly siteId: string;
  readonly name: string;
  readonly status: string;
  readonly gatewayCount: number;
  readonly onlineGatewayCount: number;
  readonly freshness: SourceFreshness;
  readonly lastSignalIso: string | null;
  readonly ageMs: number | null;
}

export interface IndustrialSummary {
  readonly sites: readonly SiteConnectivity[];
  readonly metrics: readonly ExecutiveMetric[];
  /** Newest server-stamped telemetry arrival for the whole organization. */
  readonly telemetryFreshness: SourceFreshness;
  readonly telemetryLastSignalIso: string | null;
}

/** One thing the manager has to decide or chase. Priority is rule-based, never scored. */
export interface DecisionItem {
  readonly key: string;
  /** HIGH when the item is already breaching, MEDIUM when it is at risk. */
  readonly priority: "HIGH" | "MEDIUM";
  readonly count: number;
  /** i18n key naming the rule that produced this item — the "why". */
  readonly causeKey: string;
  readonly sourceKey: string;
  readonly detailPath: string | null;
}

export interface DataQualityNote {
  readonly key: string;
  readonly severity: "WARNING" | "INFO";
  /** Machine-readable detail for the UI; never free text. */
  readonly meta?: Readonly<Record<string, string | number>>;
}

export interface ExecutiveSummary {
  readonly generatedAtIso: string;
  readonly range: ExecutiveRange;
  readonly period: { readonly current: PeriodDescriptor; readonly baseline: PeriodDescriptor };
  readonly timeZone: string;
  readonly authority: ExecutiveAuthority;
  readonly sections: {
    readonly operations: ExecutiveSection<OperationsSummary>;
    readonly financial: ExecutiveSection<FinancialSummary>;
    readonly industrial: ExecutiveSection<IndustrialSummary>;
    readonly customers: ExecutiveSection<never>;
  };
  readonly actions: ExecutiveSection<readonly DecisionItem[]>;
  readonly dataQuality: readonly DataQualityNote[];
}

/* ── Prisma delegates, narrowed to what is used ────────────────────────────── */

type Row = Record<string, unknown>;
interface CountDelegate {
  count(args: unknown): Promise<number>;
}
interface ReadDelegate extends CountDelegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
}

interface SummaryDb {
  erpTask: CountDelegate;
  erpWorkOrder: CountDelegate;
  erpApprovalRequest: CountDelegate;
  erpProject: CountDelegate;
  industrialSite: ReadDelegate;
  industrialGateway: ReadDelegate;
  telemetryRecord: ReadDelegate;
  assetAlert: CountDelegate;
}

async function db(): Promise<SummaryDb | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const d = prisma as unknown as SummaryDb;
  // A missing delegate means the client was generated without these models;
  // that is UNAVAILABLE, never an empty dashboard.
  if (!d.erpTask || !d.industrialSite || !d.assetAlert) return null;
  return d;
}

/* ── Provenance helpers ────────────────────────────────────────────────────── */

function pointInTime(args: {
  definitionKey: string;
  sourceKey: string;
  computedAtIso: string;
  detailPath: string | null;
}): MetricProvenance {
  return {
    definitionKey: args.definitionKey,
    sourceKey: args.sourceKey,
    // A point-in-time count covers no window; saying so is the honest answer and
    // is what keeps the UI from printing a period it does not have.
    period: null,
    computedAtIso: args.computedAtIso,
    dataAsOfIso: args.computedAtIso,
    detailPath: args.detailPath,
  };
}

function windowed(args: {
  definitionKey: string;
  sourceKey: string;
  period: PeriodDescriptor;
  computedAtIso: string;
  detailPath: string | null;
}): MetricProvenance {
  return {
    definitionKey: args.definitionKey,
    sourceKey: args.sourceKey,
    period: args.period,
    computedAtIso: args.computedAtIso,
    dataAsOfIso: args.computedAtIso,
    detailPath: args.detailPath,
  };
}

/** A point-in-time count: real value, and an explicitly undefined trend. */
function pointMetric(args: {
  key: string;
  value: number | null;
  sourceKey: string;
  computedAtIso: string;
  detailPath: string | null;
}): ExecutiveMetric {
  return {
    key: args.key,
    value: args.value,
    // Not a placeholder: the schema holds no snapshot of yesterday's open count,
    // so there is no baseline to compare against and inventing one is the defect.
    delta: { kind: "INCOMPARABLE", reason: "NO_BASELINE" },
    provenance: pointInTime({
      definitionKey: `executive.definitions.${args.key}`,
      sourceKey: args.sourceKey,
      computedAtIso: args.computedAtIso,
      detailPath: args.detailPath,
    }),
  };
}

/** A windowed count with a real period-over-period comparison. */
function windowMetric(args: {
  key: string;
  current: number | null;
  baseline: number | null;
  sourceKey: string;
  range: ResolvedRange;
  computedAtIso: string;
  detailPath: string | null;
}): ExecutiveMetric {
  return {
    key: args.key,
    value: args.current,
    delta: computeDelta({
      current: args.current,
      previous: args.baseline,
      baselineComplete: args.range.baseline.complete,
    }),
    provenance: windowed({
      definitionKey: `executive.definitions.${args.key}`,
      sourceKey: args.sourceKey,
      period: args.range.current,
      computedAtIso: args.computedAtIso,
      detailPath: args.detailPath,
    }),
  };
}

/* ── Sections ──────────────────────────────────────────────────────────────── */

const OPEN_TASK_STATUSES_EXCLUDED = ["DONE", "CANCELLED"] as const;

async function operationsSection(args: {
  scope: ExecutiveScope;
  range: ResolvedRange;
  nowIso: string;
  overview: ErpOverviewView | null;
  client: SummaryDb;
}): Promise<ExecutiveSection<OperationsSummary>> {
  const { scope, range, nowIso, overview, client } = args;
  const organizationId = scope.organizationId;
  const live = { organizationId, deletedAt: null };

  if (overview === null) return emptySection(REASON.noRows);

  // Windowed counts. These are the only metrics that can carry a trend, because
  // each one counts events that occurred BETWEEN two instants.
  const inWindow = (from: number, to: number) => ({ gte: new Date(from), lt: new Date(to) });

  const [tasksDoneNow, tasksDoneBefore, approvalsDecidedNow, approvalsDecidedBefore] = await Promise.all([
    client.erpTask.count({ where: { ...live, completedAt: inWindow(range.currentStartMs, range.currentEndMs) } }),
    client.erpTask.count({ where: { ...live, completedAt: inWindow(range.baselineStartMs, range.baselineEndMs) } }),
    client.erpApprovalRequest.count({
      where: { organizationId, decidedAt: inWindow(range.currentStartMs, range.currentEndMs) },
    }),
    client.erpApprovalRequest.count({
      where: { organizationId, decidedAt: inWindow(range.baselineStartMs, range.baselineEndMs) },
    }),
  ]);

  const metrics: ExecutiveMetric[] = [
    pointMetric({
      key: "activeProjects",
      value: overview.activeProjects,
      sourceKey: SOURCE.erpProject,
      computedAtIso: nowIso,
      detailPath: "erp/projects?status=ACTIVE",
    }),
    pointMetric({
      key: "overdueTasks",
      value: overview.overdueTasks,
      sourceKey: SOURCE.erpTask,
      computedAtIso: nowIso,
      detailPath: "erp/tasks?overdue=1",
    }),
    pointMetric({
      key: "openWorkOrders",
      value: overview.openWorkOrders,
      sourceKey: SOURCE.erpWorkOrder,
      computedAtIso: nowIso,
      detailPath: "erp/work-orders?status=OPEN",
    }),
    pointMetric({
      key: "pendingApprovals",
      value: overview.pendingApprovals,
      sourceKey: SOURCE.erpApproval,
      computedAtIso: nowIso,
      detailPath: "erp/approvals?status=PENDING",
    }),
    pointMetric({
      key: "inventoryWarnings",
      value: overview.inventoryWarnings,
      sourceKey: SOURCE.erpInventory,
      computedAtIso: nowIso,
      detailPath: "erp/inventory",
    }),
    windowMetric({
      key: "tasksCompleted",
      current: tasksDoneNow,
      baseline: tasksDoneBefore,
      sourceKey: SOURCE.erpTask,
      range,
      computedAtIso: nowIso,
      detailPath: "erp/tasks?status=DONE",
    }),
    windowMetric({
      key: "approvalsDecided",
      current: approvalsDecidedNow,
      baseline: approvalsDecidedBefore,
      sourceKey: SOURCE.erpApproval,
      range,
      computedAtIso: nowIso,
      detailPath: "erp/approvals",
    }),
  ];

  return operationalSection({ metrics });
}

function financialSection(args: {
  scope: ExecutiveScope;
  nowIso: string;
  overview: ErpOverviewView | null;
}): ExecutiveSection<FinancialSummary> {
  const { scope, nowIso, overview } = args;

  if (!scope.authority.financial) {
    return refusedSection("FORBIDDEN", REASON.forbiddenFinancial);
  }
  if (overview === null) return emptySection(REASON.noRows);

  // `financialsVisible` is the ERP layer's own answer to the same permission.
  // If the two ever disagree the money figures are withheld, not reconciled.
  if (!overview.financialsVisible) {
    return refusedSection("FORBIDDEN", REASON.forbiddenFinancial);
  }

  const budget = overview.totalBudget;
  const actual = overview.totalActualCost;

  const metrics: ExecutiveMetric[] = [
    pointMetric({
      key: "projectBudget",
      value: budget,
      sourceKey: SOURCE.erpProject,
      computedAtIso: nowIso,
      detailPath: "erp/projects",
    }),
    pointMetric({
      key: "projectActualCost",
      value: actual,
      sourceKey: SOURCE.erpProject,
      computedAtIso: nowIso,
      detailPath: "erp/projects",
    }),
    pointMetric({
      key: "costVariance",
      // Both operands must be present; a variance against an absent budget is
      // not zero.
      value: budget === null || actual === null ? null : budget - actual,
      sourceKey: SOURCE.erpProject,
      computedAtIso: nowIso,
      detailPath: "erp/projects",
    }),
  ];

  // `ledgerAvailable: false` is a type-level constant, not a runtime check: the
  // product has no ledger entity, so this section is project cost control and
  // must not be read as accounting. Removing this field would let the UI imply
  // otherwise.
  return operationalSection({ metrics, ledgerAvailable: false });
}

async function industrialSection(args: {
  scope: ExecutiveScope;
  range: ResolvedRange;
  nowMs: number;
  nowIso: string;
  client: SummaryDb;
}): Promise<ExecutiveSection<IndustrialSummary>> {
  const { scope, range, nowMs, nowIso, client } = args;

  if (!scope.authority.industrial) {
    return refusedSection("FORBIDDEN", REASON.forbiddenIndustrial);
  }
  // Fail closed BEFORE the database: no accessible site, no industrial data.
  const siteIds = [...scope.allowedSiteIds];
  if (siteIds.length === 0) {
    return refusedSection("FORBIDDEN", REASON.noSites);
  }

  const organizationId = scope.organizationId;
  const inWindow = (from: number, to: number) => ({ gte: new Date(from), lt: new Date(to) });

  // The site predicate is applied on BOTH the site id list (already org-resolved
  // by getAllowedSiteIds) and organizationId, so a site id from another tenant
  // resolves to nothing rather than relying on one of the two to catch it.
  const siteWhere = { organizationId, id: { in: siteIds } };

  const [sites, gateways, newestTelemetry, openCritical, alertsNow, alertsBefore] = await Promise.all([
    client.industrialSite.findMany({
      where: siteWhere,
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    client.industrialGateway.findMany({
      where: { organizationId, siteId: { in: siteIds }, revokedAt: null },
      select: { id: true, siteId: true, status: true, lastSeenAt: true },
      take: 2_000,
    }),
    // Org-wide newest arrival. Covered by @@index([organizationId, receivedAt]).
    // A per-site equivalent would need @@index([organizationId, siteId,
    // receivedAt]); that index does not exist, and adding it to the telemetry
    // table is a rollout decision, so per-site recency is reported from the
    // gateway heartbeat below instead of from an unindexed scan.
    client.telemetryRecord.findFirst({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
    client.assetAlert.count({
      where: {
        organizationId,
        dismissed: false,
        resolvedAt: null,
        severity: { in: ["CRITICAL", "HIGH"] },
        asset: { organizationId, siteId: { in: siteIds } },
      },
    }),
    client.assetAlert.count({
      where: {
        organizationId,
        createdAt: inWindow(range.currentStartMs, range.currentEndMs),
        asset: { organizationId, siteId: { in: siteIds } },
      },
    }),
    client.assetAlert.count({
      where: {
        organizationId,
        createdAt: inWindow(range.baselineStartMs, range.baselineEndMs),
        asset: { organizationId, siteId: { in: siteIds } },
      },
    }),
  ]);

  if (sites.length === 0) return emptySection(REASON.noRows);

  const bySite = new Map<string, Array<{ status: string; lastSeenMs: number | null }>>();
  for (const g of gateways) {
    const key = String(g.siteId);
    const seen = g.lastSeenAt instanceof Date ? g.lastSeenAt.getTime() : null;
    const list = bySite.get(key) ?? [];
    list.push({ status: String(g.status), lastSeenMs: Number.isFinite(seen) ? seen : null });
    bySite.set(key, list);
  }

  const connectivity: SiteConnectivity[] = sites.map(row => {
    const siteId = String(row.id);
    const list = bySite.get(siteId) ?? [];
    // The newest heartbeat across the site's gateways. A site with no gateway at
    // all keeps `null`, which classifies as NEVER — deliberately NOT as healthy
    // and deliberately NOT as DISCONNECTED.
    const newest = list.reduce<number | null>(
      (acc, g) => (g.lastSeenMs === null ? acc : acc === null ? g.lastSeenMs : Math.max(acc, g.lastSeenMs)),
      null,
    );
    const verdict = classifyFreshness({ lastSignalMs: newest, nowMs });
    return {
      siteId,
      name: String(row.name),
      status: String(row.status),
      gatewayCount: list.length,
      onlineGatewayCount: list.filter(g => g.status === "ONLINE").length,
      freshness: verdict.freshness,
      lastSignalIso: verdict.lastSignalIso,
      ageMs: verdict.ageMs,
    };
  });

  const telemetryMs =
    newestTelemetry?.receivedAt instanceof Date ? newestTelemetry.receivedAt.getTime() : null;
  const telemetryVerdict = classifyFreshness({ lastSignalMs: telemetryMs, nowMs });

  const metrics: ExecutiveMetric[] = [
    pointMetric({
      key: "openCriticalAlerts",
      value: openCritical,
      sourceKey: SOURCE.assetAlert,
      computedAtIso: nowIso,
      detailPath: "dashboard/operations/alerts",
    }),
    pointMetric({
      key: "connectedSites",
      value: connectivity.filter(s => isTrustworthy(s.freshness)).length,
      sourceKey: SOURCE.gatewayHeartbeat,
      computedAtIso: nowIso,
      detailPath: "dashboard/industrial/sites",
    }),
    windowMetric({
      key: "alertsRaised",
      current: alertsNow,
      baseline: alertsBefore,
      sourceKey: SOURCE.assetAlert,
      range,
      computedAtIso: nowIso,
      detailPath: "dashboard/operations/alerts",
    }),
  ];

  return operationalSection({
    sites: connectivity,
    metrics,
    telemetryFreshness: telemetryVerdict.freshness,
    telemetryLastSignalIso: telemetryVerdict.lastSignalIso,
  });
}

/**
 * Layer B — what needs a decision.
 *
 * Every item is produced by ONE stated rule over real counts. There is no score,
 * no ranking model and no prediction: `causeKey` names the rule, so the manager
 * can see why an item is on the list and the rule can be changed deliberately.
 */
function decisionItems(args: {
  operations: ExecutiveSection<OperationsSummary>;
  industrial: ExecutiveSection<IndustrialSummary>;
}): ExecutiveSection<readonly DecisionItem[]> {
  const items: DecisionItem[] = [];

  const valueOf = (section: ExecutiveSection<OperationsSummary>, key: string): number | null => {
    const found = section.data?.metrics.find(m => m.key === key);
    return found?.value ?? null;
  };

  if (args.operations.status === "OPERATIONAL") {
    const pending = valueOf(args.operations, "pendingApprovals");
    if (pending !== null && pending > 0) {
      items.push({
        key: "pendingApprovals",
        priority: "HIGH",
        count: pending,
        causeKey: "executive.causes.approvalBlocksWork",
        sourceKey: SOURCE.erpApproval,
        detailPath: "erp/approvals?status=PENDING",
      });
    }
    const overdue = valueOf(args.operations, "overdueTasks");
    if (overdue !== null && overdue > 0) {
      items.push({
        key: "overdueTasks",
        priority: "HIGH",
        count: overdue,
        causeKey: "executive.causes.dueDatePassed",
        sourceKey: SOURCE.erpTask,
        detailPath: "erp/tasks?overdue=1",
      });
    }
    const lowStock = valueOf(args.operations, "inventoryWarnings");
    if (lowStock !== null && lowStock > 0) {
      items.push({
        key: "inventoryWarnings",
        priority: "MEDIUM",
        count: lowStock,
        causeKey: "executive.causes.belowReorderPoint",
        sourceKey: SOURCE.erpInventory,
        detailPath: "erp/inventory",
      });
    }
  }

  if (args.industrial.status === "OPERATIONAL" && args.industrial.data) {
    const critical = args.industrial.data.metrics.find(m => m.key === "openCriticalAlerts")?.value ?? null;
    if (critical !== null && critical > 0) {
      items.push({
        key: "openCriticalAlerts",
        priority: "HIGH",
        count: critical,
        causeKey: "executive.causes.unresolvedCriticalAlert",
        sourceKey: SOURCE.assetAlert,
        detailPath: "dashboard/operations/alerts",
      });
    }
    const silent = args.industrial.data.sites.filter(s => !isTrustworthy(s.freshness));
    if (silent.length > 0) {
      items.push({
        key: "sitesWithoutData",
        priority: "HIGH",
        count: silent.length,
        causeKey: "executive.causes.noRecentSignal",
        sourceKey: SOURCE.gatewayHeartbeat,
        detailPath: "dashboard/industrial/sites",
      });
    }
  }

  if (items.length === 0) {
    /*
      An empty action centre is a real, meaningful state — but only when the
      sections it reads from actually ANSWERED.

      EMPTY counts as answered. A tenant with no operational rows has genuinely
      nothing to decide, and saying "this source could not be read" there is
      false: the source was read, and it was empty. That wording was observed on
      the live QA run against an organization with no records, which is why the
      condition is `OPERATIONAL || EMPTY` rather than `OPERATIONAL` alone.

      FORBIDDEN and UNAVAILABLE still do NOT count. A reader who may see nothing,
      or whose sources failed, must not be told there is nothing to decide —
      that is the difference between "all clear" and "you are blind".
    */
    const answered = [args.operations.status, args.industrial.status].some(
      status => status === "OPERATIONAL" || status === "EMPTY",
    );
    return answered
      ? operationalSection<readonly DecisionItem[]>([])
      : refusedSection("UNAVAILABLE", REASON.sourceUnavailable);
  }

  // Breaching before at-risk, then larger first. Deterministic and stable.
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "HIGH" ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });

  return operationalSection<readonly DecisionItem[]>(items);
}

function qualityNotes(args: {
  zoneConfiguredValid: boolean;
  industrial: ExecutiveSection<IndustrialSummary>;
  financial: ExecutiveSection<FinancialSummary>;
}): DataQualityNote[] {
  const notes: DataQualityNote[] = [];

  if (!args.zoneConfiguredValid) {
    notes.push({ key: "executive.quality.invalidTimeZoneConfig", severity: "WARNING" });
  }

  if (args.industrial.status === "OPERATIONAL" && args.industrial.data) {
    const never = args.industrial.data.sites.filter(s => s.freshness === "NEVER").length;
    const invalid = args.industrial.data.sites.filter(s => s.freshness === "INVALID").length;
    if (never > 0) {
      notes.push({ key: "executive.quality.sitesNeverReported", severity: "WARNING", meta: { count: never } });
    }
    if (invalid > 0) {
      // A future-dated heartbeat is a clock or ingest fault, never a reading.
      notes.push({ key: "executive.quality.futureDatedSignal", severity: "WARNING", meta: { count: invalid } });
    }
  }

  if (args.financial.status === "OPERATIONAL") {
    notes.push({ key: "executive.quality.noGeneralLedger", severity: "INFO" });
  }

  return notes;
}

/* ── Entry point ───────────────────────────────────────────────────────────── */

/**
 * Build the executive summary for one reader, one organization and one range.
 *
 * `nowMs` is injected so the whole summary — every window boundary, every
 * freshness verdict and the `computedAt` stamp — is derived from ONE instant.
 * Reading the clock per section would let two panels disagree about what "today"
 * means inside a single response.
 */
export async function buildExecutiveSummary(args: {
  scope: ExecutiveScope;
  range: ExecutiveRange;
  nowMs: number;
}): Promise<ExecutiveSummary> {
  const { scope, range: rangeKey, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();
  const zone = resolveReportingZone();

  const range = resolveRange({
    range: rangeKey,
    nowMs,
    timeZone: scope.timeZone,
    cutoffMinutes: scope.dayCutoffMinutes,
  });

  const client = await db();

  if (!client) {
    const unavailable = REASON.sourceUnavailable;
    return {
      generatedAtIso: nowIso,
      range: rangeKey,
      period: { current: range.current, baseline: range.baseline },
      timeZone: scope.timeZone,
      authority: scope.authority,
      sections: {
        operations: refusedSection("UNAVAILABLE", unavailable),
        financial: refusedSection("UNAVAILABLE", unavailable),
        industrial: refusedSection("UNAVAILABLE", unavailable),
        customers: refusedSection("NO_SOURCE", REASON.customersNotTenantScoped),
      },
      actions: refusedSection("UNAVAILABLE", unavailable),
      dataQuality: qualityNotes({
        zoneConfiguredValid: zone.configuredValid,
        industrial: refusedSection("UNAVAILABLE", unavailable),
        financial: refusedSection("UNAVAILABLE", unavailable),
      }),
    };
  }

  // The ERP overview feeds BOTH the operations and the financial section, so it
  // is fetched once. Its own money fields are already gated by the financial
  // axis through `erpScopeOf`.
  const erpCtx = {
    scope: {
      userId: scope.userId,
      organizationId: scope.organizationId,
      memberId: scope.memberId,
      role: scope.role as ErpScope["role"],
      // The financial axis is the ONLY thing that unlocks money figures, and it
      // is the same permission the ERP data layer already honours. The gate is
      // handed DOWN to that layer rather than applied to its output.
      canViewCompensation: scope.authority.financial,
    },
    correlationId: scope.correlationId,
  };

  const overviewResult = scope.authority.operations || scope.authority.financial
    ? await settle(() => getErpOverview(erpCtx))
    : { ok: false as const };

  const overview = overviewResult.ok ? overviewResult.value : null;
  const overviewFailed = !overviewResult.ok && (scope.authority.operations || scope.authority.financial);

  const [operations, industrial] = await Promise.all([
    scope.authority.operations
      ? overviewFailed
        ? Promise.resolve(refusedSection<OperationsSummary>("UNAVAILABLE", REASON.sourceUnavailable))
        : settleSection(() => operationsSection({ scope, range, nowIso, overview, client }))
      : Promise.resolve(refusedSection<OperationsSummary>("FORBIDDEN", REASON.forbiddenOperations)),
    settleSection(() => industrialSection({ scope, range, nowMs, nowIso, client })),
  ]);

  const financial = overviewFailed
    ? refusedSection<FinancialSummary>("UNAVAILABLE", REASON.sourceUnavailable)
    : financialSection({ scope, nowIso, overview });

  const actions = decisionItems({ operations, industrial });

  return {
    generatedAtIso: nowIso,
    range: rangeKey,
    period: { current: range.current, baseline: range.baseline },
    timeZone: scope.timeZone,
    authority: scope.authority,
    sections: {
      operations,
      financial,
      industrial,
      // Stated, not omitted: CRM and CustomerAccount are platform-global models
      // (CrmOpportunity has no organizationId at all), so there is no
      // tenant-scoped customer source to read here. Showing an empty customer
      // panel would read as "no customers".
      customers: refusedSection<never>("NO_SOURCE", REASON.customersNotTenantScoped),
    },
    actions,
    dataQuality: qualityNotes({ zoneConfiguredValid: zone.configuredValid, industrial, financial }),
  };
}

/* ── Failure isolation ─────────────────────────────────────────────────────── */

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    // The driver message never leaves this module.
    return { ok: false };
  }
}

/**
 * One section's failure is that section's failure. This is the mechanism behind
 * "the failure of one widget must not break the whole dashboard": the caller
 * always receives a complete `ExecutiveSummary`, with the broken part marked
 * UNAVAILABLE and the rest intact.
 */
async function settleSection<T>(fn: () => Promise<ExecutiveSection<T>>): Promise<ExecutiveSection<T>> {
  const result = await settle(fn);
  return result.ok ? result.value : refusedSection<T>("UNAVAILABLE", REASON.sourceUnavailable);
}

export { OPEN_TASK_STATUSES_EXCLUDED };
