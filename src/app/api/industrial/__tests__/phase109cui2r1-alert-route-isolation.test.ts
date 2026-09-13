/**
 * PHASE 109-C-UI.2-R1 — F-02 at the ROUTE, which is where it is actually
 * exploitable.
 *
 * The library-level suite proves `getOrgAlerts` / `getAssetAlerts` /
 * `dismissAlert` honour a site scope. It cannot prove the routes PASS one, and
 * a scope parameter nobody supplies is decoration — the same class of defect
 * that let this page ship unreachable through two review loops.
 *
 * So these tests drive the real handlers. Only the authentication layer is
 * mocked (there is no session or database here); the real alerts library runs
 * against a `where`-honouring fake, so an assertion failing means the boundary
 * genuinely moved, not that a stub changed its mind.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-1";
const SITE_2 = "site-2";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** What `getAllowedSiteIds` will answer. Set per test. */
  allowedSiteIds: [] as string[],
  /** The acting organisation. */
  orgId: "org-a",
  /** "jwt" exercises the user path; "apikey" the organisation-credential path. */
  authMethod: "jwt" as "jwt" | "apikey",
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: {
      userId: "user-1",
      orgId: h.orgId,
      authMethod: h.authMethod,
      scopes: ["industrial.write", "admin"],
      keyId: "k-1",
    },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: "user-1", orgId: h.orgId, role: "MEMBER" } }),
}));
vi.mock("@/lib/org/rbac", () => ({ requirePermission: () => ({ ok: true }) }));
vi.mock("@/lib/api/scopes", () => ({ hasScope: () => true }));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => h.allowedSiteIds,
}));

/* ── the same where-honouring fake as the library suite ───────────────────── */

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    const value = row[field];
    if (cond !== null && typeof cond === "object" && "in" in (cond as object)) {
      const list = (cond as { in: unknown[] }).in;
      if (!Array.isArray(list) || !list.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

let assets: Row[] = [];
let alerts: Row[] = [];
let updates = 0;

function model(rows: () => Row[]) {
  return {
    findMany: async (q: { where?: Record<string, unknown>; take?: number }) => {
      const hit = rows().filter((r) => matches(r, q.where));
      return typeof q.take === "number" ? hit.slice(0, q.take) : hit;
    },
    findFirst: async (q: { where?: Record<string, unknown> }) =>
      rows().find((r) => matches(r, q.where)) ?? null,
    update: async (q: { where: { id: string }; data: Row }) => {
      updates += 1;
      const row = rows().find((r) => r.id === q.where.id)!;
      Object.assign(row, q.data);
      return row;
    },
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    industrialAsset: model(() => assets),
    assetAlert: model(() => alerts),
  }),
}));

const { GET: listAlerts } = await import("@/app/api/industrial/alerts/route");
const { GET: assetAlerts } = await import("@/app/api/industrial/assets/[id]/alerts/route");
const { PATCH: dismiss } = await import(
  "@/app/api/industrial/assets/[id]/alerts/[alertId]/route"
);

