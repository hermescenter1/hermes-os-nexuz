/**
 * PHASE 109-C-UI.2-R1 — F-02: alerts must be site-scoped, not merely
 * organisation-scoped.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FAKE DATABASE HONOURS `where`
 * ─────────────────────────────────────────────────────────────────────────────
 * A stub that ignores the `where` clause and returns a hand-picked array proves
 * only that the author knew the answer. Every assertion below would pass against
 * a library with NO predicate at all.
 *
 * So the fake here is a small query engine: it applies `organizationId`,
 * `siteId`, `assetId`, `id`, `dismissed` and `alertType`, including the
 * `{ in: [...] }` form, and it applies `take` AFTER filtering — exactly where a
 * database applies it. If the library stops constraining the query, these tests
 * see the extra rows and fail.
 *
 * The dataset is deliberately hostile: two sites in one organisation, a second
 * organisation, and an alert whose asset row does not exist at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── the fake ─────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

interface Query {
  where?: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: unknown;
  take?: number;
}

/** Supports scalar equality and `{ in: [...] }` — the two forms this code uses. */
function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    const value = row[field];
    if (cond !== null && typeof cond === "object" && "in" in (cond as object)) {
      const list = (cond as { in: unknown[] }).in;
      // A real IN () with an empty list matches nothing.
      if (!Array.isArray(list) || !list.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

/** Every query the library issues, so the SHAPE of the predicate is assertable. */
const issued: { model: string; op: string; query: Query }[] = [];

function model(name: string, rows: () => Row[]) {
  return {
    findMany: async (q: Query) => {
      issued.push({ model: name, op: "findMany", query: q });
      const hit = rows().filter((r) => matches(r, q.where));
      return typeof q.take === "number" ? hit.slice(0, q.take) : hit;
    },
    findFirst: async (q: Query) => {
      issued.push({ model: name, op: "findFirst", query: q });
      return rows().find((r) => matches(r, q.where)) ?? null;
    },
    update: async (q: { where: { id: string }; data: Row }) => {
      issued.push({ model: name, op: "update", query: q as unknown as Query });
      const row = rows().find((r) => r.id === q.where.id);
      if (!row) throw new Error("update on a row that does not exist");
      Object.assign(row, q.data);
      return row;
    },
  };
}

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-1";
const SITE_2 = "site-2";
const SITE_B = "site-b";

let assets: Row[] = [];
let alerts: Row[] = [];

const db = {
  industrialAsset: model("industrialAsset", () => assets),
  assetAlert: model("assetAlert", () => alerts),
};

vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));

const { getOrgAlerts, getAssetAlerts, dismissAlert } = await import("@/lib/industrial/alerts");

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

