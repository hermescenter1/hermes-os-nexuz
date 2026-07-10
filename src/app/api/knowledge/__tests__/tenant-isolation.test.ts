import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Phase 82E.0 — organisation-scoped Knowledge tenant-isolation regression suite.
 *
 * Locks the hotfix to the confirmed cross-tenant write vulnerabilities in the
 * org-scoped Knowledge PATCH routes:
 *   - articles/[id], cases/[id], failures/[id], procedures/[id]
 *
 * These routes authenticate through `@/lib/api/auth` (requirePlatformAuth) +
 * `@/lib/org/context` (requireOrgActor) — NOT `@/lib/auth/session`. So the
 * shared `@/test/mock-auth` helper (which mocks the session cookie path) does
 * not apply here; instead we mock the org-auth layer directly. Crucially we do
 * NOT hand-roll a `@/lib/auth/session` mock (the pattern the Phase 82D.4
 * consistency test forbids) — a different, correct auth stack is mocked.
 *
 * The Prisma layer is replaced with an in-memory fake whose findFirst /
 * updateMany honour BOTH `id` AND `organizationId` in the where-clause, exactly
 * like real Prisma. That is what makes the tenant-scope assertions real: if a
 * service dropped organizationId from the write, a cross-org row would mutate
 * here and the test would fail.
 */

const ISO = "2026-01-01T00:00:00.000Z";

const ORG_A = "org-A";
const ORG_B = "org-B";

// ── In-memory Prisma fake ────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function makeTable(seed: Row[]) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  return {
    rows,
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null),
    findMany: vi.fn(async ({ where }: { where?: Row }) => rows.filter((r) => matches(r, where ?? {}))),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        if (matches(rows[i], where)) {
          rows[i] = { ...rows[i], ...data, updatedAt: ISO };
          count++;
        }
      }
      return { count };
    }),
    // A raw update() scoped only by id would be the vulnerable path — keep it
    // functional so we can assert it is NOT the mechanism used.
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const i = rows.findIndex((r) => matches(r, where));
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
      const i = rows.findIndex((r) => matches(r, where));
      const [removed] = rows.splice(i, 1);
      return removed;
    }),
  };
}

// ── Seed builders (full rows so rowToX mappers never crash) ───────────────────

function article(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null,
    title: `Article ${id}`, titleNorm: `article ${id}`,
    summary: "summary", content: "secret content", keywords: [],
    sourceType: "MANUAL", version: 1, status: "draft", authorId: "author-1",
    createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function engCase(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, title: `Case ${id}`, titleNorm: `case ${id}`,
    symptoms: [], diagnosis: null, resolution: null, lessonsLearned: null,
    assetTypes: [], assetId: null, siteId: null, failureModeId: null,
    keywords: [], status: "open", severity: "MEDIUM", reportedById: null,
    resolvedAt: null, createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function failureMode(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null,
    name: `FM ${id}`, nameNorm: `fm ${id}`, description: "secret desc",
    severity: "MEDIUM", symptoms: [], assetTypes: [], keywords: [],
    sourceType: "MANUAL", createdAt: ISO, updatedAt: ISO, ...over,
  };
}
function procedure(id: string, organizationId: string, over: Row = {}): Row {
  return {
    id, organizationId, categoryId: null,
    title: `Proc ${id}`, titleNorm: `proc ${id}`, description: "secret steps",
    steps: [], assetTypes: [], estimatedHours: null, requiredRoles: [],
    safetyNotes: null, sourceType: "MANUAL", version: 1, status: "draft",
    approvedById: null, approvedAt: null, createdAt: ISO, updatedAt: ISO, ...over,
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

type AuthState =
  | { kind: "anon" }
  | { kind: "nonMember" }
  | { kind: "member"; role: string; orgId: string };

let tables: {
  industrialKnowledgeArticle: ReturnType<typeof makeTable>;
  industrialEngineeringCase: ReturnType<typeof makeTable>;
  industrialFailureMode: ReturnType<typeof makeTable>;
  industrialMaintenanceProcedure: ReturnType<typeof makeTable>;
};

const auditBuffer = () => (globalThis as Record<string, unknown>).__hermesAudit as unknown[];

/**
 * Configure auth + prisma mocks, then import a route module fresh.
 * `actorOrg` is the server-derived org from requirePlatformAuth (never client input).
 */
async function loadRoute(routePath: string, auth: AuthState, actorOrg = ORG_A) {
  vi.resetModules();

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
      return {
        ctx: {
          userId: "user-A", orgId: auth.orgId, memberId: "mem-A",
          role: auth.role, status: "ACTIVE",
        },
      };
    },
  }));

  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => tables }));

  return import(routePath);
}