function alert(id: string, organizationId: string, assetId: string): Row {
  return {
    id,
    organizationId,
    assetId,
    alertType: "CRITICAL_RISK",
    severity: "CRITICAL",
    title: `alert ${id}`,
    description: "",
    metadata: {},
    dismissed: false,
    dismissedAt: null,
    dismissedBy: null,
    resolvedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const req = (url: string) => new NextRequest(new URL(url, "http://localhost"));

beforeEach(() => {
  h.allowedSiteIds = [SITE_1];
  h.orgId = ORG_A;
  h.authMethod = "jwt";
  updates = 0;
  // `getAsset` maps the row through the module's own serialiser, which parses
  // the timestamps — a fixture without them fails inside the mapper and would
  // have been misread as a route defect.
  const stamps = { createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  assets = [
    { id: "a1", organizationId: ORG_A, siteId: SITE_1, name: "Pump 1", status: "ACTIVE", ...stamps },
    { id: "a3", organizationId: ORG_A, siteId: SITE_2, name: "Pump 3", status: "ACTIVE", ...stamps },
    { id: "b1", organizationId: ORG_B, siteId: "site-b", name: "Foreign", status: "ACTIVE", ...stamps },
  ];
  alerts = [
    alert("al1", ORG_A, "a1"),
    alert("al3", ORG_A, "a3"),
    alert("al4", ORG_B, "b1"),
  ];
});

/* ── GET /api/industrial/alerts ───────────────────────────────────────────── */

describe("GET /api/industrial/alerts", () => {
  it("returns only the caller's sites", async () => {
    const body = await (await listAlerts(req("/api/industrial/alerts"))).json();
    expect(body.alerts.map((a: Row) => a.id)).toEqual(["al1"]);
  });

  it("`total` counts the same scoped rows, never the organisation", async () => {
    // The original route answered `total: <every alert in the org>`. A count is a
    // disclosure: it tells the reader precisely how much is being withheld.
    const body = await (await listAlerts(req("/api/industrial/alerts"))).json();
    expect(body.total).toBe(1);
    expect(body.total).toBe(body.alerts.length);
  });

  it("a member of no site receives an empty list, not the organisation's", async () => {
    h.allowedSiteIds = [];
    const body = await (await listAlerts(req("/api/industrial/alerts"))).json();
    expect(body.alerts).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("?siteId= a site the caller does not hold returns nothing", async () => {
    const body = await (
      await listAlerts(req(`/api/industrial/alerts?siteId=${SITE_2}`))
    ).json();
    expect(body.alerts).toEqual([]);
  });

  it("?siteId= a site the caller does hold narrows to it", async () => {
    h.allowedSiteIds = [SITE_1, SITE_2];
    const body = await (
      await listAlerts(req(`/api/industrial/alerts?siteId=${SITE_2}`))
    ).json();
    expect(body.alerts.map((a: Row) => a.id)).toEqual(["al3"]);
  });

  it("a blank ?siteId= names no site and returns nothing", async () => {
    // Found by this phase's own adversarial pass: under a truthiness test the
    // empty string silently meant "no narrowing", so `?siteId=` returned every
    // permitted site while `?siteId=%20` returned none.
    const body = await (await listAlerts(req("/api/industrial/alerts?siteId="))).json();
    expect(body.alerts).toEqual([]);
  });

  it("never returns another organisation's alert", async () => {
    h.allowedSiteIds = [SITE_1, SITE_2];
    const body = await (await listAlerts(req("/api/industrial/alerts"))).json();
    expect(body.alerts.some((a: Row) => a.organizationId === ORG_B)).toBe(false);
  });

  it("an organisation API key keeps organisation scope — the documented contract", async () => {
    // Recorded, not assumed: an API key has no user and therefore no UserSite
    // rows. Every sibling industrial route behaves this way. Changing it is an
    // owner decision, flagged in the phase report, not a silent edit here.
    h.authMethod = "apikey";
    const body = await (await listAlerts(req("/api/industrial/alerts"))).json();
    expect(body.alerts.map((a: Row) => a.id).sort()).toEqual(["al1", "al3"]);
  });
});

/* ── GET /api/industrial/assets/[id]/alerts — IDOR ────────────────────────── */

describe("GET /api/industrial/assets/[id]/alerts", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("an asset in the caller's site is served", async () => {
    const res = await assetAlerts(req("/x"), params("a1"));
    expect(res.status).toBe(200);
    expect((await res.json()).alerts.map((a: Row) => a.id)).toEqual(["al1"]);
  });

  it("an asset in a site the caller does not hold answers 404, not 403", async () => {
    // 403 would confirm the asset id is real. That is site enumeration by
    // another name: an attacker walks ids and reads the status code.
    const res = await assetAlerts(req("/x"), params("a3"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Asset not found");
  });

  it("an asset that does not exist answers the SAME 404", async () => {
    const real = await assetAlerts(req("/x"), params("a3"));
    const fake = await assetAlerts(req("/x"), params("no-such-asset"));
    expect(real.status).toBe(fake.status);
    expect(await real.json()).toEqual(await fake.json());
  });

  it("another organisation's asset answers 404", async () => {
    const res = await assetAlerts(req("/x"), params("b1"));
    expect(res.status).toBe(404);
  });

  it("a member of no site gets 404 for their own organisation's asset", async () => {
    h.allowedSiteIds = [];
    expect((await assetAlerts(req("/x"), params("a1"))).status).toBe(404);
  });
});

/* ── PATCH .../alerts/[alertId] — the write ───────────────────────────────── */

describe("PATCH /api/industrial/assets/[id]/alerts/[alertId]", () => {
  const params = (id: string, alertId: string) => ({ params: Promise.resolve({ id, alertId }) });

  it("dismisses an alert in the caller's own site", async () => {
    const res = await dismiss(req("/x"), params("a1", "al1"));
    expect(res.status).toBe(200);
    expect(alerts.find((a) => a.id === "al1")!.dismissed).toBe(true);
  });

  it("refuses to dismiss another site's alert — and writes nothing", async () => {
    // The consequence is not an information leak, it is an operational one: a
    // silenced alarm on equipment the caller has no access to.
    const res = await dismiss(req("/x"), params("a3", "al3"));
    expect(res.status).toBe(404);
    expect(updates).toBe(0);
    expect(alerts.find((a) => a.id === "al3")!.dismissed).toBe(false);
  });

  it("the asset id in the path cannot be used to launder the alert id", async () => {
    // Pointing at an asset the caller DOES hold while naming an alert they do
    // not. The route resolves the alert's own asset, never the URL's.
    const res = await dismiss(req("/x"), params("a1", "al3"));
    expect(res.status).toBe(404);
    expect(alerts.find((a) => a.id === "al3")!.dismissed).toBe(false);
  });

  it("refuses another organisation's alert", async () => {
    const res = await dismiss(req("/x"), params("b1", "al4"));
    expect(res.status).toBe(404);
    expect(alerts.find((a) => a.id === "al4")!.dismissed).toBe(false);
  });

  it("a member of no site can dismiss nothing", async () => {
    h.allowedSiteIds = [];
    expect((await dismiss(req("/x"), params("a1", "al1"))).status).toBe(404);
    expect(updates).toBe(0);
  });
});

describe("loop 2 · the client cannot supply its own scope", () => {
  it("an allowedSiteIds query parameter is ignored entirely", async () => {
    // The scope is derived server-side from the caller's membership. If it were
    // ever read from the request, every control above would be decoration.
    const body = await (
      await listAlerts(
        req(`/api/industrial/alerts?allowedSiteIds=${SITE_2}&allowedSiteIds[]=${SITE_2}`),
      )
    ).json();
    expect(body.alerts.map((a: Row) => a.id)).toEqual(["al1"]);
  });

  it("a repeated ?siteId= resolves to the LAST value and is still checked", async () => {
    // URLSearchParams.get returns the first value; either way the answer has to
    // be checked against the permitted set rather than trusted.
    const body = await (
      await listAlerts(req(`/api/industrial/alerts?siteId=${SITE_1}&siteId=${SITE_2}`))
    ).json();
    expect(body.alerts.every((a: Row) => a.assetId === "a1")).toBe(true);
  });
});
