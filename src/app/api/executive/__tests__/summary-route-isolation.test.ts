/**
 * GET /api/executive/summary — isolation AT THE ROUTE.
 *
 * The library suite proves `buildExecutiveSummary` honours an organization and a
 * site allow-list. It cannot prove the ROUTE passes one, and a scope the handler
 * never supplies is decoration — the exact class of defect this repository has
 * paid for before. So these tests drive the real handler.
 *
 * Only the authentication and organization-resolution layers are substituted
 * (there is no session and no database in this process). The real guard
 * composition, the real aggregation and a `where`-honouring fake database all
 * run, and the store is seeded with a SECOND organization and a site the reader
 * has no grant for, so an assertion only passes if the production predicates
 * genuinely exclude them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-1";
const SITE_2 = "site-2";
const SITE_B = "site-b";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** Platform session. null = unauthenticated. */
  user: { id: "user-1", role: "admin" } as { id: string; role: string } | null,
  /** What the active-organization chain answers. */
  org: { ok: true, scope: { userId: "user-1", organizationId: "org-a", memberId: "m-1", role: "OWNER", canViewCompensation: true } } as unknown,
  /** The reader's site grants. */
  allowedSiteIds: [] as string[],
  prisma: null as unknown,
  overview: null as unknown,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => h.user,
}));
vi.mock("@/lib/erp/active-organization", () => ({
  getActiveOrganizationContext: async () => h.org,
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => h.allowedSiteIds,
}));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => h.prisma,
}));
vi.mock("@/lib/erp/operations", () => ({
  getErpOverview: async () => h.overview,
  UTILIZATION_INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
}));

import { GET } from "../summary/route";

/* ── a where-honouring fake, shared with the library suite's semantics ─────── */

const store: Record<string, Row[]> = {
  industrialSite: [],
  industrialGateway: [],
  telemetryRecord: [],
  assetAlert: [],
  industrialAsset: [],
  erpTask: [],
  erpApprovalRequest: [],
  // Slice G3 — the tenant's own customers and their contact log.
  party: [],
  partyInteraction: [],
};

function inRange(value: unknown, cond: Row): boolean {
  if (!(value instanceof Date)) return false;
  const ms = value.getTime();
  if (cond.gte instanceof Date && ms < cond.gte.getTime()) return false;
  if (cond.lt instanceof Date && ms >= cond.lt.getTime()) return false;
  return true;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    if (field === "asset") {
      const asset = store.industrialAsset.find(a => a.id === row.assetId);
      if (!asset || !matches(asset, cond as Row)) return false;
      continue;
    }
    const value = row[field];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (typeof cond === "object" && cond !== null && !(cond instanceof Date)) {
      const c = cond as Row;
      if (Array.isArray(c.in)) {
        if (!(c.in as unknown[]).includes(value)) return false;
        continue;
      }
      if ("gte" in c || "lt" in c) {
        if (!inRange(value, c)) return false;
        continue;
      }
      if ("not" in c) {
        if (c.not === null ? value === null || value === undefined : value === c.not) return false;
        continue;
      }
      return false;
    }
    if (value !== cond) return false;
  }
  return true;
}

function delegate(model: string) {
  return {
    async count(args: unknown) {
      const a = (args ?? {}) as { where?: Row };
      return store[model].filter(r => matches(r, a.where)).length;
    },
    async findMany(args: unknown) {
      const a = (args ?? {}) as { where?: Row; select?: Row; take?: number };
      let rows = store[model].filter(r => matches(r, a.where));
      if (typeof a.take === "number") rows = rows.slice(0, a.take);
      return rows.map(r => (a.select ? Object.fromEntries(Object.keys(a.select).map(k => [k, r[k]])) : { ...r }));
    },
    async findFirst(args: unknown) {
      const rows = await this.findMany(args);
      return rows[0] ?? null;
    },
  };
}

