/**
 * RV-01 corrective remediation — the shared engineering-case visibility policy and the case
 * write guards, WITHOUT a database. The SQL itself is proven against real PostgreSQL in
 * `src/lib/knowledge-graph/__tests__/pg/rv01-knowledge-cases.pg.test.ts`; here we pin what the
 * unit level can: how the query is parameterised, the complete write-scope decision table, the
 * public error mapping, and that create/update validate the RESULTING scope before writing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: null as null | Record<string, unknown>,
  visibleRows: [] as Record<string, unknown>[],
  logged: [] as unknown[],
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.prisma }));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { h.logged.push(a); } }));
vi.mock("@/lib/audit/audit-service", () => ({ recordAuditEvent: () => undefined, KNOWLEDGE_AUDIT: { ENGINEERING_CASE_CREATED: "x" } }));

import { createGraphViewerScope } from "@/lib/knowledge-graph/visibility";
import {
  CaseScopeError,
  assertCaseScopeWritable,
  caseScopeHttp,
  listVisibleCaseIds,
  loadVisibleCaseRows,
  MAX_VISIBLE_CASE_IDS,
} from "../case-visibility";
import { createCase, getCase, listCases, updateCase } from "../cases";

const ORG = "org-1";
const SITE_A = "site-a";
const SITE_B = "site-b";
const viewer = createGraphViewerScope(ORG, [SITE_A], false);
const admin = createGraphViewerScope(ORG, [SITE_A, SITE_B], true);
const noSite = createGraphViewerScope(ORG, [], false);

type Row = Record<string, unknown>;
const ISO = "2026-01-01T00:00:00.000Z";
const caseRow = (id: string, over: Row = {}): Row => ({
  id, organizationId: ORG, title: `Case ${id}`, titleNorm: `case ${id}`, symptoms: [], diagnosis: null, resolution: null,
  lessonsLearned: null, assetTypes: [], assetId: null, siteId: SITE_A, failureModeId: null, keywords: [], status: "open",
  severity: "MEDIUM", reportedById: null, resolvedAt: null, createdAt: ISO, updatedAt: ISO, ...over,
});

/** A fake client whose `$queryRaw` records exactly what it was asked and answers with `ids`. */
function fakeClient(opts: { ids?: string[]; assets?: Row[]; cases?: Row[] } = {}) {
  const raw: { text: string; values: unknown[] }[] = [];
  const created: Row[] = [];
  const updates: { where: Row; data: Row }[] = [];
  const assetQueries: Row[] = [];
  const cases = opts.cases ?? [];
  const client: Record<string, unknown> = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      raw.push({ text: strings.join("?"), values });
      return (opts.ids ?? []).map((id) => ({ id }));
    },
    industrialAsset: { findMany: async (a: Row) => { assetQueries.push(a); return opts.assets ?? []; } },
    industrialEngineeringCase: {
      findMany: async (a: { where: { id: { in: string[] } } }) => cases.filter((c) => a.where.id.in.includes(String(c.id))),
      create: async (a: { data: Row }) => { const row = caseRow(`new-${created.length + 1}`, a.data); created.push(row); return row; },
      updateMany: async (a: { where: Row; data: Row }) => { updates.push(a); return { count: 1 }; },
      findFirst: async () => null,
    },
  };
  return { client, raw, created, updates, assetQueries };
}

beforeEach(() => { h.prisma = null; h.logged = []; });

// ── the query ────────────────────────────────────────────────────────────────