beforeEach(() => {
  issued.length = 0;
  assets = [
    { id: "a1", organizationId: ORG_A, siteId: SITE_1 },
    { id: "a2", organizationId: ORG_A, siteId: SITE_1 },
    { id: "a3", organizationId: ORG_A, siteId: SITE_2 },
    { id: "b1", organizationId: ORG_B, siteId: SITE_B },
  ];
  alerts = [
    alert("al1", ORG_A, "a1"),
    alert("al2", ORG_A, "a2"),
    alert("al3", ORG_A, "a3"),
    alert("al4", ORG_B, "b1"),
    // An alert claiming organisation B while pointing at organisation A's asset.
    // Corrupt or crafted, it exists to prove the organisation predicate on the
    // ALERT query is load-bearing and not merely implied by the asset lookup.
    alert("al6", ORG_B, "a1"),
    // An alert whose asset row does not exist. Real data contains these after a
    // deletion, and "we cannot tell which site this belongs to" must resolve to
    // "not yours", never to "everyone's".
    alert("al5", ORG_A, "ghost-asset"),
  ];
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/* ── the baseline the fix has to beat ─────────────────────────────────────── */

describe("F-02 · the organisation-only behaviour, stated as a fact", () => {
  it("an organisation credential still sees the whole organisation", () => {
    // NOT the defect — this is the documented contract for an API key, which has
    // no user and therefore no UserSite rows. It is pinned so that a future
    // change to it has to be deliberate.
    return getOrgAlerts(ORG_A).then((rows) => {
      expect(ids(rows)).toEqual(["al1", "al2", "al3", "al5"]);
    });
  });
});

/* ── organisation × site ──────────────────────────────────────────────────── */

describe("F-02 · getOrgAlerts is scoped to the caller's sites", () => {
  it("a site-1 reader sees site 1 only — site 2 never appears", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    expect(ids(rows)).toEqual(["al1", "al2"]);
    expect(rows.some((r) => r.assetId === "a3")).toBe(false);
  });

  it("the site predicate is in the QUERY, not applied afterwards", async () => {
    // The distinction is not academic: `take: 200` and every count downstream
    // are computed by the database. Filtering after the fact leaves them
    // counting another site's rows.
    await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    const alertQuery = issued.find((q) => q.model === "assetAlert" && q.op === "findMany");
    expect(alertQuery, "no alert query was issued").toBeTruthy();
    expect(alertQuery!.query.where?.organizationId).toBe(ORG_A);
    expect(alertQuery!.query.where?.assetId).toEqual({ in: ["a1", "a2"] });
  });

  it("the asset lookup is itself organisation-scoped", async () => {
    await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    const assetQuery = issued.find((q) => q.model === "industrialAsset");
    expect(assetQuery!.query.where?.organizationId).toBe(ORG_A);
    expect(assetQuery!.query.where?.siteId).toEqual({ in: [SITE_1] });
  });

  it("a reader of both sites sees both, and still not the other organisation", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_2] });
    expect(ids(rows)).toEqual(["al1", "al2", "al3"]);
  });

  it("an alert whose asset no longer exists is not attributable, so it is not shown", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_2] });
    expect(rows.some((r) => r.id === "al5")).toBe(false);
  });
});

describe("F-02 · cross-tenant", () => {
  it("organisation B holding a VALID site id of organisation A gets nothing", async () => {
    // The site id is real. It is simply not theirs. The organisation predicate
    // on the ASSET lookup is what stops this, before any alert is touched.
    const rows = await getOrgAlerts(ORG_B, { allowedSiteIds: [SITE_1] });
    expect(rows).toEqual([]);
  });

  it("an alert claiming another organisation is excluded even when its asset IS in scope", async () => {
    // Two independent predicates: the asset lookup scopes by organisation, and
    // so does the alert query. Either one alone would pass the simpler tests;
    // this is the one that fails if the second is dropped.
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    expect(rows.some((r) => r.id === "al6")).toBe(false);
  });

  it("and organisation B cannot reach it through organisation A's site either", async () => {
    const rows = await getOrgAlerts(ORG_B, { allowedSiteIds: [SITE_1] });
    expect(rows.some((r) => r.id === "al6")).toBe(false);
  });

  it("organisation A never receives organisation B's alert", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_2] });
    expect(rows.some((r) => r.organizationId === ORG_B)).toBe(false);
  });
});

describe("F-02 · fail-closed", () => {
  it("no accessible site means no rows — and no database query at all", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [] });
    expect(rows).toEqual([]);
    // Refusing before the query is the difference between a boundary and a
    // filter. There is nothing to get wrong downstream if nothing was read.
    expect(issued).toHaveLength(0);
  });

  it("an empty site list is never widened to the organisation", async () => {
    const scoped = await getOrgAlerts(ORG_A, { allowedSiteIds: [] });
    const orgWide = await getOrgAlerts(ORG_A);
    expect(scoped).toHaveLength(0);
    expect(orgWide.length).toBeGreaterThan(0);
  });
});

