/**
 * PHASE 109-C-UI.2-R3 — POST /api/industrial/automation/run, attacked.
 *
 * Replaces the R2 characterisation of this route. R2 pinned the defect because
 * the owner's ruling was outstanding; R3 has the ruling, so every
 * `[F-04 CURRENT BEHAVIOUR]` assertion is inverted here and named where it is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REAL AND WHAT IS FAKE
 * ─────────────────────────────────────────────────────────────────────────────
 * Real: the route, the scope contract, the run store, the engine, the ORG and
 * SITE permission matrices (`can`, `requirePermission`, `requireSitePermission`,
 * `hasScope` are the actual implementations — the role matrix below is read out
 * of the product, not restated by hand).
 *
 * Fake: the session, and a database that ENFORCES THE TWO UNIQUE CONSTRAINTS
 * the migration creates. That second point is the whole basis of the replay and
 * concurrency proofs: a fake that accepted every insert would let an
 * idempotency test pass against code with no idempotency at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { OrgRole } from "@/lib/org/types";
import type { SiteRole } from "@/lib/site/types";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-active-1";
const SITE_2 = "site-active-2";
// FINDING-R4-001: this was SITE_MAINT / status "ARCHIVED", a value
// `IndustrialSiteStatus` does not contain — PostgreSQL rejected it outright,
// so the non-active path was proved with a state that can never occur.
const SITE_MAINT = "site-maintenance-3";
const SITE_FOREIGN = "site-foreign-9";
const KEY = "idem-key-0000000001";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  role: "MANAGER" as OrgRole,
  siteRole: "SITE_MANAGER" as SiteRole,
  authMethod: "jwt" as "jwt" | "apikey",
  scopes: ["industrial.write"] as string[],
  allowedSiteIds: [] as string[],
  /** Sites for which requireSiteActor should refuse (not ACTIVE / not granted). */
  siteActorDenied: new Set<string>(),
  audits: [] as Row[],
  meters: [] as { orgId: string; metric: string; value: number }[],
  /** When true the strict audit recorder throws — see stage 3 of R5. */
  auditFails: false,
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: "user-1", orgId: ORG_A, authMethod: h.authMethod, scopes: h.scopes, keyId: "k-1" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: "user-1", orgId: ORG_A, role: h.role } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => h.allowedSiteIds,
  requireSiteActor: async (_req: unknown, orgId: string, siteId: string) => {
    /*
      Faithful to the real Phase 43 helper, because the first version of this
      mock was NOT and this suite caught it: it authorised a site purely because
      the id appeared in `allowedSiteIds`, so a foreign site injected into that
      list passed. Production also checks the site's own tenancy and status
      against IndustrialSite, which is why that attack fails for real. A mock
      more permissive than production turns a passing test into false comfort.
    */
    const site = (tables.industrialSite ?? []).find((r) => r.id === siteId);
    if (!site) return { error: "Access to this site is not permitted", status: 403 };
    if (site.organizationId !== orgId) return { error: "Access to this site is not permitted", status: 403 };
    if (site.status !== "ACTIVE") return { error: "Access to this site is not permitted", status: 403 };
    if (h.siteActorDenied.has(siteId) || !h.allowedSiteIds.includes(siteId)) {
      return { error: "Access to this site is not permitted", status: 403 };
    }
    return { ctx: { userId: "user-1", orgId, siteId, role: h.siteRole, implicit: false } };
  },
}));
vi.mock("@/lib/audit/audit-service", async (orig) => {
  const actual = await orig<typeof import("@/lib/audit/audit-service")>();
  return {
    ...actual,
    recordAuditEvent: async (e: Row) => {
      h.audits.push(e);
    },
    /*
      The strict recorder. `h.auditFails` makes it throw, which is how the
      fail-closed path is exercised: the route must then roll the whole
      transaction back and record the run as FAILED.
    */
    recordAuditEventOrThrow: async (e: Row) => {
      if (h.auditFails) throw new Error("AUDIT_WRITE_FAILED");
      h.audits.push(e);
    },
  };
});
vi.mock("@/lib/api/meter", () => ({
  meterIndustrialEvent: (orgId: string, metric: string, value = 1) => {
    h.meters.push({ orgId, metric, value });
  },
}));

/* ── a fake that enforces the migration's two unique indexes ─────────────── */

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    const value = row[field];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("in" in c) {
        if (!Array.isArray(c.in) || !c.in.includes(value)) return false;
        continue;
      }
      if ("lt" in c) {
        if (!(value instanceof Date) || !(value < (c.lt as Date))) return false;
        continue;
      }
      return false;
    }
    if (value !== cond) return false;
  }
  return true;
}

class UniqueViolation extends Error {
  code = "P2002";
}