describe("listVisibleCaseIds — one parameterised query", () => {
  it("binds every value as a parameter; no scope or filter value is ever concatenated into the SQL text", async () => {
    const { client, raw } = fakeClient({ ids: ["c1", "c2"] });
    const ids = await listVisibleCaseIds(client, viewer, { id: "x'; DROP TABLE y;--", status: "open", assetId: "a1", failureModeIds: ["f1"], limit: 7 });
    expect(ids).toEqual(["c1", "c2"]);
    const { text, values } = raw[0];
    for (const v of [ORG, SITE_A, "x'; DROP TABLE y;--", "open", "a1", "f1"]) expect(text).not.toContain(String(v));
    expect(values).toContain(ORG);
    expect(values.some((v) => Array.isArray(v) && v.includes(SITE_A))).toBe(true);
    expect(values).toContain(false);                                   // organizationLevelAccess for a site-limited viewer
    expect(values).toContain(7);                                       // the LIMIT is a bound number
    expect(text).toMatch(/"organizationId"\s*=\s*\?/);                 // organisation predicate is inside the query
    expect(text).toMatch(/LEFT JOIN "IndustrialAsset" a/);             // site is derived from the LIVE asset
    expect(text).toMatch(/ORDER BY c\."updatedAt" DESC, c\."id" ASC/);
  });

  it("an organisation-level case (no site, no asset) is gated by the OWNER/ADMIN flag, never by the member's site list", async () => {
    const a = fakeClient({ ids: [] });
    await listVisibleCaseIds(a.client, admin);
    await listVisibleCaseIds(a.client, viewer);
    await listVisibleCaseIds(a.client, noSite);
    expect(a.raw.map((r) => r.values.filter((v) => typeof v === "boolean")[0])).toEqual([true, false, false]);
    expect(a.raw[2].values.some((v) => Array.isArray(v) && v.length === 0)).toBe(true);   // empty site list stays empty (fail closed)
  });

  it("the limit is clamped; an empty failure-mode filter short-circuits to nothing without a query", async () => {
    const { client, raw } = fakeClient({ ids: [] });
    await listVisibleCaseIds(client, viewer, { limit: 10_000_000 });
    await listVisibleCaseIds(client, viewer, { limit: -5 });
    await listVisibleCaseIds(client, viewer, { limit: Number.NaN });
    expect(raw.map((r) => r.values.at(-1))).toEqual([MAX_VISIBLE_CASE_IDS, 1, 50]);
    expect(await listVisibleCaseIds(client, viewer, { failureModeIds: [] })).toEqual([]);
    expect(raw).toHaveLength(3);
  });

  it("without a raw-query capability it throws (callers fail closed) rather than returning everything", async () => {
    await expect(listVisibleCaseIds({}, viewer)).rejects.toThrow("CASE_VISIBILITY_QUERY_UNAVAILABLE");
  });

  it("loadVisibleCaseRows re-reads only the authorised ids, inside the organisation, and keeps the policy's order", async () => {
    const c1 = caseRow("c1"); const c2 = caseRow("c2"); const hidden = caseRow("hidden");
    const { client } = fakeClient({ ids: ["c2", "c1"], cases: [c1, c2, hidden] });
    const rows = await loadVisibleCaseRows(client, viewer);
    expect(rows.map((r) => r.id)).toEqual(["c2", "c1"]);
  });
});

// ── the write-scope decision table ───────────────────────────────────────────