describe("F-02 · a requested site narrows, it never replaces", () => {
  it("asking for a site inside the permitted set narrows to it", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_2], siteId: SITE_2 });
    expect(ids(rows)).toEqual(["al3"]);
  });

  it("asking for a site OUTSIDE the permitted set returns nothing", async () => {
    // The Phase 99.5 lesson (P99-INT-014), re-applied: a requested site that is
    // not permitted is a request for nothing, not a reason to fall back to
    // everything the caller may see.
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1], siteId: SITE_2 });
    expect(rows).toEqual([]);
  });

  it("asking for another organisation's site returns nothing", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1], siteId: SITE_B });
    expect(rows).toEqual([]);
  });

  it("an organisation credential asking for a foreign site gets nothing", async () => {
    // No allow-list to narrow, so the organisation predicate on the asset lookup
    // is the only thing standing here. It holds.
    const rows = await getOrgAlerts(ORG_A, { siteId: SITE_B });
    expect(rows).toEqual([]);
  });
});

describe("F-02 · malformed and duplicate scope", () => {
  it.each(["", "   ", "'; DROP TABLE AssetAlert; --", "../site-2", "site-2 "])(
    "a malformed site id %j yields nothing",
    async (bad) => {
      const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1], siteId: bad });
      expect(rows).toEqual([]);
    },
  );

  it("a duplicated site id changes nothing — no duplicate rows, no widening", async () => {
    const once = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    const twice = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_1, SITE_1] });
    expect(ids(twice)).toEqual(ids(once));
  });

  it("a permitted set containing a foreign site grants only the permitted part", async () => {
    // A corrupt or stale allow-list must not become an escalation.
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1, SITE_B] });
    expect(ids(rows)).toEqual(["al1", "al2"]);
  });
});

describe("F-02 · counts and pagination are site-scoped", () => {
  it("the scoped count is smaller than the organisation count, and that is the point", async () => {
    const scoped = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    const orgWide = await getOrgAlerts(ORG_A);
    expect(scoped.length).toBe(2);
    expect(orgWide.length).toBe(4);
    // The route derives `total` from the same array it returns, so a caller can
    // never be told there are four alerts while being shown two.
    expect(scoped.length).toBeLessThan(orgWide.length);
  });

  it("`take` is applied by the database to the already-scoped set", async () => {
    await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    const alertQuery = issued.find((q) => q.model === "assetAlert" && q.op === "findMany")!;
    expect(alertQuery.query.take).toBe(200);
    expect(alertQuery.query.where?.assetId).toBeTruthy();
  });
});

/* ── the per-asset read: IDOR ─────────────────────────────────────────────── */

describe("F-02 · getAssetAlerts — knowing an asset id is not a permission", () => {
  it("an asset in site 2 is refused to a site-1 reader", async () => {
    const rows = await getAssetAlerts("a3", ORG_A, { allowedSiteIds: [SITE_1] });
    expect(rows).toEqual([]);
  });

  it("an asset in the reader's own site is returned", async () => {
    const rows = await getAssetAlerts("a1", ORG_A, { allowedSiteIds: [SITE_1] });
    expect(ids(rows)).toEqual(["al1"]);
  });

  it("another organisation's asset is refused even with the exact id", async () => {
    const rows = await getAssetAlerts("b1", ORG_A, { allowedSiteIds: [SITE_1] });
    expect(rows).toEqual([]);
  });

  it("no accessible site means no rows", async () => {
    expect(await getAssetAlerts("a1", ORG_A, { allowedSiteIds: [] })).toEqual([]);
  });

  it("a refusal never reads the alert table — nothing to leak, nothing to time", async () => {
    await getAssetAlerts("a3", ORG_A, { allowedSiteIds: [SITE_1] });
    expect(issued.some((q) => q.model === "assetAlert")).toBe(false);
  });
});

/* ── the write: the one that silences alarms ──────────────────────────────── */