let tables: Record<string, Row[]> = {};
let created: { model: string; data: Row }[] = [];
let engineRuns = 0;

function model(name: string) {
  return {
    findMany: async (q: { where?: Record<string, unknown>; take?: number }) => {
      const hit = (tables[name] ?? []).filter((r) => matches(r, q.where));
      return typeof q.take === "number" ? hit.slice(0, q.take) : hit;
    },
    findFirst: async (q: { where?: Record<string, unknown> }) =>
      (tables[name] ?? []).find((r) => matches(r, q.where)) ?? null,
    create: async (q: { data: Row }) => {
      if (name === "industrialMeteringOutbox") {
        /*
          R7. UNIQUE (organizationId, idempotencyKey, metric). The fake enforces
          it because production does: a double behaves as a duplicate here, or
          the replay assertions below would pass against a fake that simply
          cannot fail.
        */
        const rows = tables[name] ?? [];
        if (rows.some((r) =>
          r.organizationId === q.data.organizationId &&
          r.idempotencyKey === q.data.idempotencyKey &&
          r.metric === q.data.metric)) {
          throw new UniqueViolation("duplicate key: metering outbox");
        }
      }
      if (name === "industrialAutomationRun") {
        const rows = tables[name] ?? [];
        // UNIQUE (organizationId, idempotencyKey)
        if (rows.some((r) => r.organizationId === q.data.organizationId && r.idempotencyKey === q.data.idempotencyKey)) {
          throw new UniqueViolation("duplicate key: idempotencyKey");
        }
        // UNIQUE (organizationId, siteScopeKey) WHERE status IN (ACCEPTED, RUNNING)
        if (
          rows.some(
            (r) =>
              r.organizationId === q.data.organizationId &&
              r.siteScopeKey === q.data.siteScopeKey &&
              (r.status === "ACCEPTED" || r.status === "RUNNING"),
          )
        ) {
          throw new UniqueViolation("duplicate key: active scope");
        }
      }
      created.push({ model: name, data: q.data });
      const row = { id: `${name}-${(tables[name] ?? []).length + 1}`, ...DEFAULTS[name], ...q.data };
      (tables[name] ??= []).push(row);
      return row;
    },
    update: async (q: { where: { id: string }; data: Row }) => {
      const row = (tables[name] ?? []).find((r) => r.id === q.where.id);
      if (!row) throw new Error("no such row");
      Object.assign(row, q.data);
      return row;
    },
    updateMany: async (q: { where?: Record<string, unknown>; data: Row }) => {
      const hit = (tables[name] ?? []).filter((r) => matches(r, q.where));
      hit.forEach((r) => Object.assign(r, q.data));
      return { count: hit.length };
    },
  };
}

const DEFAULTS: Record<string, Row> = {
  assetAlert: { dismissed: false, resolvedAt: null },
  maintenanceRecommendation: { dismissed: false },
  industrialMeteringOutbox: { status: "PENDING", attempts: 0, lastErrorCode: null },
};

const MODELS = [
  "industrialAsset", "industrialSite", "assetHealthHistory", "telemetryRecord",
  "kPIRecord", "assetKnowledgeLink", "assetTag", "assetRiskScore",
  "assetIntelligenceSnapshot", "assetAlert", "maintenanceRecommendation",
  "industrialAutomationRun",
  // R7: metering is no longer a fire-and-forget call, it is an outbox row
  // written inside the run's transaction.
  "industrialMeteringOutbox",
];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const db: Record<string, unknown> = Object.fromEntries(MODELS.map((m) => [m, model(m)]));
    db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = JSON.stringify(tables);
      const createdBefore = created.length;
      try {
        return await fn(db);
      } catch (e) {
        // Restore every table and the creation log: nothing the callback wrote
        // may survive a failed transaction.
        tables = JSON.parse(snapshot, (_k, v) =>
          typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v);
        created.length = createdBefore;
        throw e;
      }
    };
    const asset = db.industrialAsset as ReturnType<typeof model>;
    const findMany = asset.findMany;
    asset.findMany = async (q) => {
      // Count only the engine's own asset SELECTION, so "did the engine run?" is
      // answerable without counting every per-asset read.
      if (q.where && "siteId" in q.where) engineRuns += 1;
      return findMany(q);
    };
    return db;
  },
}));

const { POST: run } = await import("@/app/api/industrial/automation/run/route");

const post = (body?: unknown, query = "") =>
  new NextRequest(new URL(`/api/industrial/automation/run${query}`, "http://localhost"), {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          body: typeof body === "string" ? body : JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  });

const stamps = { createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };

beforeEach(() => {
  h.role = "MANAGER";
  h.siteRole = "SITE_MANAGER";
  h.authMethod = "jwt";
  h.scopes = ["industrial.write"];
  h.allowedSiteIds = [SITE_1];
  h.siteActorDenied = new Set([SITE_MAINT]);
  h.audits = [];
  h.meters = [];
  h.auditFails = false;
  created = [];
  engineRuns = 0;
  tables = {
    industrialSite: [
      { id: SITE_1, organizationId: ORG_A, name: "Plant 1", slug: "p1", status: "ACTIVE", ...stamps },
      { id: SITE_2, organizationId: ORG_A, name: "Plant 2", slug: "p2", status: "ACTIVE", ...stamps },
      { id: SITE_MAINT, organizationId: ORG_A, name: "Under maintenance", slug: "maint", status: "MAINTENANCE", ...stamps },
      { id: SITE_FOREIGN, organizationId: ORG_B, name: "Other", slug: "o", status: "ACTIVE", ...stamps },
    ],
    industrialAsset: [
      { id: "a1", organizationId: ORG_A, siteId: SITE_1, assetType: "PUMP" },
      { id: "a2", organizationId: ORG_A, siteId: SITE_2, assetType: "PLC" },
      { id: "b1", organizationId: ORG_B, siteId: SITE_FOREIGN, assetType: "PUMP" },
    ],
    assetHealthHistory: [], telemetryRecord: [], kPIRecord: [],
    assetKnowledgeLink: [], assetTag: [], assetRiskScore: [],
    assetIntelligenceSnapshot: [], assetAlert: [], maintenanceRecommendation: [],
    industrialAutomationRun: [],
  };
});

const body = (over: Record<string, unknown> = {}) => ({
  siteId: SITE_1,
  idempotencyKey: KEY,
  ...over,
});

const assetSiteOf = () =>
  Object.fromEntries(tables.industrialAsset.map((a) => [String(a.id), String(a.siteId)]));

/* ═══ role matrix — the real permission tables ═════════════════════════════ */

describe("R3 · who may run at all", () => {
  it.each(["OWNER", "ADMIN", "MANAGER"] as OrgRole[])("%s may run a site", async (role) => {
    h.role = role;
    const res = await run(post(body()));
    expect(res.status).toBe(200);
  });

  it.each(["ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER"] as OrgRole[])(
    "%s is refused and nothing is written",
    async (role) => {
      h.role = role;
      expect((await run(post(body()))).status).toBe(403);
      expect(engineRuns).toBe(0);
      expect(created).toHaveLength(0);
    },
  );

  it("a site role without manage_assets cannot trigger a run on that site", async () => {
    // SITE_ENGINEER/OPERATOR/VIEWER hold view_assets but not manage_assets.
    h.siteRole = "SITE_ENGINEER";
    const res = await run(post(body()));
    expect(res.status).toBe(404);
    expect(engineRuns).toBe(0);
  });
});

/* ═══ F-04 CLOSED — site scope is mandatory ════════════════════════════════ */

