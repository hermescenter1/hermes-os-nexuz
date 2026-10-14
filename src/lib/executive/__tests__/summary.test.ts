/**
 * Executive Management Center — the summary aggregation.
 *
 * These tests drive the REAL `buildExecutiveSummary` against a `where`-honouring
 * fake database seeded with two organizations and two sites. Only the ERP
 * overview and the Prisma accessor are substituted; the aggregation, the scope
 * predicates, the freshness classification and the decision rules all run.
 *
 * That matters because the claims under test are isolation claims. A stub that
 * returns a fixed list proves nothing about a `where` clause. Here, a row from
 * the other organization — or from a site the reader has no grant for — is
 * present in the store and is excluded only if the production predicate
 * genuinely excludes it.
 *
 * The fake returns COPIES of its rows, so a caller that mutates a result cannot
 * corrupt the store and make a later assertion pass for the wrong reason.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExecutiveSummary, REASON } from "../summary";
import { DEFAULT_TIME_ZONE } from "../period";
import type { ExecutiveScope } from "../scope";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-1";
const SITE_2 = "site-2";
const SITE_B = "site-b";

const NOW = Date.parse("2026-10-10T08:00:00Z"); // 11:30 local in Tehran
const MINUTE = 60_000;

type Row = Record<string, unknown>;

/* ── The ERP overview is substituted; everything else is real ─────────────── */

const h = vi.hoisted(() => ({
  overview: null as unknown,
  overviewThrows: false,
  overviewCalls: [] as unknown[],
  /** What `getPrisma()` will answer. Set per test. */
  prisma: null as unknown,
}));

vi.mock("@/lib/erp/operations", () => ({
  getErpOverview: async (ctx: unknown) => {
    h.overviewCalls.push(ctx);
    if (h.overviewThrows) throw new Error("erp down");
    return h.overview;
  },
  UTILIZATION_INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
}));

/* ── A where-honouring fake, with query recording ─────────────────────────── */

interface Store {
  industrialSite: Row[];
  industrialGateway: Row[];
  telemetryRecord: Row[];
  assetAlert: Row[];
  industrialAsset: Row[];
}

const store: Store = {
  industrialSite: [],
  industrialGateway: [],
  telemetryRecord: [],
  assetAlert: [],
  industrialAsset: [],
};

/** Every (model, where) pair the production code issued, in order. */
const queries: Array<{ model: string; op: string; where: Row | undefined }> = [];

function inRange(value: unknown, cond: Row): boolean {
  if (!(value instanceof Date)) return false;
  const ms = value.getTime();
  if (cond.gte instanceof Date && ms < cond.gte.getTime()) return false;
  if (cond.lt instanceof Date && ms >= cond.lt.getTime()) return false;
  if (cond.gt instanceof Date && ms <= cond.gt.getTime()) return false;
  if (cond.lte instanceof Date && ms > cond.lte.getTime()) return false;
  return true;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    // The to-one relation filter the alert counts rely on.
    if (field === "asset") {
      const asset = store.industrialAsset.find(a => a.id === row.assetId);
      if (!asset) return false;
      if (!matches(asset, cond as Row)) return false;
      continue;
    }
    const value = row[field];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (typeof cond === "object") {
      const c = cond as Row;
      if (Array.isArray(c.in)) {
        if (!(c.in as unknown[]).includes(value)) return false;
        continue;
      }
      if (Array.isArray(c.notIn)) {
        if ((c.notIn as unknown[]).includes(value)) return false;
        continue;
      }
      if ("gte" in c || "lt" in c || "gt" in c || "lte" in c) {
        if (!inRange(value, c)) return false;
        continue;
      }
      if ("not" in c) {
        if (c.not === null ? value === null || value === undefined : value === c.not) return false;
        continue;
      }
      return false; // an unsupported operator must fail loudly, not pass silently
    }
    if (value !== cond) return false;
  }
  return true;
}

function project(row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
  return out;
}