function patchReq(id: string, body: Row): NextRequest {
  return new NextRequest(`http://localhost/api/knowledge/x/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as Record<string, unknown>).__hermesAudit = [];
  tables = {
    industrialKnowledgeArticle: makeTable([article("art-A", ORG_A), article("art-B", ORG_B)]),
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
});

// A concrete role that HAS manage_knowledge, to prove isolation is enforced
// independently of a valid org permission.
const AUTHORING_ROLE = "ENGINEER";

// ════════════════════════════════════════════════════════════════════════════
// A. Cross-organisation Case PATCH
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/knowledge/cases/[id] — cross-org isolation", () => {
  const ROUTE = "../cases/[id]/route";

  it("Org A actor cannot modify Org B case — 404, no mutation, no audit", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("case-B", { title: "PWNED", status: "resolved" }), params("case-B"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found or update failed" });

    const caseB = tables.industrialEngineeringCase.rows.find((r) => r.id === "case-B")!;
    expect(caseB.title).toBe("Case case-B");   // unchanged
    expect(caseB.organizationId).toBe(ORG_B);  // no transfer
    expect(tables.industrialEngineeringCase.update).not.toHaveBeenCalled();
    expect(auditBuffer()).toHaveLength(0);
  });

  it("paired positive: Org A actor updates own Org A case (proves assertions non-vacuous)", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("case-A", { title: "Legit update" }), params("case-A"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.title).toBe("Legit update");
    expect(body.case.organizationId).toBe(ORG_A);
    expect(tables.industrialEngineeringCase.updateMany).toHaveBeenCalled();
  });

  it("body organizationId is ignored — case stays in Org A, write data omits organizationId", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("case-A", { title: "Keep A", organizationId: ORG_B }), params("case-A"));

    expect(res.status).toBe(200);
    expect((await res.json()).case.organizationId).toBe(ORG_A);
    const caseA = tables.industrialEngineeringCase.rows.find((r) => r.id === "case-A")!;
    expect(caseA.organizationId).toBe(ORG_A);
    // Org B now holds no extra/duplicated record.
    expect(tables.industrialEngineeringCase.rows.filter((r) => r.organizationId === ORG_B)).toHaveLength(1);
    const writeArg = tables.industrialEngineeringCase.updateMany.mock.calls[0][0] as { where: Row; data: Row };
    expect(writeArg.where).toEqual({ id: "case-A", organizationId: ORG_A });
    expect(writeArg.data).not.toHaveProperty("organizationId");
  });

  it("nonexistent id and cross-org id are indistinguishable (both 404, same body)", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const ghost = await PATCH(patchReq("no-such-id", { title: "x" }), params("no-such-id"));
    const crossOrg = await PATCH(patchReq("case-B", { title: "x" }), params("case-B"));

    expect(ghost.status).toBe(404);
    expect(crossOrg.status).toBe(404);
    const ghostBody = JSON.stringify(await ghost.json());
    const crossBody = JSON.stringify(await crossOrg.json());
    expect(crossBody).toEqual(ghostBody);
    // Cross-org error leaks no Org B content.
    expect(crossBody).not.toContain("Case case-B");
    expect(crossBody).not.toContain(ORG_B);
  });

  it("anonymous caller is denied with no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "anon" });
    const res = await PATCH(patchReq("case-A", { title: "x" }), params("case-A"));
    expect(res.status).toBe(401);
    expect(tables.industrialEngineeringCase.updateMany).not.toHaveBeenCalled();
  });

  it("non-member is denied with no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "nonMember" });
    const res = await PATCH(patchReq("case-A", { title: "x" }), params("case-A"));
    expect(res.status).toBe(403);
    expect(tables.industrialEngineeringCase.updateMany).not.toHaveBeenCalled();
  });

  it("org VIEWER (no manage_knowledge) is denied with no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: "VIEWER", orgId: ORG_A });
    const res = await PATCH(patchReq("case-A", { title: "x" }), params("case-A"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Insufficient organization permissions" });
    expect(tables.industrialEngineeringCase.updateMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Cross-organisation FailureMode PATCH
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/knowledge/failures/[id] — cross-org isolation", () => {
  const ROUTE = "../failures/[id]/route";

  it("Org A actor cannot modify Org B failure mode — 404, no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("fm-B", { name: "PWNED" }), params("fm-B"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found or update failed" });
    const fmB = tables.industrialFailureMode.rows.find((r) => r.id === "fm-B")!;
    expect(fmB.name).toBe("FM fm-B");
    expect(fmB.organizationId).toBe(ORG_B);
    expect(tables.industrialFailureMode.update).not.toHaveBeenCalled();
  });

  it("paired positive: Org A actor updates own Org A failure mode", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("fm-A", { name: "Legit FM" }), params("fm-A"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failureMode.name).toBe("Legit FM");
    expect(body.failureMode.organizationId).toBe(ORG_A);
  });

  it("body organizationId is ignored — failure mode stays in Org A, write omits organizationId", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("fm-A", { name: "Keep A", organizationId: ORG_B }), params("fm-A"));
    expect(res.status).toBe(200);
    expect((await res.json()).failureMode.organizationId).toBe(ORG_A);
    const writeArg = tables.industrialFailureMode.updateMany.mock.calls[0][0] as { where: Row; data: Row };
    expect(writeArg.where).toEqual({ id: "fm-A", organizationId: ORG_A });
    expect(writeArg.data).not.toHaveProperty("organizationId");
    expect(tables.industrialFailureMode.rows.filter((r) => r.organizationId === ORG_B)).toHaveLength(1);
  });

  it("nonexistent id and cross-org id are indistinguishable (both 404, same body)", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const ghost = await PATCH(patchReq("no-such", { name: "x" }), params("no-such"));
    const crossOrg = await PATCH(patchReq("fm-B", { name: "x" }), params("fm-B"));
    expect(ghost.status).toBe(404);
    expect(crossOrg.status).toBe(404);
    expect(JSON.stringify(await crossOrg.json())).toEqual(JSON.stringify(await ghost.json()));
  });

  it("anonymous and VIEWER are denied with no mutation", async () => {
    const anon = await loadRoute(ROUTE, { kind: "anon" });
    expect((await anon.PATCH(patchReq("fm-A", { name: "x" }), params("fm-A"))).status).toBe(401);
    expect(tables.industrialFailureMode.updateMany).not.toHaveBeenCalled();

    const viewer = await loadRoute(ROUTE, { kind: "member", role: "VIEWER", orgId: ORG_A });
    expect((await viewer.PATCH(patchReq("fm-A", { name: "x" }), params("fm-A"))).status).toBe(403);
    expect(tables.industrialFailureMode.updateMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. Article PATCH — organizationId tampering + cross-org read-before-write
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/knowledge/articles/[id] — org ownership is immutable", () => {
  const ROUTE = "../articles/[id]/route";

  it("Org A actor cannot reach Org B article — 404, no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("art-B", { title: "PWNED" }), params("art-B"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    const artB = tables.industrialKnowledgeArticle.rows.find((r) => r.id === "art-B")!;
    expect(artB.title).toBe("Article art-B");
    expect(artB.organizationId).toBe(ORG_B);
    expect(tables.industrialKnowledgeArticle.updateMany).not.toHaveBeenCalled();
  });

  it("body organizationId is ignored — own article cannot be transferred to Org B", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(
      patchReq("art-A", { title: "Keep in A", organizationId: ORG_B }),
      params("art-A"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.article.title).toBe("Keep in A");
    expect(body.article.organizationId).toBe(ORG_A);

    const artA = tables.industrialKnowledgeArticle.rows.find((r) => r.id === "art-A")!;
    expect(artA.organizationId).toBe(ORG_A);
    expect(tables.industrialKnowledgeArticle.rows.filter((r) => r.organizationId === ORG_B)).toHaveLength(1);

    const writeArg = tables.industrialKnowledgeArticle.updateMany.mock.calls[0][0] as { where: Row; data: Row };
    expect(writeArg.where).toEqual({ id: "art-A", organizationId: ORG_A });
    expect(writeArg.data).not.toHaveProperty("organizationId");
    // Server-owned fields are not client-writable either.
    expect(writeArg.data).not.toHaveProperty("id");
    expect(writeArg.data).not.toHaveProperty("authorId");
    expect(writeArg.data).not.toHaveProperty("createdAt");
  });

  it("id/createdAt/authorId in body cannot overwrite server-owned columns", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(
      patchReq("art-A", { summary: "new", id: "art-B", authorId: "attacker", createdAt: "1999-01-01T00:00:00.000Z" }),
      params("art-A"),
    );
    expect(res.status).toBe(200);
    const artA = tables.industrialKnowledgeArticle.rows.find((r) => r.id === "art-A")!;
    expect(artA.authorId).toBe("author-1");
    expect(artA.createdAt).toBe(ISO);
  });

  it("anonymous and VIEWER are denied with no mutation", async () => {
    const anon = await loadRoute(ROUTE, { kind: "anon" });
    expect((await anon.PATCH(patchReq("art-A", { title: "x" }), params("art-A"))).status).toBe(401);
    expect(tables.industrialKnowledgeArticle.updateMany).not.toHaveBeenCalled();

    const viewer = await loadRoute(ROUTE, { kind: "member", role: "VIEWER", orgId: ORG_A });
    expect((await viewer.PATCH(patchReq("art-A", { title: "x" }), params("art-A"))).status).toBe(403);
    expect(tables.industrialKnowledgeArticle.updateMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D. Procedure PATCH — same ownership-transfer class (Step 8)
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/knowledge/procedures/[id] — org ownership is immutable", () => {
  const ROUTE = "../procedures/[id]/route";

  it("Org A actor cannot modify Org B procedure — 404, no mutation", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("proc-B", { title: "PWNED" }), params("proc-B"));
    expect(res.status).toBe(404);
    const procB = tables.industrialMaintenanceProcedure.rows.find((r) => r.id === "proc-B")!;
    expect(procB.title).toBe("Proc proc-B");
    expect(procB.organizationId).toBe(ORG_B);
    expect(tables.industrialMaintenanceProcedure.update).not.toHaveBeenCalled();
  });

  it("body organizationId is ignored — own procedure stays in Org A", async () => {
    const { PATCH } = await loadRoute(ROUTE, { kind: "member", role: AUTHORING_ROLE, orgId: ORG_A });
    const res = await PATCH(patchReq("proc-A", { title: "Keep A", organizationId: ORG_B }), params("proc-A"));
    expect(res.status).toBe(200);
    const procA = tables.industrialMaintenanceProcedure.rows.find((r) => r.id === "proc-A")!;
    expect(procA.organizationId).toBe(ORG_A);
    const writeArg = tables.industrialMaintenanceProcedure.update.mock.calls[0][0] as { data: Row };
    expect(writeArg.data).not.toHaveProperty("organizationId");
    expect(tables.industrialMaintenanceProcedure.rows.filter((r) => r.organizationId === ORG_B)).toHaveLength(1);
  });
});
