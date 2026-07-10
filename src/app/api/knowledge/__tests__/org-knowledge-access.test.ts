import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Phase 82E.1 — organisation-scoped Knowledge access-control regression matrix.
 *
 * Complements Phase 82E.0 (which locks [id] PATCH write isolation) by covering
 * the rest of the matrix for every org-scoped Knowledge route:
 *   authentication · organisation membership · permission boundaries ·
 *   cross-org read isolation · list isolation · search isolation ·
 *   create ownership binding · organisation-id tampering · no side effects.
 *
 * These routes authenticate via `@/lib/api/auth` (requirePlatformAuth) +
 * `@/lib/org/context` (requireOrgActor) — NOT `@/lib/auth/session`. The shared
 * `@/test/mock-auth` session helper does not apply, so the org-auth layer is
 * mocked directly. No `@/lib/auth/session` mock is hand-rolled (the pattern the
 * Phase 82D.4 consistency test guards), so this file is intentionally NOT added
 * to that consistency list.
 *
 * Prisma is an in-memory fake whose findFirst/findMany/updateMany honour BOTH
 * id AND organizationId — exactly like real Prisma — so tenant-scope assertions
 * are real, not simulated.
 */

const ISO = "2026-01-01T00:00:00.000Z";
const ORG_A = "org-A";
const ORG_B = "org-B";
const AUTHORING_ROLE = "ENGINEER"; // has manage_knowledge
const VIEWER_ROLE = "VIEWER";       // has view_knowledge, not manage_knowledge

// ── In-memory Prisma fake ────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);

function makeTable(seed: Row[]) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  return {
    rows,
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.find((r) => match(r, where)) ?? null),
    findMany: vi.fn(async ({ where }: { where?: Row }) => rows.filter((r) => match(r, where ?? {}))),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        if (match(rows[i], where)) { rows[i] = { ...rows[i], ...data, updatedAt: ISO }; count++; }
      }
      return { count };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const i = rows.findIndex((r) => match(r, where));
      if (i < 0) throw new Error("Record not found");
      rows[i] = { ...rows[i], ...data, updatedAt: ISO };
      return rows[i];
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `gen-${rows.length + 1}`, createdAt: ISO, updatedAt: ISO, ...data };
      rows.push(row);
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: Row }) => {
      const i = rows.findIndex((r) => match(r, where));
      return rows.splice(i, 1)[0];
    }),
  };
}

// ── Seed builders (full rows so rowToX mappers never crash) ───────────────────

function article(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null, title: `Article ${id}`, titleNorm: `article ${id}`,
    summary: "summary", content: "secret content", keywords: [], sourceType: "MANUAL",
    version: 1, status: "draft", authorId: "author-1", createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function engCase(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, title: `Case ${id}`, titleNorm: `case ${id}`, symptoms: [],
    diagnosis: null, resolution: "secret resolution", lessonsLearned: null, assetTypes: [],
    assetId: null, siteId: null, failureModeId: null, keywords: [], status: "open",
    severity: "MEDIUM", reportedById: null, resolvedAt: null, createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function failureMode(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null, name: `FM ${id}`, nameNorm: `fm ${id}`,
    description: "secret desc", severity: "MEDIUM", symptoms: [], assetTypes: [], keywords: [],
    sourceType: "MANUAL", createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function procedure(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null, title: `Proc ${id}`, titleNorm: `proc ${id}`,
    description: "secret steps", steps: [], assetTypes: [], estimatedHours: null, requiredRoles: [],
    safetyNotes: null, sourceType: "MANUAL", version: 1, status: "draft", approvedById: null,
    approvedAt: null, createdAt: ISO, updatedAt: ISO, ...over,
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

type AuthState =
  | { kind: "anon" }
  | { kind: "nonMember" }
  | { kind: "member"; role: string };

let tables: {
  industrialKnowledgeArticle: ReturnType<typeof makeTable>;
  industrialEngineeringCase: ReturnType<typeof makeTable>;
  industrialFailureMode: ReturnType<typeof makeTable>;
  industrialMaintenanceProcedure: ReturnType<typeof makeTable>;
};
let meterSpy: ReturnType<typeof vi.fn>;

const auditBuffer = () => (globalThis as Record<string, unknown>).__hermesAudit as unknown[];

async function loadRoute(routePath: string, auth: AuthState, actorOrg = ORG_A) {
  vi.resetModules();
  meterSpy = vi.fn();

  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () =>
      auth.kind === "anon"
        ? { error: "Authentication required", status: 401 }
        : { ctx: { userId: "user-A", orgId: actorOrg, authMethod: "jwt", scopes: ["admin"] } },
  }));
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () => {
      if (auth.kind === "anon") return { error: "Authentication required", status: 401 };
      if (auth.kind === "nonMember") return { error: "Not a member of this organization", status: 403 };
      return { ctx: { userId: "user-A", orgId: actorOrg, memberId: "mem-A", role: auth.role, status: "ACTIVE" } };
    },
  }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => tables }));
  vi.doMock("@/lib/api/meter", () => ({ meterIndustrialEvent: meterSpy }));

  return import(routePath);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