function delegate(model: keyof Store) {
  return {
    async count(args: unknown) {
      const a = (args ?? {}) as { where?: Row };
      queries.push({ model, op: "count", where: a.where });
      return store[model].filter(r => matches(r, a.where)).length;
    },
    async findMany(args: unknown) {
      const a = (args ?? {}) as { where?: Row; select?: Row; take?: number; orderBy?: Row };
      queries.push({ model, op: "findMany", where: a.where });
      let rows = store[model].filter(r => matches(r, a.where));
      const order = a.orderBy as { [k: string]: "asc" | "desc" } | undefined;
      if (order) {
        const [key, dir] = Object.entries(order)[0];
        rows = [...rows].sort((x, y) => {
          const xv = x[key] instanceof Date ? (x[key] as Date).getTime() : String(x[key] ?? "");
          const yv = y[key] instanceof Date ? (y[key] as Date).getTime() : String(y[key] ?? "");
          const cmp = xv < yv ? -1 : xv > yv ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        });
      }
      if (typeof a.take === "number") rows = rows.slice(0, a.take);
      return rows.map(r => project(r, a.select));
    },
    async findFirst(args: unknown) {
      const rows = await this.findMany(args);
      return rows[0] ?? null;
    },
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => h.prisma,
}));

/** ERP counts the aggregation issues directly. Backed by their own stores. */
const erpStore = {
  erpTask: [] as Row[],
  erpApprovalRequest: [] as Row[],
  // Slice G3 — the tenant's own customers and their contact log.
  party: [] as Row[],
  partyInteraction: [] as Row[],
};

function erpDelegate(model: keyof typeof erpStore) {
  return {
    async count(args: unknown) {
      const a = (args ?? {}) as { where?: Row };
      queries.push({ model, op: "count", where: a.where });
      return erpStore[model].filter(r => matches(r, a.where)).length;
    },
  };
}

function buildPrisma() {
  return {
    erpTask: erpDelegate("erpTask"),
    erpWorkOrder: erpDelegate("erpTask"),
    erpApprovalRequest: erpDelegate("erpApprovalRequest"),
    erpProject: erpDelegate("erpTask"),
    industrialSite: delegate("industrialSite"),
    industrialGateway: delegate("industrialGateway"),
    telemetryRecord: delegate("telemetryRecord"),
    assetAlert: delegate("assetAlert"),
    party: erpDelegate("party"),
    partyInteraction: erpDelegate("partyInteraction"),
  };
}

const OVERVIEW = {
  activeProjects: 3,
  overdueTasks: 4,
  openWorkOrders: 5,
  inventoryWarnings: 2,
  pendingApprovals: 6,
  totalBudget: 1_000,
  totalActualCost: 400,
  financialsVisible: true,
  resourceUtilization: null,
  utilizationStatus: "INSUFFICIENT_DATA",
  teamSize: 7,
  recentActivity: [],
  projectsByStatus: {},
  tasksByStatus: {},
  workOrdersByStatus: {},
  kpiSummary: [],
  kpiSummaryLimit: 5,
  recentActivityLimit: 10,
};

function scopeFor(over: Partial<ExecutiveScope> = {}): ExecutiveScope {
  return {
    userId: "user-1",
    organizationId: ORG_A,
    memberId: "member-1",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true },
    allowedSiteIds: [SITE_1, SITE_2],
    timeZone: DEFAULT_TIME_ZONE,
    dayCutoffMinutes: 0,
    correlationId: "corr-1",
    ...over,
  } as ExecutiveScope;
}