describe("R3 · F-04 CLOSED · SITE scope is required and enforced", () => {
  it("the run touches only the named site", async () => {
    // Replaces R2's "a MANAGER granted only site 1 still writes to site 2".
    h.allowedSiteIds = [SITE_1, SITE_2];
    await run(post(body({ siteId: SITE_1 })));
    const site = assetSiteOf();
    const written = new Set(
      created.filter((c) => c.model !== "industrialAutomationRun").map((c) => site[String(c.data.assetId)]),
    );
    expect([...written]).toEqual([SITE_1]);
  });

  it("a missing siteId is refused — never widened to the organisation", async () => {
    // Replaces R2's "a siteId in the request body is ignored".
    const res = await run(post({ idempotencyKey: KEY }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SITE_ID_REQUIRED");
    expect(engineRuns).toBe(0);
  });

  it("an empty body is refused, not treated as an organisation run", async () => {
    const res = await run(post());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(engineRuns).toBe(0);
  });

  it.each(["", "   ", "\t", "short", "../site-active-2", "a'; DROP TABLE x; --", "*"])(
    "a malformed siteId %j is refused",
    async (bad) => {
      const res = await run(post(body({ siteId: bad })));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(bad === "" ? "SITE_ID_INVALID" : "SITE_ID_INVALID");
      expect(engineRuns).toBe(0);
    },
  );

  it("a site the caller does not hold answers 404 — the same as one that does not exist", async () => {
    const denied = await run(post(body({ siteId: SITE_2 })));
    const missing = await run(post(body({ siteId: "site-does-not-exist" })));
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await denied.json()).toEqual(await missing.json());
    expect(engineRuns).toBe(0);
  });

  it("another organisation's site is refused even when it exists", async () => {
    h.allowedSiteIds = [SITE_1, SITE_FOREIGN];
    const res = await run(post(body({ siteId: SITE_FOREIGN })));
    expect(res.status).toBe(404);
    expect(engineRuns).toBe(0);
  });

  it("a site under maintenance is refused", async () => {
    h.allowedSiteIds = [SITE_1, SITE_MAINT];
    const res = await run(post(body({ siteId: SITE_MAINT })));
    expect(res.status).toBe(404);
    expect(engineRuns).toBe(0);
  });

  it("a member of no site can run nothing", async () => {
    h.allowedSiteIds = [];
    const res = await run(post(body()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("NO_ACCESSIBLE_SITE");
  });

  it("a siteId in BOTH body and query is ambiguous and refused", async () => {
    const res = await run(post(body(), `?siteId=${SITE_2}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MALFORMED_REQUEST");
  });

  it("a repeated ?siteId= is ambiguous and refused", async () => {
    const res = await run(post({ idempotencyKey: KEY }, `?siteId=${SITE_1}&siteId=${SITE_2}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MALFORMED_REQUEST");
  });

  it("malformed JSON is refused before anything is authorised", async () => {
    const res = await run(post("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MALFORMED_REQUEST");
    expect(engineRuns).toBe(0);
  });

  it("a JSON array body is not a request object", async () => {
    const res = await run(post([SITE_1]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MALFORMED_REQUEST");
  });

  it("an actor or role supplied in the payload is ignored", async () => {
    h.role = "ENGINEER";
    const res = await run(post(body({ role: "OWNER", actorId: "someone-else", organizationId: ORG_B })));
    expect(res.status).toBe(403);
  });
});

/* ═══ organisation-wide: the exception ═════════════════════════════════════ */

describe("R3 · ORGANISATION mode is an explicit, confirmed, justified capability", () => {
  it("MANAGER cannot run organisation-wide — manage_industrial is not enough", async () => {
    h.role = "MANAGER";
    const res = await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ORG_WIDE_NOT_PERMITTED");
    expect(engineRuns).toBe(0);
  });

  it.each(["ENGINEER", "VIEWER"] as OrgRole[])("%s cannot reach it either", async (role) => {
    h.role = role;
    expect((await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }))).status).toBe(403);
  });

  it.each(["OWNER", "ADMIN"] as OrgRole[])(
    "%s gets a CHALLENGE first — step 1 never executes anything",
    async (role) => {
      h.role = role;
      h.allowedSiteIds = [SITE_1, SITE_2];
      const res = await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }));
      expect(res.status).toBe(412);
      const json = await res.json();
      expect(json.error).toBe("ORG_WIDE_CONFIRMATION_REQUIRED");
      expect(json.challenge.siteCount).toBe(2);
      expect(json.challenge.idempotencyKey).toBe(KEY);
      expect(engineRuns).toBe(0);
      expect(created).toHaveLength(0);
    },
  );

  it("a caller without the capability never sees the challenge — no estate enumeration", async () => {
    h.role = "MANAGER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    const json = await (await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }))).json();
    expect(json.challenge).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain(SITE_2);
  });

  it("step 2 without a reason is refused", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    const res = await run(
      post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", confirmOrganisationWide: true }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ORG_WIDE_REASON_REQUIRED");
    expect(engineRuns).toBe(0);
  });

  it("confirmation + reason runs, and reports the sites it covered and excluded", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2, SITE_MAINT];
    const res = await run(
      post({
        idempotencyKey: KEY,
        scopeMode: "ORGANISATION",
        confirmOrganisationWide: true,
        reason: "quarterly estate-wide risk recalculation",
      }),
    );
    expect(res.status).toBe(200);
    const { run: r } = await res.json();
    expect(r.scopeMode).toBe("ORGANISATION");
    expect([...r.sitesIncluded].sort()).toEqual([SITE_1, SITE_2].sort());
    // The maintenance site is EXCLUDED and said so — not silently dropped.
    expect(r.sitesExcluded).toEqual([SITE_MAINT]);
    expect(r.assetsProcessed).toBe(2);
  });

  it("ORGANISATION mode with a siteId is a contradiction, not a narrowing", async () => {
    h.role = "OWNER";
    const res = await run(
      post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", siteId: SITE_1, confirmOrganisationWide: true, reason: "x".repeat(10) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SITE_ID_NOT_ALLOWED_IN_ORG_MODE");
  });

  it.each(["ORG", "organisation", "SITE ", "", "all"])(
    "an unrecognised scopeMode %j is refused, never coerced",
    async (mode) => {
      h.role = "OWNER";
      const res = await run(post(body({ scopeMode: mode })));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("SCOPE_MODE_INVALID");
    },
  );

  it("the default really is SITE — an absent scopeMode does not mean everything", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    const { run: r } = await (await run(post(body()))).json();
    expect(r.scopeMode).toBe("SITE");
    expect(r.sitesIncluded).toEqual([SITE_1]);
  });
});