interface RouteSpec {
  name: string;
  path: string;
  fn: "GET" | "POST" | "PATCH";
  id?: string;
  body?: Row;
  query?: string;
}

async function invoke(route: RouteSpec, auth: AuthState, over: Partial<RouteSpec> = {}) {
  const spec = { ...route, ...over };
  const mod = await loadRoute(spec.path, auth);
  const handler = mod[spec.fn] as (req: NextRequest, ctx?: unknown) => Promise<Response>;
  const url = `http://localhost/api/knowledge/x${spec.id ? `/${spec.id}` : ""}${spec.query ? `?${spec.query}` : ""}`;
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method: spec.fn };
  if (spec.body && spec.fn !== "GET") {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(spec.body);
  }
  const req = new NextRequest(url, init);
  return spec.id ? handler(req, params(spec.id)) : handler(req);
}

// Read routes require view_knowledge; write routes require manage_knowledge.
const READ_ROUTES: RouteSpec[] = [
  { name: "articles GET",        path: "../articles/route",        fn: "GET" },
  { name: "articles/[id] GET",   path: "../articles/[id]/route",   fn: "GET", id: "art-A" },
  { name: "cases GET",           path: "../cases/route",           fn: "GET" },
  { name: "cases/[id] GET",      path: "../cases/[id]/route",      fn: "GET", id: "case-A" },
  { name: "failures GET",        path: "../failures/route",        fn: "GET" },
  { name: "failures/[id] GET",   path: "../failures/[id]/route",   fn: "GET", id: "fm-A" },
  { name: "procedures GET",      path: "../procedures/route",      fn: "GET" },
  { name: "procedures/[id] GET", path: "../procedures/[id]/route", fn: "GET", id: "proc-A" },
  { name: "search GET",          path: "../search/route",          fn: "GET", query: "q=Article" },
];
// POST routes + the one [id] PATCH (procedures) NOT already anon/viewer-covered in 82E.0.
const WRITE_ROUTES: RouteSpec[] = [
  { name: "articles POST",        path: "../articles/route",        fn: "POST", body: { title: "t", summary: "s", content: "c" } },
  { name: "cases POST",           path: "../cases/route",           fn: "POST", body: { title: "t" } },
  { name: "failures POST",        path: "../failures/route",        fn: "POST", body: { name: "n", description: "d" } },
  { name: "procedures POST",      path: "../procedures/route",      fn: "POST", body: { title: "t", description: "d" } },
  { name: "procedures/[id] PATCH", path: "../procedures/[id]/route", fn: "PATCH", id: "proc-A", body: { title: "t" } },
];

function noMutation() {
  for (const t of Object.values(tables)) {
    expect(t.create).not.toHaveBeenCalled();
    expect(t.updateMany).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
  }
}

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  (globalThis as Record<string, unknown>).__hermesAudit = [];
  tables = {
    industrialKnowledgeArticle: makeTable([article("art-A", ORG_A), article("art-B", ORG_B, { title: "Widget Guide", titleNorm: "widget guide" })]),
    industrialEngineeringCase: makeTable([engCase("case-A", ORG_A), engCase("case-B", ORG_B)]),
    industrialFailureMode: makeTable([failureMode("fm-A", ORG_A), failureMode("fm-B", ORG_B)]),
    industrialMaintenanceProcedure: makeTable([procedure("proc-A", ORG_A), procedure("proc-B", ORG_B)]),
  };
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.doUnmock("@/lib/api/auth");
  vi.doUnmock("@/lib/org/context");
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/api/meter");
});

// ── Authentication matrix ─────────────────────────────────────────────────────