function seed() {
  store.industrialSite = [
    { id: SITE_1, organizationId: ORG_A, name: "Line One", status: "ACTIVE" },
    { id: SITE_2, organizationId: ORG_A, name: "Line Two", status: "ACTIVE" },
    { id: SITE_B, organizationId: ORG_B, name: "Other Tenant Plant", status: "ACTIVE" },
  ];
  store.industrialGateway = [
    // SITE_1: fresh
    { id: "gw-1", organizationId: ORG_A, siteId: SITE_1, status: "ONLINE", lastSeenAt: new Date(NOW - 2 * MINUTE), revokedAt: null },
    { id: "gw-2", organizationId: ORG_A, siteId: SITE_1, status: "OFFLINE", lastSeenAt: new Date(NOW - 50 * MINUTE), revokedAt: null },
    // SITE_2 has NO gateway at all -> must classify NEVER
    // ORG_B gateway, fresh — must never be counted for ORG_A
    { id: "gw-b", organizationId: ORG_B, siteId: SITE_B, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
  ];
  store.industrialAsset = [
    { id: "asset-1", organizationId: ORG_A, siteId: SITE_1 },
    { id: "asset-2", organizationId: ORG_A, siteId: SITE_2 },
    { id: "asset-b", organizationId: ORG_B, siteId: SITE_B },
  ];
  store.assetAlert = [
    // open critical, in scope
    { id: "al-1", organizationId: ORG_A, assetId: "asset-1", severity: "CRITICAL", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - 30 * MINUTE) },
    // open high, in scope, raised in the BASELINE window (yesterday)
    { id: "al-2", organizationId: ORG_A, assetId: "asset-2", severity: "HIGH", dismissed: false, resolvedAt: null, createdAt: new Date(Date.parse("2026-10-09T06:00:00Z")) },
    // dismissed -> not an open alert
    { id: "al-3", organizationId: ORG_A, assetId: "asset-1", severity: "CRITICAL", dismissed: true, resolvedAt: null, createdAt: new Date(NOW - 10 * MINUTE) },
    // resolved -> not an open alert
    { id: "al-4", organizationId: ORG_A, assetId: "asset-1", severity: "CRITICAL", dismissed: false, resolvedAt: new Date(NOW), createdAt: new Date(NOW - 20 * MINUTE) },
    // low severity -> not critical/high
    { id: "al-5", organizationId: ORG_A, assetId: "asset-1", severity: "LOW", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - 5 * MINUTE) },
    // other tenant, open critical
    { id: "al-b", organizationId: ORG_B, assetId: "asset-b", severity: "CRITICAL", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - MINUTE) },
  ];
  store.telemetryRecord = [
    { id: "t-1", organizationId: ORG_A, siteId: SITE_1, receivedAt: new Date(NOW - 3 * MINUTE) },
    { id: "t-b", organizationId: ORG_B, siteId: SITE_B, receivedAt: new Date(NOW) },
  ];
  erpStore.erpTask = [
    // completed today (current window)
    { id: "tk-1", organizationId: ORG_A, deletedAt: null, completedAt: new Date(NOW - MINUTE) },
    { id: "tk-2", organizationId: ORG_A, deletedAt: null, completedAt: new Date(NOW - 2 * MINUTE) },
    // completed yesterday (baseline window)
    { id: "tk-3", organizationId: ORG_A, deletedAt: null, completedAt: new Date(Date.parse("2026-10-09T06:00:00Z")) },
    // other tenant, completed today
    { id: "tk-b", organizationId: ORG_B, deletedAt: null, completedAt: new Date(NOW - MINUTE) },
    // soft-deleted
    { id: "tk-d", organizationId: ORG_A, deletedAt: new Date(NOW), completedAt: new Date(NOW - MINUTE) },
  ];
  erpStore.erpApprovalRequest = [
    { id: "ap-1", organizationId: ORG_A, decidedAt: new Date(NOW - MINUTE) },
    { id: "ap-b", organizationId: ORG_B, decidedAt: new Date(NOW - MINUTE) },
  ];
}

beforeEach(() => {
  queries.length = 0;
  h.overview = OVERVIEW;
  h.overviewThrows = false;
  h.overviewCalls.length = 0;
  seed();
  h.prisma = buildPrisma();
});

const run = (scope = scopeFor(), range: "today" | "last7Days" = "today") =>
  buildExecutiveSummary({ scope, range, nowMs: NOW });

/* ── Tenant and site isolation ────────────────────────────────────────────── */