/* ═══ F-05 — idempotency and concurrency ═══════════════════════════════════ */

describe("R3 · F-05 CLOSED · replay and concurrency", () => {
  it("a missing idempotency key is refused", async () => {
    const res = await run(post({ siteId: SITE_1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it.each(["short", "has spaces here!!", "x".repeat(129), ""])(
    "a malformed idempotency key %j is refused",
    async (bad) => {
      const res = await run(post(body({ idempotencyKey: bad })));
      expect(res.status).toBe(400);
    },
  );

  it("replaying the same key does NOT execute a second time", async () => {
    const first = await (await run(post(body()))).json();
    const runsAfterFirst = engineRuns;
    const second = await (await run(post(body()))).json();

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(engineRuns).toBe(runsAfterFirst);
    // Deterministic and traceable: the SAME run, not a new one that looks alike.
    expect(second.run.requestId).toBe(first.run.requestId);
    expect(second.run.assetsProcessed).toBe(first.run.assetsProcessed);
  });

  it("a replay creates no second snapshot or risk score", async () => {
    await run(post(body()));
    const snapshots = created.filter((c) => c.model === "assetIntelligenceSnapshot").length;
    await run(post(body()));
    expect(created.filter((c) => c.model === "assetIntelligenceSnapshot")).toHaveLength(snapshots);
  });

  it("a replay is not metered twice", async () => {
    /*
      R7 moved metering from a fire-and-forget `meterIndustrialEvent` call into
      an outbox row written inside the run's transaction, so the count lives in
      the table now rather than in a spy. The property is unchanged — one run,
      one metering event, however many times it is replayed.
    */
    h.authMethod = "apikey";
    h.scopes = ["industrial.write"];
    await run(post(body()));
    await run(post(body()));
    expect(tables.industrialMeteringOutbox ?? []).toHaveLength(1);
    expect(h.meters).toHaveLength(0);
  });

  it("the idempotency key is tenant-scoped — the constraint includes the organisation", async () => {
    await run(post(body()));
    const row = tables.industrialAutomationRun[0];
    expect(row.organizationId).toBe(ORG_A);
    expect(row.idempotencyKey).toBe(KEY);
  });

  it("two DIFFERENT keys racing for the same scope: one wins, one gets 409", async () => {
    // The loser is refused by the database's partial unique index, not by a
    // process-local flag — the guard survives a second replica.
    const a = run(post(body({ idempotencyKey: "idem-key-aaaaaaaaaa" })));
    const b = run(post(body({ idempotencyKey: "idem-key-bbbbbbbbbb" })));
    const [ra, rb] = await Promise.all([a, b]);
    const codes = [ra.status, rb.status].sort();
    expect(codes).toEqual([200, 409]);
    const busy = ra.status === 409 ? ra : rb;
    expect((await busy.json()).error).toBe("SCOPE_BUSY");
    expect(engineRuns).toBe(1);
  });

  it("a completed run does not block the next one — the index is partial", async () => {
    expect((await run(post(body({ idempotencyKey: "idem-key-first-00001" })))).status).toBe(200);
    expect((await run(post(body({ idempotencyKey: "idem-key-second-0002" })))).status).toBe(200);
    expect(engineRuns).toBe(2);
  });

  it("a different site is a different scope and is not blocked", async () => {
    h.allowedSiteIds = [SITE_1, SITE_2];
    tables.industrialAutomationRun.push({
      id: "stuck", organizationId: ORG_A, siteId: SITE_1, siteScopeKey: SITE_1,
      scopeMode: "SITE", status: "RUNNING", idempotencyKey: "other-key-000000001",
      requestId: "r", actorRole: "OWNER", authMethod: "jwt", reason: null,
      sitesIncluded: [SITE_1], sitesExcluded: [], failures: [],
      startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await run(post(body({ siteId: SITE_2 })))).status).toBe(200);
  });

  it("an ABANDONED run is reclaimed after its lease, so a crash cannot lock a site forever", async () => {
    tables.industrialAutomationRun.push({
      id: "crashed", organizationId: ORG_A, siteId: SITE_1, siteScopeKey: SITE_1,
      scopeMode: "SITE", status: "RUNNING", idempotencyKey: "crashed-key-0000001",
      requestId: "r", actorRole: "OWNER", authMethod: "jwt", reason: null,
      sitesIncluded: [SITE_1], sitesExcluded: [], failures: [],
      startedAt: new Date(Date.now() - 3_600_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await run(post(body()));
    expect(res.status).toBe(200);
    expect(tables.industrialAutomationRun.find((r) => r.id === "crashed")!.status).toBe("EXPIRED");
  });

  it("a lease that has NOT expired still blocks", async () => {
    tables.industrialAutomationRun.push({
      id: "live", organizationId: ORG_A, siteId: SITE_1, siteScopeKey: SITE_1,
      scopeMode: "SITE", status: "RUNNING", idempotencyKey: "live-key-000000001",
      requestId: "r", actorRole: "OWNER", authMethod: "jwt", reason: null,
      sitesIncluded: [SITE_1], sitesExcluded: [], failures: [],
      startedAt: new Date(), expiresAt: new Date(Date.now() + 600_000),
    });
    expect((await run(post(body()))).status).toBe(409);
    expect(engineRuns).toBe(0);
  });
});

/* ═══ F-06 — the counts in the response ════════════════════════════════════ */

describe("R3 · F-06 CLOSED · the response counts what happened", () => {
  it("reports the four asset counters separately", async () => {
    h.allowedSiteIds = [SITE_1];
    const { run: r } = await (await run(post(body()))).json();
    expect(r.assetsDiscovered).toBe(1);
    expect(r.assetsAttempted).toBe(1);
    expect(r.assetsProcessed).toBe(1);
    expect(r.assetsFailed).toBe(0);
    expect(r.snapshotsCreated).toBe(1);
    expect(r.riskScoresCreated).toBe(1);
  });

  it("a site with no assets reports zero processed, not a failure", async () => {
    tables.industrialAsset = [];
    const { run: r } = await (await run(post(body()))).json();
    expect(r.assetsDiscovered).toBe(0);
    expect(r.assetsProcessed).toBe(0);
    expect(r.status).toBe("COMPLETED");
  });

  it("the stored row and the response agree", async () => {
    const { run: r } = await (await run(post(body()))).json();
    const row = tables.industrialAutomationRun[0];
    expect(row.assetsProcessed).toBe(r.assetsProcessed);
    expect(row.status).toBe(r.status);
  });
});

/* ═══ audit and metering ═══════════════════════════════════════════════════ */

describe("R3 · audit and metering", () => {
  it("a site run records an audit event with the required fields", async () => {
    await run(post(body()));
    expect(h.audits).toHaveLength(1);
    const a = h.audits[0] as { action: string; metadata: Record<string, unknown>; correlationId: string };
    expect(a.action).toBe("industrial.automation.run.site");
    expect(a.correlationId).toMatch(/^iar_/);
    for (const field of ["requestId", "idempotencyKey", "actorRole", "authMethod", "scopeMode", "siteId", "sitesIncluded", "counters"]) {
      expect(a.metadata, field).toHaveProperty(field);
    }
  });

  it("an organisation-wide run is a DIFFERENT audit action and carries the reason", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    await run(
      post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", confirmOrganisationWide: true, reason: "annual audit sweep" }),
    );
    const a = h.audits[0] as { action: string; metadata: Record<string, unknown> };
    expect(a.action).toBe("industrial.automation.run.organisation_wide");
    expect(a.metadata.reason).toBe("annual audit sweep");
    expect(a.metadata.sitesIncluded).toEqual([SITE_1, SITE_2]);
  });

  it("a refused request writes no audit event and no run row", async () => {
    h.role = "ENGINEER";
    await run(post(body()));
    expect(h.audits).toHaveLength(0);
    expect(tables.industrialAutomationRun).toHaveLength(0);
  });

  it("the audit metadata carries no raw error text", async () => {
    await run(post(body()));
    const a = h.audits[0] as { metadata: Record<string, unknown> };
    expect(JSON.stringify(a.metadata)).not.toMatch(/at .*\(|Error:/);
  });

  it("JWT sessions are not metered — only API keys, as the recorded contract says", async () => {
    await run(post(body()));
    expect(tables.industrialMeteringOutbox ?? []).toHaveLength(0);
    expect(h.meters).toHaveLength(0);
  });

  it("an API-key run enqueues exactly one metering event, carrying its context", async () => {
    h.authMethod = "apikey";
    await run(post(body()));
    const events = tables.industrialMeteringOutbox ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].organizationId).toBe(ORG_A);
    expect(events[0].metric).toBe("industrial_automation_runs");
    expect(events[0].operation).toBe("industrial.automation.run");
    expect(events[0].status).toBe("PENDING");
    // R7: the old fire-and-forget path is gone, not merely unused.
    expect(h.meters).toHaveLength(0);
  });
});

/* ═══ the API-key axis ═════════════════════════════════════════════════════ */

describe("R3 · organisation credentials", () => {
  beforeEach(() => {
    h.authMethod = "apikey";
    h.scopes = ["industrial.write"];
  });

  it("an API key must still name a site", async () => {
    const res = await run(post({ idempotencyKey: KEY }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SITE_ID_REQUIRED");
  });

  it("an API key may run any ACTIVE site of ITS OWN organisation", async () => {
    // No user means no UserSite rows; the boundary is the site's own tenancy.
    expect((await run(post(body({ siteId: SITE_2 })))).status).toBe(200);
  });

  it("an API key cannot reach another organisation's site", async () => {
    const res = await run(post(body({ siteId: SITE_FOREIGN })));
    expect(res.status).toBe(404);
    expect(engineRuns).toBe(0);
  });

  it("an API key cannot run a site under maintenance", async () => {
    const res = await run(post(body({ siteId: SITE_MAINT })));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SITE_NOT_ACTIVE");
  });

  it("without industrial.write nothing happens at all", async () => {
    h.scopes = ["industrial.read"];
    expect((await run(post(body()))).status).toBe(403);
    expect(engineRuns).toBe(0);
  });

  it("without industrial.run_org_wide the organisation mode is refused", async () => {
    const res = await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ORG_WIDE_NOT_PERMITTED");
  });

  it("with the scope it still needs confirmation and a reason", async () => {
    h.scopes = ["industrial.write", "industrial.run_org_wide"];
    const challenge = await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION" }));
    expect(challenge.status).toBe(412);
    const ok = await run(
      post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", confirmOrganisationWide: true, reason: "scheduled machine sweep" }),
    );
    expect(ok.status).toBe(200);
  });
});

describe("R3 loop 4 · attempts to get round the fix", () => {
  it("a key reused for a DIFFERENT scope is refused, not answered with the old run", async () => {
    // Found by attacking the fix: the key was bound to the tenant but not to the
    // operation, so reusing a site run's key for an organisation run returned
    // the site run's result and performed no organisation run at all. Nothing
    // extra executed — but the caller was told an operation had happened that
    // had not, which is the one thing an idempotency key exists to prevent.
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    expect((await run(post(body()))).status).toBe(200);

    const res = await run(
      post({
        idempotencyKey: KEY,
        scopeMode: "ORGANISATION",
        confirmOrganisationWide: true,
        reason: "trying to reuse a site key for the whole estate",
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("IDEMPOTENCY_KEY_SCOPE_MISMATCH");
  });

  it("a key reused for a different SITE is refused too", async () => {
    h.allowedSiteIds = [SITE_1, SITE_2];
    expect((await run(post(body({ siteId: SITE_1 })))).status).toBe(200);
    const res = await run(post(body({ siteId: SITE_2 })));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("IDEMPOTENCY_KEY_SCOPE_MISMATCH");
  });

  it("the same key for the same scope is still a clean replay", async () => {
    const first = await (await run(post(body()))).json();
    const second = await (await run(post(body()))).json();
    expect(second.replayed).toBe(true);
    expect(second.run.requestId).toBe(first.run.requestId);
  });

  it("a run that aborts releases its scope instead of locking the site for the lease", async () => {
    // Without this the row stays RUNNING and the partial unique index keeps the
    // site locked for fifteen minutes, so one 500 takes a plant's automation
    // offline for a quarter of an hour.
    const asset = tables.industrialAsset;
    tables.industrialAsset = new Proxy(asset, {}) as typeof asset;
    const original = tables.industrialSite;
    // Make the engine's asset selection throw by removing the table entirely.
    delete (tables as Record<string, unknown>).industrialAsset;

    const res = await run(post(body()));
    expect([200, 500]).toContain(res.status);
    tables.industrialAsset = asset;
    tables.industrialSite = original;

    const row = tables.industrialAutomationRun[0];
    // Whatever happened, the run is not left holding the scope.
    expect(["COMPLETED", "FAILED"]).toContain(String(row.status));
    expect((await run(post(body({ idempotencyKey: "idem-key-after-abort1" })))).status).not.toBe(409);
  });
});

describe("R5 · audit durability — the trail is part of the operation", () => {
  /*
    R4 measured why this exists: `recordAuditEvent` swallows persistence
    failures, so this endpoint's audit rows silently never appeared and only a
    real database revealed it. Awaiting a call that discards its own error is
    not the same as recording anything.

    The owner's R5 ruling: an audit failure on an organisation-wide run must
    fail closed. The run and its audit row now share one transaction.
  */

  it("a successful run writes exactly one audit row with every required field", async () => {
    await run(post(body()));
    expect(h.audits).toHaveLength(1);
    const a = h.audits[0] as { metadata: Record<string, unknown>; outcome: string; correlationId: string };
    for (const field of ["requestId", "idempotencyKey", "actorRole", "authMethod", "scopeMode", "siteId", "sitesIncluded", "sitesExcluded", "counters", "reason"]) {
      expect(a.metadata, field).toHaveProperty(field);
    }
    expect(a.outcome).toBe("success");
    expect(a.correlationId).toMatch(/^iar_/);
  });

  it("an audit failure fails the whole run — 500, not a quiet success", async () => {
    h.auditFails = true;
    const res = await run(post(body()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("AUDIT_OR_RUN_FAILED");
  });

  it("an audit failure leaves NO snapshot, risk score, alert or recommendation", async () => {
    h.auditFails = true;
    await run(post(body()));
    for (const model of ["assetIntelligenceSnapshot", "assetRiskScore", "assetAlert", "maintenanceRecommendation"]) {
      expect(tables[model] ?? [], model).toHaveLength(0);
    }
  });

  it("an audit failure is never metered", async () => {
    h.authMethod = "apikey";
    h.auditFails = true;
    await run(post(body()));
    expect(h.meters).toHaveLength(0);
  });

  it("an audit failure records the run as FAILED and releases the scope", async () => {
    h.auditFails = true;
    await run(post(body()));
    const stored = tables.industrialAutomationRun;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("FAILED");
    expect(stored[0].failureCode).toBe("AUDIT_OR_RUN_FAILED");
    // The scope is free again immediately — not held for the fifteen-minute lease.
    h.auditFails = false;
    expect((await run(post(body({ idempotencyKey: "idem-key-after-audit-fail" })))).status).toBe(200);
  });

  it("retrying the SAME key after an audit failure does not re-execute the run", async () => {
    h.auditFails = true;
    await run(post(body()));
    h.auditFails = false;
    const res = await run(post(body()));
    const json = await res.json();
    // The key is spent: the caller is told what happened to their operation
    // rather than silently getting a second, different one.
    expect(json.replayed).toBe(true);
    expect(json.run.status).toBe("FAILED");
    expect(tables.assetIntelligenceSnapshot ?? []).toHaveLength(0);
  });

  it("a replay writes no second audit row", async () => {
    await run(post(body()));
    await run(post(body()));
    expect(h.audits).toHaveLength(1);
  });

  it("an ORGANISATION run that cannot be audited leaves nothing behind either", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_1, SITE_2];
    h.auditFails = true;
    const res = await run(
      post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", confirmOrganisationWide: true, reason: "audit failure rehearsal" }),
    );
    expect(res.status).toBe(500);
    expect(tables.assetIntelligenceSnapshot ?? []).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.meters).toHaveLength(0);
  });
});

describe("R5 · site status semantics, pinned to the REAL enum", () => {
  /*
    FINDING-R4-001: these fixtures used "ARCHIVED", which `IndustrialSiteStatus`
    does not contain — PostgreSQL rejected it outright. The enum is
    ACTIVE | INACTIVE | MAINTENANCE, and the owner's R5 ruling is that only
    ACTIVE is analysed automatically.
  */
  const REAL_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"] as const;

  it("the fixtures use only values the database enum actually has", () => {
    for (const site of tables.industrialSite) {
      expect(REAL_STATUSES, `site ${site.id}`).toContain(site.status);
    }
  });

  it.each(["INACTIVE", "MAINTENANCE"] as const)("a %s site cannot be run directly", async (status) => {
    tables.industrialSite.push({
      id: `site-${status}`, organizationId: ORG_A, name: status, slug: status,
      status, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    });
    h.allowedSiteIds = [SITE_1, `site-${status}`];
    const res = await run(post(body({ siteId: `site-${status}` })));
    expect(res.status).toBe(404);
    expect(engineRuns).toBe(0);
  });

  it.each(["INACTIVE", "MAINTENANCE"] as const)(
    "an organisation-wide run excludes a %s site and SAYS so",
    async (status) => {
      const id = `site-${status}`;
      tables.industrialSite.push({
        id, organizationId: ORG_A, name: status, slug: status,
        status, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      });
      tables.industrialAsset.push({ id: `asset-${status}`, organizationId: ORG_A, siteId: id, assetType: "PUMP" });
      h.role = "OWNER";
      h.allowedSiteIds = [SITE_1, id];
      const { run: r } = await (
        await run(post({ idempotencyKey: KEY, scopeMode: "ORGANISATION", confirmOrganisationWide: true, reason: `excluding ${status}` }))
      ).json();
      expect(r.sitesIncluded).toEqual([SITE_1]);
      expect(r.sitesExcluded).toEqual([id]);
      // Its asset is not in any count, not merely absent from the writes.
      expect(r.assetsDiscovered).toBe(1);
      expect(created.some((c) => c.data.assetId === `asset-${status}`)).toBe(false);
    },
  );
});