describe("Authentication — anonymous callers are denied (401)", () => {
  it.each([...READ_ROUTES, ...WRITE_ROUTES])("$name → 401", async (route) => {
    const res = await invoke(route, { kind: "anon" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
    noMutation();
    expect(meterSpy).not.toHaveBeenCalled();
    expect(auditBuffer()).toHaveLength(0);
  });
});

// ── Membership matrix ─────────────────────────────────────────────────────────

describe("Membership — signed-in non-members are denied (403)", () => {
  it.each([...READ_ROUTES, ...WRITE_ROUTES])("$name → 403 not-a-member", async (route) => {
    const res = await invoke(route, { kind: "nonMember" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not a member of this organization" });
    noMutation();
    expect(meterSpy).not.toHaveBeenCalled();
    expect(auditBuffer()).toHaveLength(0);
  });

  it("non-member reads leak no record content", async () => {
    const res = await invoke(READ_ROUTES[1], { kind: "nonMember" }); // articles/[id] GET
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secret content");
    expect(text).not.toContain("Article art-A");
  });
});

// ── Permission matrix ─────────────────────────────────────────────────────────

describe("Permission — VIEWER (view_knowledge, not manage_knowledge)", () => {
  it.each(READ_ROUTES)("$name is allowed (200)", async (route) => {
    const res = await invoke(route, { kind: "member", role: VIEWER_ROLE });
    expect(res.status).toBe(200);
  });

  it.each(WRITE_ROUTES)("$name is denied (403 insufficient permission), no mutation", async (route) => {
    const res = await invoke(route, { kind: "member", role: VIEWER_ROLE });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Insufficient organization permissions" });
    noMutation();
    expect(auditBuffer()).toHaveLength(0);
  });
});

describe("Permission — ENGINEER (manage_knowledge) retains write access", () => {
  it("can create an article in its own org", async () => {
    const res = await invoke(WRITE_ROUTES[0], { kind: "member", role: AUTHORING_ROLE });
    expect(res.status).toBe(201);
    expect(tables.industrialKnowledgeArticle.create).toHaveBeenCalled();
  });
});

// ── Cross-organisation read isolation ─────────────────────────────────────────

describe("Cross-organisation read isolation — Org A actor cannot read Org B detail", () => {
  const CASES = [
    { name: "article", path: "../articles/[id]/route", id: "art-B", leak: "secret content" },
    { name: "case", path: "../cases/[id]/route", id: "case-B", leak: "secret resolution" },
    { name: "failure mode", path: "../failures/[id]/route", id: "fm-B", leak: "secret desc" },
    { name: "procedure", path: "../procedures/[id]/route", id: "proc-B", leak: "secret steps" },
  ];

  it.each(CASES)("$name B → 404, no content leak", async ({ path, id, leak }) => {
    const res = await invoke({ name: id, path, fn: "GET", id }, { kind: "member", role: AUTHORING_ROLE });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    // Re-fetch raw body for leak inspection.
    const res2 = await invoke({ name: id, path, fn: "GET", id }, { kind: "member", role: AUTHORING_ROLE });
    const text = JSON.stringify(await res2.json());
    expect(text).not.toContain(leak);
    expect(text).not.toContain(ORG_B);
    expect(text).not.toContain(`${id}`.replace("-B", "")); // no title fragment
  });

  it.each(CASES)("$name: nonexistent id and cross-org id are indistinguishable", async ({ path, id }) => {
    const ghost = await invoke({ name: "ghost", path, fn: "GET", id: "no-such-id" }, { kind: "member", role: AUTHORING_ROLE });
    const cross = await invoke({ name: "cross", path, fn: "GET", id }, { kind: "member", role: AUTHORING_ROLE });
    expect(ghost.status).toBe(404);
    expect(cross.status).toBe(404);
    expect(JSON.stringify(await cross.json())).toEqual(JSON.stringify(await ghost.json()));
  });

  it("own-org detail read still succeeds (proves 404s are isolation, not a broken route)", async () => {
    const res = await invoke({ name: "art-A", path: "../articles/[id]/route", fn: "GET", id: "art-A" }, { kind: "member", role: AUTHORING_ROLE });
    expect(res.status).toBe(200);
    expect((await res.json()).article.id).toBe("art-A");
  });
});

// ── List isolation ────────────────────────────────────────────────────────────

describe("List isolation — collection GETs return only the actor's org", () => {
  const LISTS = [
    { name: "articles", path: "../articles/route", key: "articles", aId: "art-A", bId: "art-B" },
    { name: "cases", path: "../cases/route", key: "cases", aId: "case-A", bId: "case-B" },
    { name: "failures", path: "../failures/route", key: "failureModes", aId: "fm-A", bId: "fm-B" },
    { name: "procedures", path: "../procedures/route", key: "procedures", aId: "proc-A", bId: "proc-B" },
  ];

  it.each(LISTS)("$name lists Org A only", async ({ path, key, aId, bId }) => {
    const res = await invoke({ name: key, path, fn: "GET" }, { kind: "member", role: AUTHORING_ROLE });
    expect(res.status).toBe(200);
    const items = (await res.json())[key] as Row[];
    const ids = items.map((r) => r.id);
    expect(ids).toContain(aId);
    expect(ids).not.toContain(bId);
    expect(items.every((r) => r.organizationId === ORG_A)).toBe(true);
  });

  it.each(LISTS)("$name: status filter cannot expand into Org B", async ({ path, key, bId }) => {
    // Org B row has status "draft"/"open"; filter by it and confirm no leak.
    const res = await invoke({ name: key, path, fn: "GET", query: "status=draft&status=open" }, { kind: "member", role: AUTHORING_ROLE });
    const items = (await res.json())[key] as Row[];
    expect(items.map((r) => r.id)).not.toContain(bId);
  });

  it("a query-string organizationId cannot override the server-derived org", async () => {
    const res = await invoke({ name: "articles", path: "../articles/route", fn: "GET", query: `organizationId=${ORG_B}` }, { kind: "member", role: AUTHORING_ROLE });
    const items = (await res.json()).articles as Row[];
    expect(items.map((r) => r.id)).not.toContain("art-B");
    expect(items.every((r) => r.organizationId === ORG_A)).toBe(true);
  });
});

// ── Search isolation ──────────────────────────────────────────────────────────

describe("Search isolation — org-scoped search route", () => {
  it("anonymous and non-member are denied", async () => {
    const anon = await invoke({ name: "search", path: "../search/route", fn: "GET", query: "q=Widget" }, { kind: "anon" });
    expect(anon.status).toBe(401);
    const nm = await invoke({ name: "search", path: "../search/route", fn: "GET", query: "q=Widget" }, { kind: "nonMember" });
    expect(nm.status).toBe(403);
  });

  it("a term matching an Org B article returns no Org B result", async () => {
    // Org B seed art-B has title "Widget Guide"; Org A has no such title.
    const res = await invoke({ name: "search", path: "../search/route", fn: "GET", query: "q=Widget" }, { kind: "member", role: VIEWER_ROLE });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.results as Row[]).map((r) => r.id);
    expect(ids).not.toContain("art-B");
    expect(body.total).toBe(0);
    expect(JSON.stringify(body)).not.toContain("Widget Guide");
  });

  it("query-string organizationId cannot cross the tenant boundary", async () => {
    const res = await invoke({ name: "search", path: "../search/route", fn: "GET", query: `q=Widget&organizationId=${ORG_B}` }, { kind: "member", role: AUTHORING_ROLE });
    const body = await res.json();
    expect((body.results as Row[]).map((r) => r.id)).not.toContain("art-B");
  });

  it("own-org search returns own results (non-vacuous)", async () => {
    const res = await invoke({ name: "search", path: "../search/route", fn: "GET", query: "q=Article" }, { kind: "member", role: AUTHORING_ROLE });
    const body = await res.json();
    const ids = (body.results as Row[]).map((r) => r.id);
    expect(ids).toContain("art-A");
    expect(ids).not.toContain("art-B");
  });
});

// ── Create ownership binding + tampering ──────────────────────────────────────

describe("Create ownership binding — new records bind to the server-derived org", () => {
  const CREATES = [
    { name: "article", path: "../articles/route", table: "industrialKnowledgeArticle", key: "article", body: { title: "New", summary: "s", content: "c" } },
    { name: "case", path: "../cases/route", table: "industrialEngineeringCase", key: "case", body: { title: "New" } },
    { name: "failure mode", path: "../failures/route", table: "industrialFailureMode", key: "failureMode", body: { name: "New", description: "d" } },
    { name: "procedure", path: "../procedures/route", table: "industrialMaintenanceProcedure", key: "procedure", body: { title: "New", description: "d" } },
  ] as const;

  it.each(CREATES)("$name: body organizationId/id are ignored; record bound to Org A", async ({ path, table, key, body }) => {
    const tamperBody = { ...body, organizationId: ORG_B, id: "attacker-chosen", createdAt: "1999-01-01T00:00:00.000Z" };
    const res = await invoke({ name: key, path, fn: "POST", body: tamperBody }, { kind: "member", role: AUTHORING_ROLE });

    expect(res.status).toBe(201);
    const created = (await res.json())[key] as Row;
    expect(created.organizationId).toBe(ORG_A);
    expect(created.id).not.toBe("attacker-chosen");

    // The persisted Prisma data was bound server-side, not from the body.
    const t = tables[table as keyof typeof tables];
    const createArg = t.create.mock.calls[0][0] as { data: Row };
    expect(createArg.data.organizationId).toBe(ORG_A);
    // No record landed in Org B.
    expect(t.rows.filter((r) => r.organizationId === ORG_B).length).toBe(1); // only the original seed
  });
});