describe("tenant isolation — every query is scoped, and the other tenant's rows are present to prove it", () => {
  it("never issues a query without an organizationId predicate", async () => {
    await run();
    expect(queries.length).toBeGreaterThan(0);
    const unscoped = queries.filter(q => {
      const where = q.where ?? {};
      return where.organizationId === undefined;
    });
    expect(unscoped.map(q => `${q.model}.${q.op}`)).toEqual([]);
  });

  it("counts only this organization's completed tasks, excluding soft-deleted rows", async () => {
    const summary = await run();
    const metric = summary.sections.operations.data?.metrics.find(m => m.key === "tasksCompleted");
    // tk-1 and tk-2 only: tk-3 is yesterday, tk-b is ORG_B, tk-d is deleted.
    expect(metric?.value).toBe(2);
  });

  it("counts only this organization's open critical alerts", async () => {
    const summary = await run();
    const metric = summary.sections.industrial.data?.metrics.find(m => m.key === "openCriticalAlerts");
    // al-1 (CRITICAL open) + al-2 (HIGH open). al-3 dismissed, al-4 resolved,
    // al-5 LOW, al-b other tenant.
    expect(metric?.value).toBe(2);
  });

  it("excludes a site the reader has no grant for, even inside their own organization", async () => {
    const summary = await run(scopeFor({ allowedSiteIds: [SITE_1] }));
    const sites = summary.sections.industrial.data?.sites ?? [];
    expect(sites.map(s => s.siteId)).toEqual([SITE_1]);
    // asset-2 lives on SITE_2, so al-2 must drop out of the alert count.
    const metric = summary.sections.industrial.data?.metrics.find(m => m.key === "openCriticalAlerts");
    expect(metric?.value).toBe(1);
  });

  it("applies the site predicate to the alert queries, not only to the site list", async () => {
    await run(scopeFor({ allowedSiteIds: [SITE_1] }));
    const alertQueries = queries.filter(q => q.model === "assetAlert");
    expect(alertQueries.length).toBeGreaterThan(0);
    for (const q of alertQueries) {
      const asset = (q.where as Row | undefined)?.asset as Row | undefined;
      expect(asset).toBeDefined();
      expect((asset?.siteId as Row).in).toEqual([SITE_1]);
      expect(asset?.organizationId).toBe(ORG_A);
    }
  });
});

describe("fail closed — no accessible site means no industrial query at all", () => {
  it("refuses the industrial section and touches no industrial table", async () => {
    const summary = await run(scopeFor({ allowedSiteIds: [] }));
    expect(summary.sections.industrial.status).toBe("FORBIDDEN");
    expect(summary.sections.industrial.reasonKey).toBe(REASON.noSites);
    expect(summary.sections.industrial.data).toBeNull();

    const industrialModels = ["industrialSite", "industrialGateway", "telemetryRecord", "assetAlert"];
    expect(queries.filter(q => industrialModels.includes(q.model))).toEqual([]);
  });

  it("does not widen an empty site list to the whole organization", async () => {
    const summary = await run(scopeFor({ allowedSiteIds: [] }));
    expect(JSON.stringify(summary)).not.toContain(SITE_1);
    expect(JSON.stringify(summary)).not.toContain(SITE_B);
  });
});

/* ── Independent authority axes ───────────────────────────────────────────── */

describe("the three axes are checked independently", () => {
  it("withholds every money figure when the financial axis is refused", async () => {
    const scope = scopeFor({ authority: { operations: true, financial: false, industrial: true } });
    const summary = await run(scope);

    expect(summary.sections.financial.status).toBe("FORBIDDEN");
    expect(summary.sections.financial.reasonKey).toBe(REASON.forbiddenFinancial);
    expect(summary.sections.financial.data).toBeNull();

    // The ERP layer is told not to expose compensation, through the same
    // permission — not through a UI filter on the way out.
    expect(h.overviewCalls[0]).toMatchObject({ scope: { canViewCompensation: false } });

    // And the operations section still works.
    expect(summary.sections.operations.status).toBe("OPERATIONAL");
  });

  it("keeps operations working when the industrial axis is refused, and vice versa", async () => {
    const noIndustrial = await run(
      scopeFor({ authority: { operations: true, financial: true, industrial: true }, allowedSiteIds: [] }),
    );
    expect(noIndustrial.sections.operations.status).toBe("OPERATIONAL");
    expect(noIndustrial.sections.industrial.status).toBe("FORBIDDEN");

    const noOps = await run(
      scopeFor({ authority: { operations: false, financial: false, industrial: true } }),
    );
    expect(noOps.sections.operations.status).toBe("FORBIDDEN");
    expect(noOps.sections.operations.reasonKey).toBe(REASON.forbiddenOperations);
    expect(noOps.sections.industrial.status).toBe("OPERATIONAL");
  });

  it("does not call the ERP overview at all when neither operations nor financial is held", async () => {
    await run(scopeFor({ authority: { operations: false, financial: false, industrial: true } }));
    expect(h.overviewCalls).toEqual([]);
  });

  it("withholds money figures when the ERP layer itself reports them invisible", async () => {
    h.overview = { ...OVERVIEW, financialsVisible: false, totalBudget: null, totalActualCost: null };
    const summary = await run();
    expect(summary.sections.financial.status).toBe("FORBIDDEN");
  });
});