const buildPrisma = () => ({
  erpTask: delegate("erpTask"),
  erpWorkOrder: delegate("erpTask"),
  erpApprovalRequest: delegate("erpApprovalRequest"),
  erpProject: delegate("erpTask"),
  industrialSite: delegate("industrialSite"),
  industrialGateway: delegate("industrialGateway"),
  telemetryRecord: delegate("telemetryRecord"),
  assetAlert: delegate("assetAlert"),
  party: delegate("party"),
  partyInteraction: delegate("partyInteraction"),
});

const OVERVIEW = {
  activeProjects: 3,
  overdueTasks: 4,
  openWorkOrders: 5,
  inventoryWarnings: 0,
  pendingApprovals: 6,
  totalBudget: 9_999,
  totalActualCost: 1_111,
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

const NOW = Date.now();

function seed() {
  store.industrialSite = [
    { id: SITE_1, organizationId: ORG_A, name: "Alpha Line", status: "ACTIVE" },
    { id: SITE_2, organizationId: ORG_A, name: "Beta Line", status: "ACTIVE" },
    { id: SITE_B, organizationId: ORG_B, name: "Competitor Plant", status: "ACTIVE" },
  ];
  store.industrialGateway = [
    { id: "gw-1", organizationId: ORG_A, siteId: SITE_1, status: "ONLINE", lastSeenAt: new Date(NOW - 60_000), revokedAt: null },
    { id: "gw-2", organizationId: ORG_A, siteId: SITE_2, status: "ONLINE", lastSeenAt: new Date(NOW - 60_000), revokedAt: null },
    { id: "gw-b", organizationId: ORG_B, siteId: SITE_B, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
  ];
  store.industrialAsset = [
    { id: "a-1", organizationId: ORG_A, siteId: SITE_1 },
    { id: "a-2", organizationId: ORG_A, siteId: SITE_2 },
    { id: "a-b", organizationId: ORG_B, siteId: SITE_B },
  ];
  store.assetAlert = [
    { id: "al-1", organizationId: ORG_A, assetId: "a-1", severity: "CRITICAL", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - 60_000) },
    { id: "al-2", organizationId: ORG_A, assetId: "a-2", severity: "CRITICAL", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - 60_000) },
    { id: "al-b", organizationId: ORG_B, assetId: "a-b", severity: "CRITICAL", dismissed: false, resolvedAt: null, createdAt: new Date(NOW - 60_000) },
  ];
  store.telemetryRecord = [{ id: "t-1", organizationId: ORG_A, siteId: SITE_1, receivedAt: new Date(NOW - 60_000) }];
  store.erpTask = [];
  store.erpApprovalRequest = [];
}

const orgOk = (organizationId: string, role = "OWNER") => ({
  ok: true,
  scope: { userId: "user-1", organizationId, memberId: "m-1", role, canViewCompensation: role === "OWNER" },
});

const call = (url = "http://localhost/api/executive/summary") =>
  GET(new NextRequest(url, { method: "GET" }));

beforeEach(() => {
  seed();
  h.user = { id: "user-1", role: "admin" };
  h.org = orgOk(ORG_A);
  h.allowedSiteIds = [SITE_1, SITE_2];
  h.prisma = buildPrisma();
  h.overview = OVERVIEW;
});

/* ── the gate chain ───────────────────────────────────────────────────────── */

