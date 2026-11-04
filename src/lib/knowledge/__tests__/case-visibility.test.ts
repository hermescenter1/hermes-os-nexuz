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
import type { CaseWriteTx } from "../case-visibility";
import {
  CaseScopeError,
  assertCaseScopeWritable,
  assertFailureModeWritable,
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

/** A fake client whose `$queryRaw` records exactly what it was asked and answers per statement kind. */
function fakeClient(opts: {
  ids?: string[];
  /** assetId → its CURRENT site (the rows the asset lock would return). */
  assets?: Record<string, string>;
  /** Sites that are ACTIVE in this organisation (the rows the site lock would return). */
  activeSites?: string[];
  /** Failure modes that exist in this organisation. */
  failureModes?: string[];
  cases?: Row[];
} = {}) {
  const raw: { text: string; values: unknown[] }[] = [];
  const created: Row[] = [];
  const updates: { where: Row; data: Row }[] = [];
  const cases = opts.cases ?? [];
  const assets = opts.assets ?? {};
  const activeSites = opts.activeSites ?? [SITE_A, SITE_B];
  const failureModes = opts.failureModes ?? [];
  const arr = (values: unknown[]): string[] => (values.find((v) => Array.isArray(v)) as string[] | undefined) ?? [];

  const client: CaseWriteTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      raw.push({ text, values });
      // Only a LOCK statement is answered from the lock fixtures; the authorising id query also joins
      // IndustrialAsset, so the lock clause — not the table name — decides which branch applies.
      const isLock = text.includes("FOR SHARE") || text.includes("FOR UPDATE");
      if (isLock && text.includes('"IndustrialAsset"')) {
        return arr(values).filter((id) => assets[id] !== undefined).sort().map((id) => ({ id, siteId: assets[id] }));
      }
      if (isLock && text.includes('"IndustrialSite"')) {
        return arr(values).filter((id) => activeSites.includes(id)).sort().map((id) => ({ id }));
      }
      if (isLock && text.includes('"IndustrialFailureMode"')) {
        return failureModes.includes(String(values[0])) ? [{ id: String(values[0]) }] : [];
      }
      if (text.includes("FOR UPDATE")) {   // the case row itself
        const row = cases.find((c) => c.id === values[0] && c.organizationId === values[1]);
        return row ? [{ siteId: row.siteId, assetId: row.assetId, failureModeId: row.failureModeId }] : [];
      }
      return (opts.ids ?? []).map((id) => ({ id }));
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    industrialEngineeringCase: {
      findMany: async (a: { where: { id: { in: string[] } } }) => cases.filter((c) => a.where.id.in.includes(String(c.id))),
      create: async (a: { data: Row }) => { const row = caseRow(`new-${created.length + 1}`, a.data); created.push(row); return row; },
      updateMany: async (a: { where: Row; data: Row }) => { updates.push(a); return { count: 1 }; },
      findFirst: async (a: { where: Row }) => cases.find((c) => c.id === a.where.id) ?? caseRow(String(a.where.id)),
    },
  };
  return { client, raw, created, updates, lockStatements: () => raw.map((r) => r.text) };
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

  /**
   * Independent review S3-07: the `CASE-ORG-WHERE` mutant (replace `WHERE c."organizationId" = ${...}`
   * with `WHERE TRUE`) survived every suite, because `loadVisibleCaseRows` re-pins the organisation on
   * its second read, so no row ever leaked. That made the FIRST predicate untested. These assertions
   * fail the moment the organisation predicate leaves the authorising statement — the layer that decides
   * which ids exist at all (the graph calls `listVisibleCaseIds` directly and never re-reads the rows).
   */
  it("the authorising statement itself pins the organisation on BOTH the case and the joined asset", async () => {
    const { client, raw } = fakeClient({ ids: ["c1"] });
    await listVisibleCaseIds(client, viewer);
    const { text, values } = raw[0];
    const flat = text.replace(/\s+/g, " ");
    // The case's own organisation predicate, bound as a parameter, in the statement that authorises.
    expect(flat).toContain(`WHERE c."organizationId" = ?`);
    // And the live asset is joined inside the SAME organisation (so a foreign asset cannot supply a site).
    expect(flat).toContain(`LEFT JOIN "IndustrialAsset" a ON a."id" = c."assetId" AND a."organizationId" = ?`);
    expect(flat).not.toContain("WHERE TRUE");
    // Exactly two organisation bindings (case + asset join), both equal to the scope's organisation.
    expect(values.filter((v) => v === ORG)).toHaveLength(2);
    expect(values[0]).toBe(ORG);
  });

  it("the ids the graph receives come from that same single statement — nothing re-filters them afterwards", async () => {
    // listVisibleCaseIds is what knowledge-graph/visibility.ts calls; its answer is used as-is.
    const { client } = fakeClient({ ids: ["from-sql-1", "from-sql-2"] });
    expect(await listVisibleCaseIds(client, viewer)).toEqual(["from-sql-1", "from-sql-2"]);
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

// ── the write-scope decision table (under the row locks) ─────────────────────

describe("assertCaseScopeWritable — the complete resulting scope, on locked values", () => {
  const assetIn = (siteId: string) => ({ "asset-1": siteId });

  it.each([
    ["OWNER/ADMIN may write an organisation-level case (no site, no asset)", admin, {}, {}, { siteId: null, assetId: null }],
    ["explicit nulls are the same as absent", admin, { siteId: null, assetId: null }, {}, { siteId: null, assetId: null }],
    ["a site the actor may read", viewer, { siteId: SITE_A }, {}, { siteId: SITE_A, assetId: null }],
    ["an asset in a readable site (site derived server side, not stored)", viewer, { assetId: "asset-1" }, assetIn(SITE_A), { siteId: null, assetId: "asset-1" }],
    ["site and asset that agree", viewer, { siteId: SITE_A, assetId: "asset-1" }, assetIn(SITE_A), { siteId: SITE_A, assetId: "asset-1" }],
  ] as const)("ACCEPTS %s", async (_n, scope, input, assets, expected) => {
    const { client } = fakeClient({ assets: { ...assets } });
    expect(await assertCaseScopeWritable(client, scope, input)).toEqual(expected);
  });

  it.each([
    ["a site-limited MANAGER/ENGINEER/VIEWER cannot write a site-less, asset-less case", viewer, {}, {}, [SITE_A, SITE_B], "ORG_LEVEL_FORBIDDEN"],
    ["a user with no site grant cannot either", noSite, { siteId: null, assetId: null }, {}, [SITE_A, SITE_B], "ORG_LEVEL_FORBIDDEN"],
    ["a site the actor may NOT read", viewer, { siteId: SITE_B }, {}, [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
    ["an unknown/foreign site (not in the actor's list)", viewer, { siteId: "site-unknown" }, {}, [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
    ["a site that is in the actor's list but NOT ACTIVE at lock time (E1: deactivated mid-request)", viewer, { siteId: SITE_A }, {}, [SITE_B], "SCOPE_NOT_FOUND"],
    ["an asset that does not exist in this organisation", viewer, { assetId: "asset-1" }, {}, [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
    ["an asset in a site the actor may not read", viewer, { assetId: "asset-1" }, assetIn(SITE_B), [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
    ["an asset whose CURRENT site is no longer ACTIVE (E1)", viewer, { assetId: "asset-1" }, assetIn(SITE_A), [SITE_B], "SCOPE_NOT_FOUND"],
    ["site and asset that disagree", admin, { siteId: SITE_A, assetId: "asset-1" }, assetIn(SITE_B), [SITE_A, SITE_B], "SCOPE_MISMATCH"],
    ["a non-string site", viewer, { siteId: 42 }, {}, [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
    ["an empty-string asset", viewer, { assetId: "" }, {}, [SITE_A, SITE_B], "SCOPE_NOT_FOUND"],
  ] as const)("REFUSES %s", async (_n, scope, input, assets, activeSites, code) => {
    const { client } = fakeClient({ assets: { ...assets }, activeSites: [...activeSites] });
    await expect(assertCaseScopeWritable(client, scope, input)).rejects.toMatchObject({ code });
  });

  it("locks the asset INSIDE the actor's organisation, then its site, both FOR SHARE and ordered by id", async () => {
    const { client, raw } = fakeClient({ assets: assetIn(SITE_A) });
    await assertCaseScopeWritable(client, viewer, { assetId: "asset-1" });
    expect(raw).toHaveLength(2);
    const [assetLock, siteLock] = raw;
    expect(assetLock.text).toMatch(/FROM "IndustrialAsset" a/);
    expect(assetLock.text).toMatch(/a\."organizationId" = \?/);
    expect(assetLock.text).toMatch(/ORDER BY a\."id"\s+FOR SHARE/);
    expect(assetLock.values).toEqual([ORG, ["asset-1"]]);
    expect(siteLock.text).toMatch(/FROM "IndustrialSite" s/);
    expect(siteLock.text).toMatch(/s\."status" = 'ACTIVE'/);
    expect(siteLock.text).toMatch(/ORDER BY s\."id"\s+FOR SHARE/);
    expect(siteLock.values).toEqual([ORG, [SITE_A]]);
    // No value is ever concatenated into the statement text.
    for (const r of raw) for (const v of [ORG, SITE_A, "asset-1"]) expect(r.text).not.toContain(v);
  });

  it("a foreign failureModeId is refused with its own one-answer refusal, and the lookup is organisation-scoped", async () => {
    const { client, raw } = fakeClient({ failureModes: ["fm-1"] });
    expect(await assertFailureModeWritable(client, ORG, "fm-1")).toBe("fm-1");
    expect(await assertFailureModeWritable(client, ORG, null)).toBeNull();
    expect(await assertFailureModeWritable(client, ORG, undefined)).toBeNull();
    await expect(assertFailureModeWritable(client, ORG, "fm-foreign")).rejects.toMatchObject({ code: "FAILURE_MODE_NOT_FOUND" });
    await expect(assertFailureModeWritable(client, ORG, 42)).rejects.toMatchObject({ code: "FAILURE_MODE_NOT_FOUND" });
    expect(raw[0].text).toMatch(/FROM "IndustrialFailureMode" f/);
    expect(raw[0].text).toMatch(/f\."organizationId" = \?/);
    expect(raw[0].text).toMatch(/FOR SHARE/);
    expect(caseScopeHttp("FAILURE_MODE_NOT_FOUND")).toEqual({ status: 404, error: "Failure mode not found" });
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
    const f = fakeClient({ assets: { "asset-1": SITE_A } });
    h.prisma = f.client;
    await createCase(viewer, { title: "t", siteId: SITE_A, assetId: "asset-1", ...( { organizationId: "attacker-org" } as object ) } as never);
    expect(f.created[0]).toMatchObject({ organizationId: ORG, siteId: SITE_A, assetId: "asset-1" });
    await createCase(admin, { title: "org-level" });
    expect(f.created[1]).toMatchObject({ organizationId: ORG, siteId: null, assetId: null });
  });

  it("createCase runs its locks and its insert inside ONE transaction (E1: no window between them)", async () => {
    const f = fakeClient({ assets: { "asset-1": SITE_A } });
    let inTx = 0;
    h.prisma = {
      ...f.client,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { inTx++; return fn(f.client); },
    };
    await createCase(viewer, { title: "t", assetId: "asset-1" });
    expect(inTx).toBe(1);
    expect(f.created).toHaveLength(1);
  });

  it("createCase without a transaction capability writes NOTHING and is logged (fail closed)", async () => {
    const f = fakeClient({ assets: { "asset-1": SITE_A } });
    h.prisma = { ...f.client, $transaction: undefined };
    expect(await createCase(viewer, { title: "t", assetId: "asset-1" })).toBeNull();
    expect(f.created).toHaveLength(0);
    expect(h.logged.length).toBe(1);
  });

  describe("updateCase validates the RESULTING scope", () => {
    const existing = caseRow("c1", { siteId: SITE_A, assetId: null });

    it("a case this actor cannot see is not found and nothing is written — whatever the patch contains", async () => {
      // The case row exists but sits on SITE_B, which this viewer may not read.
      const hidden = caseRow("c1", { siteId: SITE_B, assetId: null });
      const f = fakeClient({ cases: [hidden] });
      h.prisma = f.client;
      expect(await updateCase(viewer, "c1", { title: "x" })).toBeNull();
      expect(await updateCase(viewer, "c1", { siteId: SITE_A as never })).toBeNull();
      expect(await updateCase(viewer, "c1", { assetId: "asset-1" as never })).toBeNull();
      expect(f.updates).toHaveLength(0);
    });

    it("a case that does not exist in this organisation is the same answer", async () => {
      const f = fakeClient({ cases: [] });
      h.prisma = f.client;
      expect(await updateCase(viewer, "c1", { title: "x" })).toBeNull();
      expect(await updateCase(admin, "c1", { siteId: null as never, assetId: null as never })).toBeNull();
      expect(f.updates).toHaveLength(0);
      // Only the case-row lock ran: a missing case never triggers an asset or site lock.
      expect(f.raw.every((r) => r.text.includes("FOR UPDATE"))).toBe(true);
    });

    it("a site-limited actor cannot turn a site case into an organisation-level one (explicit or by clearing the site)", async () => {
      const f = fakeClient({ cases: [existing] });
      h.prisma = f.client;
      await expect(updateCase(viewer, "c1", { siteId: null as never, assetId: null as never })).rejects.toMatchObject({ code: "ORG_LEVEL_FORBIDDEN" });
      await expect(updateCase(viewer, "c1", { siteId: null as never })).rejects.toMatchObject({ code: "ORG_LEVEL_FORBIDDEN" });
      expect(f.updates).toHaveLength(0);
    });

    it("cannot move a case to a hidden/foreign/inactive site, nor create a site/asset disagreement", async () => {
      const f = fakeClient({ cases: [existing], assets: { "asset-9": SITE_B } });
      h.prisma = f.client;
      await expect(updateCase(viewer, "c1", { siteId: SITE_B as never })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
      await expect(updateCase(viewer, "c1", { assetId: "asset-9" as never })).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
      await expect(updateCase(admin, "c1", { assetId: "asset-9" as never })).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });   // site A kept, asset is in B
      expect(f.updates).toHaveLength(0);
    });

    it("E1: a case whose own site is no longer ACTIVE at lock time cannot be patched at all", async () => {
      const f = fakeClient({ cases: [existing], activeSites: [SITE_B] });
      h.prisma = f.client;
      expect(await updateCase(viewer, "c1", { title: "x" })).toBeNull();
      expect(f.updates).toHaveLength(0);
    });

    it("E1: a case whose ASSET has moved to a site the actor cannot read cannot be patched at all", async () => {
      const assetCase = caseRow("c2", { siteId: null, assetId: "asset-1" });
      const f = fakeClient({ cases: [assetCase], assets: { "asset-1": SITE_B } });
      h.prisma = f.client;
      expect(await updateCase(viewer, "c2", { title: "x" })).toBeNull();
      expect(f.updates).toHaveLength(0);
    });

    it("a patch that does not touch the scope still locks the case's CURRENT references, and the write is pinned", async () => {
      const f = fakeClient({ cases: [existing] });
      h.prisma = f.client;
      await updateCase(viewer, "c1", { title: "renamed", ...( { organizationId: "attacker-org", siteId: undefined } as object ) } as never);
      expect(f.updates[0].where).toEqual({ id: "c1", organizationId: ORG, siteId: SITE_A, assetId: null });
      expect(f.updates[0].data).not.toHaveProperty("organizationId");
      expect(f.updates[0].data).not.toHaveProperty("siteId");
      // case row FOR UPDATE, then the site that decides it (no asset on this case).
      expect(f.raw[0].text).toMatch(/FOR UPDATE/);
      expect(f.raw.some((r) => r.text.includes('"IndustrialSite"'))).toBe(true);
    });

    it("an OWNER/ADMIN may legitimately publish a case at organisation level", async () => {
      const f = fakeClient({ cases: [existing] });
      h.prisma = f.client;
      await updateCase(admin, "c1", { siteId: null as never, assetId: null as never });
      expect(f.updates[0].data).toMatchObject({ siteId: null, assetId: null });
    });
  });
});