/* ── Failure isolation ────────────────────────────────────────────────────── */

describe("one failing section does not blank the dashboard", () => {
  it("marks only the ERP-backed sections UNAVAILABLE when the ERP overview throws", async () => {
    h.overviewThrows = true;
    const summary = await run();

    expect(summary.sections.operations.status).toBe("UNAVAILABLE");
    expect(summary.sections.financial.status).toBe("UNAVAILABLE");
    // The industrial section reads different tables and is unaffected.
    expect(summary.sections.industrial.status).toBe("OPERATIONAL");
    expect(summary.sections.industrial.data?.sites.length).toBe(2);
  });

  it("marks the industrial section UNAVAILABLE when its tables throw, leaving operations intact", async () => {
    const broken = buildPrisma();
    broken.industrialGateway = {
      ...broken.industrialGateway,
      findMany: async () => {
        throw new Error("gateway table gone");
      },
    } as unknown as typeof broken.industrialGateway;
    h.prisma = broken;

    const summary = await run();
    expect(summary.sections.industrial.status).toBe("UNAVAILABLE");
    expect(summary.sections.industrial.reasonKey).toBe(REASON.sourceUnavailable);
    expect(summary.sections.operations.status).toBe("OPERATIONAL");
  });

  it("reports every section UNAVAILABLE — never EMPTY — when there is no database at all", async () => {
    h.prisma = null;
    const summary = await run();
    for (const key of ["operations", "financial", "industrial"] as const) {
      expect(summary.sections[key].status, key).toBe("UNAVAILABLE");
      expect(summary.sections[key].data, key).toBeNull();
    }
    expect(summary.actions.status).toBe("UNAVAILABLE");
  });

  it("never leaks a driver message into the response", async () => {
    const broken = buildPrisma();
    broken.industrialSite = {
      ...broken.industrialSite,
      findMany: async () => {
        throw new Error("relation \"IndustrialSite\" does not exist at 10.0.0.4:5432");
      },
    } as unknown as typeof broken.industrialSite;
    h.prisma = broken;

    const summary = await run();
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("10.0.0.4");
    expect(serialized).not.toContain("does not exist");
  });
});

/* ── Honest absence ───────────────────────────────────────────────────────── */