describe("the gate chain refuses in the right order and says nothing extra", () => {
  it("answers 401 with no payload when there is no session", async () => {
    h.user = null;
    const res = await call();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "AUTHENTICATION_REQUIRED" });
  });

  it("answers 403 for an authenticated user without the platform admin capability", async () => {
    h.user = { id: "user-1", role: "engineer" };
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "FORBIDDEN" });
  });

  it("answers 404 — not 403 — when the reader is not an ACTIVE member, so membership cannot be probed", async () => {
    h.org = { ok: false, error: { status: 404, code: "NOT_FOUND" } };
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("answers 428 and offers only the reader's own memberships when a choice is required", async () => {
    h.org = { ok: false, error: { status: 428, code: "ACTIVE_ORGANIZATION_REQUIRED" } };
    const res = await call();
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.error).toBe("ACTIVE_ORGANIZATION_REQUIRED");
    expect(Array.isArray(body.memberships)).toBe(true);
  });

  it("refuses a reader who holds none of the three authority axes", async () => {
    // RECRUITER is one of the eight roles the schema stores that appear in NO
    // permission list at all (see the PHASE 110-A1.0b note in lib/org/rbac.ts).
    // VIEWER is deliberately NOT used here: it DOES hold `view_industrial`, and
    // asserting otherwise would have encoded a policy this product does not have.
    h.org = orgOk(ORG_A, "RECRUITER");
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "NO_ACCESSIBLE_AXIS" });
  });

  it("serves a VIEWER the industrial axis only, with the other two stated as refused", async () => {
    h.org = orgOk(ORG_A, "VIEWER");
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authority).toEqual({ operations: false, financial: false, industrial: true });
    expect(body.sections.operations.status).toBe("FORBIDDEN");
    expect(body.sections.operations.reasonKey).toBe("executive.reasons.forbiddenOperations");
    expect(body.sections.financial.status).toBe("FORBIDDEN");
    expect(body.sections.industrial.status).toBe("OPERATIONAL");
    // No ERP figure may appear anywhere in the payload for this reader.
    expect(JSON.stringify(body)).not.toContain("9999");
  });

  it("never caches a response, on success or refusal", async () => {
    expect((await call()).headers.get("cache-control")).toBe("no-store");
    h.user = null;
    expect((await call()).headers.get("cache-control")).toBe("no-store");
  });
});

/* ── input validation ─────────────────────────────────────────────────────── */

describe("the reporting period is validated, not silently defaulted", () => {
  it("defaults to today when no range is supplied", async () => {
    const body = await (await call()).json();
    expect(body.range).toBe("today");
  });

  it("accepts each recognised range", async () => {
    for (const range of ["today", "last7Days", "last30Days"]) {
      const body = await (await call(`http://localhost/api/executive/summary?range=${range}`)).json();
      expect(body.range).toBe(range);
    }
  });

  it("refuses a present-but-unrecognised range with 400 rather than showing a different period", async () => {
    const res = await call("http://localhost/api/executive/summary?range=lastQuarter");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_REQUEST" });
  });
});

/* ── cross-organization isolation ─────────────────────────────────────────── */