describe("assertCaseScopeWritable — the complete resulting scope", () => {
  const assetIn = (siteId: string): Row[] => [{ id: "asset-1", siteId }];

  it.each([
    ["OWNER/ADMIN may write an organisation-level case (no site, no asset)", admin, {}, [], { siteId: null, assetId: null }],
    ["explicit nulls are the same as absent", admin, { siteId: null, assetId: null }, [], { siteId: null, assetId: null }],
    ["a site the actor may read", viewer, { siteId: SITE_A }, [], { siteId: SITE_A, assetId: null }],
    ["an asset in a readable site (site derived server side, not stored)", viewer, { assetId: "asset-1" }, assetIn(SITE_A), { siteId: null, assetId: "asset-1" }],
    ["site and asset that agree", viewer, { siteId: SITE_A, assetId: "asset-1" }, assetIn(SITE_A), { siteId: SITE_A, assetId: "asset-1" }],
  ] as const)("ACCEPTS %s", async (_n, scope, input, assets, expected) => {
    const { client } = fakeClient({ assets: [...assets] });
    expect(await assertCaseScopeWritable(client, scope, input)).toEqual(expected);
  });

  it.each([
    ["a site-limited MANAGER/ENGINEER/VIEWER cannot write a site-less, asset-less case", viewer, {}, [], "ORG_LEVEL_FORBIDDEN"],
    ["a user with no site grant cannot either", noSite, { siteId: null, assetId: null }, [], "ORG_LEVEL_FORBIDDEN"],
    ["a site the actor may NOT read", viewer, { siteId: SITE_B }, [], "SCOPE_NOT_FOUND"],
    ["an unknown/foreign/inactive site (not in the actor's active list)", viewer, { siteId: "site-unknown" }, [], "SCOPE_NOT_FOUND"],
    ["an asset that does not exist in this organisation", viewer, { assetId: "asset-1" }, [], "SCOPE_NOT_FOUND"],
    ["an asset in a site the actor may not read", viewer, { assetId: "asset-1" }, assetIn(SITE_B), "SCOPE_NOT_FOUND"],
    ["site and asset that disagree", admin, { siteId: SITE_A, assetId: "asset-1" }, assetIn(SITE_B), "SCOPE_MISMATCH"],
    ["a non-string site", viewer, { siteId: 42 }, [], "SCOPE_NOT_FOUND"],
    ["an empty-string asset", viewer, { assetId: "" }, [], "SCOPE_NOT_FOUND"],
  ] as const)("REFUSES %s", async (_n, scope, input, assets, code) => {
    const { client } = fakeClient({ assets: [...assets] });
    await expect(assertCaseScopeWritable(client, scope, input)).rejects.toMatchObject({ code });
  });

  it("the asset is looked up INSIDE the actor's organisation (a foreign asset id cannot be borrowed)", async () => {
    const { client, assetQueries } = fakeClient({ assets: assetIn(SITE_A) });
    await assertCaseScopeWritable(client, viewer, { assetId: "asset-1" });
    expect(assetQueries[0].where).toEqual({ id: "asset-1", organizationId: ORG });
  });

  it("hidden/foreign/nonexistent references share ONE public answer; the others only describe what the actor already sees", () => {
    expect(caseScopeHttp("SCOPE_NOT_FOUND")).toEqual({ status: 404, error: "Site or asset not found" });
    expect(caseScopeHttp("SCOPE_MISMATCH").status).toBe(400);
    expect(caseScopeHttp("ORG_LEVEL_FORBIDDEN").status).toBe(403);
    expect(new CaseScopeError("SCOPE_NOT_FOUND")).toBeInstanceOf(Error);
  });
});

// ── the service: reads and writes go through the policy ──────────────────────