describe("absence is never reported as health", () => {
  it("classifies a site with no gateway as NEVER, not FRESH and not DISCONNECTED", async () => {
    const summary = await run();
    const site2 = summary.sections.industrial.data?.sites.find(s => s.siteId === SITE_2);
    expect(site2?.gatewayCount).toBe(0);
    expect(site2?.freshness).toBe("NEVER");
    expect(site2?.lastSignalIso).toBeNull();
  });

  it("counts only trustworthy sites as connected", async () => {
    const summary = await run();
    const connected = summary.sections.industrial.data?.metrics.find(m => m.key === "connectedSites");
    // SITE_1 is FRESH (2 minutes), SITE_2 has never reported.
    expect(connected?.value).toBe(1);
  });

  it("raises a data-quality warning naming the silent sites", async () => {
    const summary = await run();
    const note = summary.dataQuality.find(n => n.key === "executive.quality.sitesNeverReported");
    expect(note).toMatchObject({ severity: "WARNING", meta: { count: 1 } });
  });

  it("reports the customer section as EMPTY, not zeros, when the tenant has no customers", async () => {
    const summary = await run();
    expect(summary.sections.customers.status).toBe("EMPTY");
    expect(summary.sections.customers.data).toBeNull();
    expect(summary.sections.customers.reasonKey).toBe(REASON.noRows);
  });

  it("declares that the financial section is not backed by a ledger", async () => {
    const summary = await run();
    expect(summary.sections.financial.data?.ledgerAvailable).toBe(false);
    expect(summary.dataQuality.map(n => n.key)).toContain("executive.quality.noGeneralLedger");
  });

  it("returns EMPTY, not zeros, when the tenant has no ERP rows", async () => {
    h.overview = null;
    const summary = await run();
    expect(summary.sections.operations.status).toBe("EMPTY");
    expect(summary.sections.operations.data).toBeNull();
    expect(summary.sections.financial.status).toBe("EMPTY");
  });
});

/* ── Trends ───────────────────────────────────────────────────────────────── */

describe("trends are only reported where a baseline exists", () => {
  it("compares a windowed metric against the real preceding window", async () => {
    const summary = await run();
    const metric = summary.sections.operations.data?.metrics.find(m => m.key === "tasksCompleted");
    // 2 today vs 1 yesterday.
    expect(metric?.value).toBe(2);
    expect(metric?.delta).toEqual({ kind: "CHANGE", absolute: 1, percent: 100, lowBaseline: true });
  });

  it("refuses to invent a trend for a point-in-time count", async () => {
    const summary = await run();
    for (const key of ["activeProjects", "overdueTasks", "openWorkOrders", "pendingApprovals"]) {
      const metric = summary.sections.operations.data?.metrics.find(m => m.key === key);
      expect(metric?.delta, key).toEqual({ kind: "INCOMPARABLE", reason: "NO_BASELINE" });
      expect(metric?.provenance.period, key).toBeNull();
    }
  });

  it("gives every metric a definition, a source and a computed-at stamp", async () => {
    const summary = await run();
    const all = [
      ...(summary.sections.operations.data?.metrics ?? []),
      ...(summary.sections.financial.data?.metrics ?? []),
      ...(summary.sections.industrial.data?.metrics ?? []),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.provenance.definitionKey, m.key).toMatch(/^executive\.definitions\./);
      expect(m.provenance.sourceKey, m.key).toMatch(/^executive\.sources\./);
      expect(m.provenance.computedAtIso, m.key).toBe(new Date(NOW).toISOString());
    }
  });

  it("derives every window from one instant, so two panels cannot disagree about today", async () => {
    const summary = await run();
    expect(summary.generatedAtIso).toBe(new Date(NOW).toISOString());
    expect(summary.period.current.complete).toBe(false);
    expect(summary.period.baseline.complete).toBe(true);
    expect(summary.period.current.timeZone).toBe(DEFAULT_TIME_ZONE);
  });
});

/* ── The action centre ────────────────────────────────────────────────────── */