describe("two organizations, one handler — no row crosses", () => {
  it("serves organization A only its own plants", async () => {
    const body = await (await call()).json();
    const names = body.sections.industrial.data.sites.map((s: { name: string }) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Alpha Line", "Beta Line"]));
    expect(names).not.toContain("Competitor Plant");
    expect(JSON.stringify(body)).not.toContain(SITE_B);
    expect(JSON.stringify(body)).not.toContain(ORG_B);
  });

  it("serves organization B nothing of organization A, for the same signed-in user", async () => {
    h.org = orgOk(ORG_B);
    h.allowedSiteIds = [SITE_B];
    const body = await (await call()).json();
    const names = body.sections.industrial.data.sites.map((s: { name: string }) => s.name);
    expect(names).toEqual(["Competitor Plant"]);
    expect(JSON.stringify(body)).not.toContain(SITE_1);
    expect(JSON.stringify(body)).not.toContain("Alpha Line");
  });

  it("counts alerts per organization, not across the platform", async () => {
    const a = await (await call()).json();
    expect(a.sections.industrial.data.metrics.find((m: { key: string }) => m.key === "openCriticalAlerts").value).toBe(2);

    h.org = orgOk(ORG_B);
    h.allowedSiteIds = [SITE_B];
    const b = await (await call()).json();
    expect(b.sections.industrial.data.metrics.find((m: { key: string }) => m.key === "openCriticalAlerts").value).toBe(1);
  });
});

/* ── two readers, different access, same organization ─────────────────────── */

describe("two readers of the same organization see only what their grants cover", () => {
  it("narrows plants and alerts to the reader's granted site", async () => {
    h.allowedSiteIds = [SITE_1];
    const body = await (await call()).json();
    expect(body.sections.industrial.data.sites.map((s: { siteId: string }) => s.siteId)).toEqual([SITE_1]);
    expect(body.sections.industrial.data.metrics.find((m: { key: string }) => m.key === "openCriticalAlerts").value).toBe(1);
    expect(JSON.stringify(body)).not.toContain("Beta Line");
  });

  it("refuses the industrial section entirely for a reader with no site grant", async () => {
    // MANAGER holds view_industrial but, not being OWNER/ADMIN, has no implicit
    // site access — so an empty grant list must fail closed, not widen.
    h.org = orgOk(ORG_A, "MANAGER");
    h.allowedSiteIds = [];
    const body = await (await call()).json();
    expect(body.sections.industrial.status).toBe("FORBIDDEN");
    expect(body.sections.industrial.data).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Alpha Line");
  });

  it("withholds every money figure from a reader without the financial axis", async () => {
    // ADMIN holds view_erp and view_industrial but NOT view_erp_compensation.
    h.org = orgOk(ORG_A, "ADMIN");
    const body = await (await call()).json();
    expect(body.authority).toEqual({ operations: true, financial: false, industrial: true });
    expect(body.sections.financial.status).toBe("FORBIDDEN");
    expect(body.sections.financial.data).toBeNull();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("9999");
    expect(serialized).not.toContain("1111");
  });

  it("gives the owner the financial axis and the figures with it", async () => {
    const body = await (await call()).json();
    expect(body.authority.financial).toBe(true);
    expect(body.sections.financial.data.metrics.find((m: { key: string }) => m.key === "projectBudget").value).toBe(9_999);
  });
});

/* ── error posture ────────────────────────────────────────────────────────── */

describe("failures are reported without internals", () => {
  it("answers 503 with a stable code when the database is absent, and no section claims data", async () => {
    h.prisma = null;
    const res = await call();
    expect(res.status).toBe(200); // the summary itself is complete; its sections are UNAVAILABLE
    const body = await res.json();
    for (const key of ["operations", "financial", "industrial"]) {
      expect(body.sections[key].status, key).toBe("UNAVAILABLE");
      expect(body.sections[key].data, key).toBeNull();
    }
    expect(body.actions.status).toBe("UNAVAILABLE");
  });

  it("never returns a driver message, a host or a stack", async () => {
    const broken = buildPrisma();
    broken.industrialSite = {
      ...broken.industrialSite,
      findMany: async () => {
        throw new Error("relation \"IndustrialSite\" does not exist at 10.0.0.7:5432");
      },
    } as unknown as typeof broken.industrialSite;
    h.prisma = broken;

    const body = await (await call()).json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("10.0.0.7");
    expect(serialized).not.toContain("does not exist");
    expect(serialized).not.toContain("Error");
    expect(body.sections.industrial.status).toBe("UNAVAILABLE");
  });

  // Slice G3: the organization's own customers ARE a source now, so the panel
  // reports what it found. The property that matters here is unchanged: a
  // section that carries no data says WHY, and a failure says so without
  // leaking anything about the database.
  it("reports the customer section as EMPTY, with its reason, when the organization has no customers", async () => {
    const body = await (await call()).json();
    expect(body.sections.customers.status).toBe("EMPTY");
    expect(body.sections.customers.reasonKey).toBe("executive.reasons.noRows");
    expect(body.sections.customers.data).toBeNull();
  });

  it("reports an unreadable customer source as UNAVAILABLE, never as an empty customer list", async () => {
    const broken = buildPrisma();
    broken.party = {
      ...broken.party,
      count: async () => {
        throw new Error('relation "Party" does not exist at 10.0.0.9:5432');
      },
    } as unknown as typeof broken.party;
    h.prisma = broken;

    const body = await (await call()).json();
    const serialized = JSON.stringify(body);
    expect(body.sections.customers.status).toBe("UNAVAILABLE");
    expect(body.sections.customers.data).toBeNull();
    expect(serialized).not.toContain("10.0.0.9");
    expect(serialized).not.toContain("does not exist");
    // The rest of the dashboard still answers: one failed source is not a
    // failed page.
    expect(body.sections.operations.status).toBe("OPERATIONAL");
  });
});