describe("F-02 · dismissAlert — the write path", () => {
  it("a site-1 reader cannot dismiss a site-2 alert", async () => {
    const result = await dismissAlert("al3", ORG_A, "user-1", { allowedSiteIds: [SITE_1] });
    expect(result).toBeNull();
  });

  it("the refusal performs NO update — the alarm stays raised", async () => {
    await dismissAlert("al3", ORG_A, "user-1", { allowedSiteIds: [SITE_1] });
    expect(issued.some((q) => q.op === "update")).toBe(false);
    expect(alerts.find((a) => a.id === "al3")!.dismissed).toBe(false);
  });

  it("the refusal is indistinguishable from a missing alert", async () => {
    // Both return null, so the route answers 404 for both. A 403 here would
    // confirm the alert exists, which is exactly the disclosure being prevented.
    const outOfScope = await dismissAlert("al3", ORG_A, "user-1", { allowedSiteIds: [SITE_1] });
    const nonExistent = await dismissAlert("no-such-alert", ORG_A, "user-1", {
      allowedSiteIds: [SITE_1],
    });
    expect(outOfScope).toBeNull();
    expect(nonExistent).toBeNull();
  });

  it("a reader dismisses their own site's alert normally", async () => {
    const result = await dismissAlert("al1", ORG_A, "user-1", { allowedSiteIds: [SITE_1] });
    expect(result?.id).toBe("al1");
    expect(result?.dismissed).toBe(true);
    expect(result?.dismissedBy).toBe("user-1");
  });

  it("another organisation cannot dismiss the alert even with its exact id", async () => {
    const result = await dismissAlert("al1", ORG_B, "user-b", { allowedSiteIds: [SITE_B] });
    expect(result).toBeNull();
    expect(alerts.find((a) => a.id === "al1")!.dismissed).toBe(false);
  });

  it("an alert whose asset row is gone cannot be dismissed by a scoped caller", async () => {
    const result = await dismissAlert("al5", ORG_A, "user-1", { allowedSiteIds: [SITE_1, SITE_2] });
    expect(result).toBeNull();
  });

  it("no accessible site means no write", async () => {
    const result = await dismissAlert("al1", ORG_A, "user-1", { allowedSiteIds: [] });
    expect(result).toBeNull();
    expect(alerts.find((a) => a.id === "al1")!.dismissed).toBe(false);
  });
});

describe("F-02 loop 2 · the site scope composes with the other filters", () => {
  /*
    A new predicate that quietly disables the existing ones is its own defect.
    These pin that `alertType`, `dismissed` and the site scope are all applied
    together, in the query, rather than one replacing another.
  */
  beforeEach(() => {
    alerts.push({ ...alert("al7", ORG_A, "a1"), dismissed: true });
    alerts.push({ ...alert("al8", ORG_A, "a1"), alertType: "HEALTH_DEGRADATION" });
    alerts.push({ ...alert("al9", ORG_A, "a3"), alertType: "HEALTH_DEGRADATION" });
  });

  it("dismissed alerts stay hidden by default, inside the site scope", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1] });
    expect(rows.some((r) => r.id === "al7")).toBe(false);
  });

  it("includeDismissed widens the TYPE of row, never the set of sites", async () => {
    const rows = await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1], includeDismissed: true });
    expect(rows.some((r) => r.id === "al7")).toBe(true);
    expect(rows.some((r) => r.assetId === "a3")).toBe(false);
  });

  it("an alertType filter narrows within the site scope and cannot escape it", async () => {
    const rows = await getOrgAlerts(ORG_A, {
      allowedSiteIds: [SITE_1],
      alertType: "HEALTH_DEGRADATION",
    });
    // al8 is site 1; al9 is the same type in site 2 and must not appear.
    expect(ids(rows)).toEqual(["al8"]);
  });

  it("all three predicates reach the database together", async () => {
    await getOrgAlerts(ORG_A, { allowedSiteIds: [SITE_1], alertType: "CRITICAL_RISK" });
    const q = issued.find((x) => x.model === "assetAlert" && x.op === "findMany")!.query.where!;
    expect(q.organizationId).toBe(ORG_A);
    expect(q.alertType).toBe("CRITICAL_RISK");
    expect(q.dismissed).toBe(false);
    expect(q.assetId).toEqual({ in: ["a1", "a2"] });
  });
});