describe("the action centre states a cause and a destination for every item", () => {
  it("lists breaching items first, each with a cause, a source and a detail path", async () => {
    const summary = await run();
    const items = summary.actions.data ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.causeKey).toMatch(/^executive\.causes\./);
      expect(item.sourceKey).toMatch(/^executive\.sources\./);
      expect(item.detailPath).toBeTruthy();
      expect(item.count).toBeGreaterThan(0);
    }
    const priorities = items.map(i => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => (a === b ? 0 : a === "HIGH" ? -1 : 1)));
  });

  it("includes silent sites as a decision, not as a passive status", async () => {
    const summary = await run();
    const item = (summary.actions.data ?? []).find(i => i.key === "sitesWithoutData");
    expect(item).toMatchObject({ priority: "HIGH", count: 1, causeKey: "executive.causes.noRecentSignal" });
  });

  it("returns an OPERATIONAL empty list when there is genuinely nothing to decide", async () => {
    h.overview = { ...OVERVIEW, overdueTasks: 0, pendingApprovals: 0, inventoryWarnings: 0 };
    store.assetAlert = [];
    store.industrialGateway = [
      { id: "gw-1", organizationId: ORG_A, siteId: SITE_1, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
      { id: "gw-3", organizationId: ORG_A, siteId: SITE_2, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
    ];
    h.prisma = buildPrisma();

    const summary = await run();
    expect(summary.actions.status).toBe("OPERATIONAL");
    expect(summary.actions.data).toEqual([]);
  });

  it("says 'nothing to decide' — not 'source unavailable' — for a tenant that is genuinely EMPTY", async () => {
    // Observed on the live QA run: an organization with no operational rows was
    // told "this source could not be read", which is false. The source WAS read.
    h.overview = null;
    store.industrialSite = [];
    h.prisma = buildPrisma();

    const summary = await run();
    expect(summary.sections.operations.status).toBe("EMPTY");
    expect(summary.sections.industrial.status).toBe("EMPTY");
    expect(summary.actions.status).toBe("OPERATIONAL");
    expect(summary.actions.data).toEqual([]);
  });

  it("still refuses when the reader may see nothing at all — blindness is not all-clear", async () => {
    const scope = scopeFor({
      authority: { operations: false, financial: false, industrial: true },
      allowedSiteIds: [],
    });
    const summary = await run(scope);
    expect(summary.sections.operations.status).toBe("FORBIDDEN");
    expect(summary.sections.industrial.status).toBe("FORBIDDEN");
    expect(summary.actions.status).toBe("UNAVAILABLE");
    expect(summary.actions.data).toBeNull();
  });

  it("does not claim an empty action list when the sections it reads from failed", async () => {
    h.overviewThrows = true;
    const broken = buildPrisma();
    broken.industrialSite = {
      ...broken.industrialSite,
      findMany: async () => {
        throw new Error("down");
      },
    } as unknown as typeof broken.industrialSite;
    h.prisma = broken;

    const summary = await run();
    expect(summary.actions.status).toBe("UNAVAILABLE");
    expect(summary.actions.data).toBeNull();
  });
});

/* ── Customers (slice G3) ──────────────────────────────────────────────────── */