describe("cases service", () => {
  it("getCase answers null for a hidden id, a foreign id and a missing id alike", async () => {
    const { client } = fakeClient({ ids: [] });
    h.prisma = client;
    expect(await getCase(viewer, "hidden")).toBeNull();
    expect(await getCase(viewer, "other-org")).toBeNull();
    expect(await getCase(viewer, "missing")).toBeNull();
  });

  it("a database error while reading answers with an EMPTY result (fail closed), is logged, and never returns rows", async () => {
    h.prisma = { $queryRaw: async () => { throw new Error("connection lost"); } };
    expect(await listCases(viewer)).toEqual([]);
    expect(await getCase(viewer, "c1")).toBeNull();
    expect(h.logged.length).toBe(2);
  });

  it("createCase validates BEFORE writing: a site-limited actor cannot create a site-less case", async () => {
    const f = fakeClient();
    h.prisma = f.client;
    await expect(createCase(viewer, { title: "t" })).rejects.toMatchObject({ code: "ORG_LEVEL_FORBIDDEN" });
    await expect(createCase(viewer, { title: "t", siteId: SITE_B })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
    await expect(createCase(viewer, { title: "t", siteId: SITE_A, assetId: "asset-1" })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
    expect(f.created).toHaveLength(0);                                  // nothing was written by any refused call
  });

  it("createCase stores the VALIDATED scope and the server-side organisation, not raw client fields", async () => {
    const f = fakeClient({ assets: [{ id: "asset-1", siteId: SITE_A }] });
    h.prisma = f.client;
    await createCase(viewer, { title: "t", siteId: SITE_A, assetId: "asset-1", ...( { organizationId: "attacker-org" } as object ) } as never);
    expect(f.created[0]).toMatchObject({ organizationId: ORG, siteId: SITE_A, assetId: "asset-1" });
    await createCase(admin, { title: "org-level" });
    expect(f.created[1]).toMatchObject({ organizationId: ORG, siteId: null, assetId: null });
  });

  describe("updateCase validates the RESULTING scope", () => {
    const existing = caseRow("c1", { siteId: SITE_A, assetId: null });

    it("a hidden case is not found and nothing is written — whatever the patch contains", async () => {
      const f = fakeClient({ ids: [], cases: [] });
      h.prisma = f.client;
      expect(await updateCase(viewer, "c1", { title: "x" })).toBeNull();
      // a patch that touches the scope must NOT throw a scope error or look at assets: a hidden case answers like a missing one
      expect(await updateCase(viewer, "c1", { siteId: SITE_A as never })).toBeNull();
      expect(await updateCase(viewer, "c1", { assetId: "asset-1" as never })).toBeNull();
      expect(await updateCase(admin, "c1", { siteId: null as never, assetId: null as never })).toBeNull();
      expect(f.assetQueries).toHaveLength(0);
      expect(f.updates).toHaveLength(0);
    });

    it("a site-limited actor cannot turn a site case into an organisation-level one (explicit or by clearing the site)", async () => {
      const f = fakeClient({ ids: ["c1"], cases: [existing] });
      h.prisma = f.client;
      await expect(updateCase(viewer, "c1", { siteId: null as never, assetId: null as never })).rejects.toMatchObject({ code: "ORG_LEVEL_FORBIDDEN" });
      await expect(updateCase(viewer, "c1", { siteId: null as never })).rejects.toMatchObject({ code: "ORG_LEVEL_FORBIDDEN" });
      expect(f.updates).toHaveLength(0);
    });

    it("cannot move a case to a hidden/foreign/inactive site, nor create a site/asset disagreement", async () => {
      const f = fakeClient({ ids: ["c1"], cases: [existing], assets: [{ id: "asset-9", siteId: SITE_B }] });
      h.prisma = f.client;
      await expect(updateCase(viewer, "c1", { siteId: SITE_B as never })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
      await expect(updateCase(viewer, "c1", { assetId: "asset-9" as never })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
      await expect(updateCase(admin, "c1", { assetId: "asset-9" as never })).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });   // site A kept, asset is in B
      expect(f.updates).toHaveLength(0);
    });

    it("a patch that does not touch the scope performs no asset lookup, and the write is pinned to the validated scope", async () => {
      const f = fakeClient({ ids: ["c1"], cases: [existing] });
      h.prisma = f.client;
      await updateCase(viewer, "c1", { title: "renamed", ...( { organizationId: "attacker-org", siteId: undefined } as object ) } as never);
      expect(f.assetQueries).toHaveLength(0);
      expect(f.updates[0].where).toEqual({ id: "c1", organizationId: ORG, siteId: SITE_A, assetId: null });
      expect(f.updates[0].data).not.toHaveProperty("organizationId");
      expect(f.updates[0].data).not.toHaveProperty("siteId");
    });

    it("an OWNER/ADMIN may legitimately publish a case at organisation level", async () => {
      const f = fakeClient({ ids: ["c1"], cases: [existing] });
      h.prisma = f.client;
      await updateCase(admin, "c1", { siteId: null as never, assetId: null as never });
      expect(f.updates[0].data).toMatchObject({ siteId: null, assetId: null });
    });
  });
});