describe("the organization's own customers", () => {
  const party = (over: Row = {}): Row => ({
    organizationId: ORG_A,
    kind: "CUSTOMER",
    status: "ACTIVE",
    archivedAt: null,
    nextActionAt: null,
    followUpOwnerId: "user-1",
    createdAt: new Date(NOW - 30 * 24 * 60 * MINUTE),
    ...over,
  });

  beforeEach(() => {
    erpStore.party.length = 0;
    erpStore.partyInteraction.length = 0;
  });

  it("counts only THIS organization's customers, and excludes archived ones", async () => {
    erpStore.party.push(
      party(),
      party({ status: "INACTIVE" }),
      party({ archivedAt: new Date(NOW - MINUTE) }),
      party({ organizationId: ORG_B }),
    );
    const summary = await run();
    const section = summary.sections.customers;
    expect(section.status).toBe("OPERATIONAL");
    const value = (key: string) => section.data!.metrics.find(m => m.key === key)?.value;
    expect(value("customersActive")).toBe(1);
    // Two of this organization's live customers: the active one and the inactive one.
    expect(section.data!.metrics).toHaveLength(5);
  });

  it("counts an overdue follow-up as of the END of the period, not the instant of computation", async () => {
    erpStore.party.push(
      party({ nextActionAt: new Date(NOW - 60 * MINUTE) }),
      party({ nextActionAt: new Date(NOW + 60 * MINUTE) }),
      party({ nextActionAt: null }),
    );
    const summary = await run();
    const metrics = summary.sections.customers.data!.metrics;
    expect(metrics.find(m => m.key === "customersOverdueFollowUp")?.value).toBe(1);
    const asOf = queries.find(q => q.model === "party" && (q.where as Row)?.nextActionAt)?.where as Row;
    expect(((asOf.nextActionAt as { lt: Date }).lt).getTime()).toBe(NOW);
  });

  it("never counts a customer created after the period it reports on", async () => {
    erpStore.party.push(party({ createdAt: new Date(NOW + 60 * MINUTE) }), party());
    const summary = await run();
    expect(summary.sections.customers.data!.metrics.find(m => m.key === "customersActive")?.value).toBe(1);
  });

  it("gives new customers and recorded contacts a real period-over-period comparison", async () => {
    // "today" in Tehran: the window starts at 20:30Z the previous day.
    erpStore.party.push(party({ createdAt: new Date(NOW - 60 * MINUTE) }));
    erpStore.partyInteraction.push(
      { organizationId: ORG_A, occurredAt: new Date(NOW - 60 * MINUTE) },
      { organizationId: ORG_B, occurredAt: new Date(NOW - 60 * MINUTE) },
    );
    const metrics = (await run()).sections.customers.data!.metrics;
    const created = metrics.find(m => m.key === "customersNew")!;
    const contacts = metrics.find(m => m.key === "customerInteractions")!;
    expect(created.value).toBe(1);
    expect(contacts.value).toBe(1);
    // Windowed metrics carry a period; point metrics do not.
    expect(created.provenance.period).not.toBeNull();
    expect(metrics.find(m => m.key === "customersActive")!.provenance.period).toBeNull();
  });

  it("names a source and a definition for every customer metric, and links to the records", async () => {
    erpStore.party.push(party());
    const metrics = (await run()).sections.customers.data!.metrics;
    for (const m of metrics) {
      expect(m.provenance.sourceKey, m.key).toMatch(/^executive\.sources\.(party|partyInteraction)$/);
      expect(m.provenance.definitionKey, m.key).toBe(`executive.definitions.${m.key}`);
      expect(m.provenance.detailPath, m.key).toMatch(/^dashboard\/clients/);
    }
  });

  it("states that it carries no customer financials", async () => {
    erpStore.party.push(party());
    expect((await run()).sections.customers.data!.financialsAvailable).toBe(false);
  });

  it("refuses the section for a reader without ERP authority, and issues no customer query", async () => {
    erpStore.party.push(party());
    const summary = await run(scopeFor({ authority: { operations: false, financial: false, industrial: true } }));
    expect(summary.sections.customers.status).toBe("FORBIDDEN");
    expect(summary.sections.customers.data).toBeNull();
    expect(queries.filter(q => q.model === "party" || q.model === "partyInteraction")).toHaveLength(0);
  });
});

/* ── Query cost (requirement row 11) ───────────────────────────────────────── */

describe("the aggregation's cost does not grow with the number of rows", () => {
  const manyParties = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      organizationId: ORG_A,
      kind: "CUSTOMER",
      status: "ACTIVE",
      archivedAt: null,
      nextActionAt: null,
      followUpOwnerId: "user-1",
      createdAt: new Date(NOW - 86_400_000),
    }));

  it("issues the SAME number of statements for 1 customer and for 500", async () => {
    erpStore.party.length = 0;
    erpStore.party.push(...manyParties(1));
    queries.length = 0;
    await run();
    const one = queries.length;

    erpStore.party.length = 0;
    erpStore.party.push(...manyParties(500));
    queries.length = 0;
    await run();
    const fiveHundred = queries.length;

    // A per-row query would make this 500 times larger. This is the N+1 proof:
    // deterministic, because the fake counts every statement exactly.
    expect(one).toBeGreaterThan(5);
    expect(fiveHundred).toBe(one);
  });

  it("reads the customer section with a bounded number of counting statements", async () => {
    erpStore.party.length = 0;
    erpStore.party.push(...manyParties(50));
    queries.length = 0;
    await run();
    const customerQueries = queries.filter(q => q.model === "party" || q.model === "partyInteraction");
    // Five metrics, read with eight counts (two of them windowed baselines).
    expect(customerQueries).toHaveLength(8);
    expect(customerQueries.every(q => q.op === "count")).toBe(true);
    // And every one of them is scoped to the organization.
    expect(customerQueries.every(q => (q.where as Row)?.organizationId === ORG_A)).toBe(true);
  });
});
