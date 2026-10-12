/**
 * Digital Twin Slice 1 — route authorization matrix.
 *
 * Mocks the IDENTITY layer (who the caller is, which sites they reach) and the
 * persistence services, and exercises the REAL routes, REAL guard, REAL org RBAC,
 * REAL site RBAC, REAL schemas and REAL error mapping. The properties:
 *
 *   - every route refuses an unauthenticated caller and an API-key caller,
 *   - a caller who cannot reach a site gets the SAME 404 as for a missing record,
 *   - a refused mutation never reaches the service (no write, no audit),
 *   - the response body never carries a database/driver message.
 *
 * Integrity against a REAL database is the PostgreSQL suite's job
 * (`__tests__/pg/`); this file pins the HTTP contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  auth: "ok" as "ok" | "unauth" | "apikey",
  orgRole: "ADMIN" as string,
  orgActor: "ok" as "ok" | "unauth" | "nonmember" | "uncoded409",
  /** When set, requirePlatformAuth refuses with the OFFICIAL RefusedRequest for this ContextRefusal code. */
  refuse: null as string | null,
  /** siteId → site role. A site missing from the map is unreachable. */
  siteRoles: {} as Record<string, string>,
  allowed: [] as string[],
  /** Sites that exist and are granted but are NOT active (IR-01). */
  inactive: [] as string[],
  nodes: {} as Record<string, { id: string; siteId: string }>,
  relations: {} as Record<string, { siteIds: string[] }>,
  assets: {} as Record<string, { id: string; siteId: string }>,
  tags: {} as Record<string, { id: string; assetId: string }>,
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => {
    if (h.refuse) {
      const { refuse } = await import("@/lib/auth/context-result");
      return refuse(h.refuse as never);
    }
    if (h.auth === "unauth") return { error: "Authentication required", status: 401 };
    return {
      ctx: { userId: h.auth === "apikey" ? null : "user-1", orgId: "org-A", authMethod: h.auth === "apikey" ? "apikey" : "jwt", scopes: ["admin"] },
    };
  },
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => {
    if (h.orgActor === "unauth") return { error: "Authentication required", status: 401 };
    if (h.orgActor === "nonmember") return { error: "Not a member of this organization", status: 403 };
    if (h.orgActor === "uncoded409") return { error: "Some other refusal", status: 409 };
    return { ctx: { userId: "user-1", orgId: "org-A", role: h.orgRole, status: "ACTIVE" } };
  },
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: vi.fn(async () => h.allowed),
  requireSiteActor: vi.fn(async (_req: unknown, orgId: string, siteId: string) => {
    const role = h.siteRoles[siteId];
    if (!role) return { error: "Access to this site is not permitted", status: 403 };
    return { ctx: { userId: "user-1", orgId, siteId, role, implicit: false } };
  }),
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: vi.fn() }));
// The REAL `resolveSiteScope` runs in these tests: only the site table is faked. A granted site that
// is listed in `h.inactive` is not returned by the ACTIVE-site query, exactly as in the database.
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    industrialSite: {
      findMany: async (a: { where: { status: string; id: { in: string[] } } }) =>
        a.where.status === "ACTIVE" ? a.where.id.in.filter((id) => !h.inactive.includes(id)).map((id) => ({ id })) : [],
    },
  }),
}));

const svc = vi.hoisted(() => ({
  listNodesPage: vi.fn(async () => ({ nodes: [], truncated: false })),
  getNode: vi.fn(async (id: string) => h.nodes[id] ?? null),
  createNode: vi.fn(async () => ({ id: "n-new" })),
  updateNode: vi.fn(async () => ({ id: "n1" })),
  getNodeRelations: vi.fn(async () => ({ outbound: [], inbound: [], truncated: false })),
  getAssetGraph: vi.fn(async () => ({ siteId: "s1", nodes: new Map(), relations: [], truncated: false })),
  listRelationsPage: vi.fn(async () => ({ relations: [], truncated: false })),
  createRelation: vi.fn(async () => ({ id: "r-new" })),
  getRelationWithSites: vi.fn(async (id: string) => {
    const r = h.relations[id];
    return r ? { relation: { id }, siteIds: r.siteIds } : null;
  }),
  updateRelation: vi.fn(async () => ({ id: "r1" })),
  listLayoutsPage: vi.fn(async () => ({ layouts: [], truncated: false })),
  createLayout: vi.fn(async () => ({ id: "l-new" })),
  getAsset: vi.fn(async (id: string) => h.assets[id] ?? null),
  listTagsPage: vi.fn(async () => ({ tags: [], truncated: false })),
  getTag: vi.fn(async (id: string) => h.tags[id] ?? null),
  createTag: vi.fn(async () => ({ id: "t-new" })),
  updateTag: vi.fn(async () => ({ id: "t1" })),
}));
vi.mock("@/lib/digital-twin/nodes", () => ({
  listNodesPage: svc.listNodesPage, getNode: svc.getNode, createNode: svc.createNode, updateNode: svc.updateNode,
}));
vi.mock("@/lib/digital-twin/graph", () => ({ getNodeRelations: svc.getNodeRelations, getAssetGraph: svc.getAssetGraph }));
vi.mock("@/lib/digital-twin/relations", () => ({
  listRelationsPage: svc.listRelationsPage, createRelation: svc.createRelation,
  getRelationWithSites: svc.getRelationWithSites, updateRelation: svc.updateRelation,
}));
vi.mock("@/lib/digital-twin/layout", () => ({ listLayoutsPage: svc.listLayoutsPage, createLayout: svc.createLayout }));
vi.mock("@/lib/digital-twin/tags", () => ({
  listTagsPage: svc.listTagsPage, getTag: svc.getTag, createTag: svc.createTag, updateTag: svc.updateTag,
}));
vi.mock("@/lib/industrial/assets", () => ({ getAsset: svc.getAsset }));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: vi.fn(), logAuthzDenial: vi.fn(), logAuthFailure: vi.fn() }));

const nodesRoute = await import("../nodes/route");
const nodeIdRoute = await import("../nodes/[id]/route");
const relationsRoute = await import("../relations/route");
const relationIdRoute = await import("../relations/[id]/route");
const graphRoute = await import("../graph/route");
const layoutRoute = await import("../layout/route");
const tagsRoute = await import("../tags/route");
const tagIdRoute = await import("../tags/[id]/route");

type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;

const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** One row per (route, method): how to call it, and which service call it must NOT make when refused. */
interface Case {
  name: string;
  write: boolean;
  call: () => Promise<Response>;
  /** Services that must stay untouched when the request is refused. */
  sinks: (keyof typeof svc)[];
}
const cases: Case[] = [
  { name: "GET /nodes", write: false, call: () => (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes")), sinks: ["listNodesPage"] },
  { name: "POST /nodes", write: true, call: () => (nodesRoute.POST as Handler)(req("POST", "/api/digital-twin/nodes", { siteId: "s1", displayName: "N", nodeType: "AREA" })), sinks: ["createNode"] },
  { name: "GET /nodes/[id]", write: false, call: () => (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/n1"), params("n1")), sinks: ["getNodeRelations"] },
  { name: "PATCH /nodes/[id]", write: true, call: () => (nodeIdRoute.PATCH as Handler)(req("PATCH", "/api/digital-twin/nodes/n1", { displayName: "x" }), params("n1")), sinks: ["updateNode"] },
  { name: "GET /relations", write: false, call: () => (relationsRoute.GET as Handler)(req("GET", "/api/digital-twin/relations")), sinks: ["listRelationsPage"] },
  { name: "POST /relations", write: true, call: () => (relationsRoute.POST as Handler)(req("POST", "/api/digital-twin/relations", { sourceNodeId: "n1", targetNodeId: "n2", relationType: "FEEDS" })), sinks: ["createRelation"] },
  { name: "GET /relations/[id]", write: false, call: () => (relationIdRoute.GET as Handler)(req("GET", "/api/digital-twin/relations/r1"), params("r1")), sinks: [] },
  { name: "PATCH /relations/[id]", write: true, call: () => (relationIdRoute.PATCH as Handler)(req("PATCH", "/api/digital-twin/relations/r1", { metadata: {} }), params("r1")), sinks: ["updateRelation"] },
  { name: "GET /graph", write: false, call: () => (graphRoute.GET as Handler)(req("GET", "/api/digital-twin/graph?siteId=s1")), sinks: ["getAssetGraph"] },
  { name: "GET /layout", write: false, call: () => (layoutRoute.GET as Handler)(req("GET", "/api/digital-twin/layout")), sinks: ["listLayoutsPage"] },
  { name: "POST /layout", write: true, call: () => (layoutRoute.POST as Handler)(req("POST", "/api/digital-twin/layout", { siteId: "s1", name: "L" })), sinks: ["createLayout"] },
  { name: "GET /tags", write: false, call: () => (tagsRoute.GET as Handler)(req("GET", "/api/digital-twin/tags?assetId=a1")), sinks: ["listTagsPage"] },
  { name: "POST /tags", write: true, call: () => (tagsRoute.POST as Handler)(req("POST", "/api/digital-twin/tags", { assetId: "a1", tagName: "T", tagPath: "p.q" })), sinks: ["createTag"] },
  { name: "GET /tags/[id]", write: false, call: () => (tagIdRoute.GET as Handler)(req("GET", "/api/digital-twin/tags/t1"), params("t1")), sinks: [] },
  { name: "PATCH /tags/[id]", write: true, call: () => (tagIdRoute.PATCH as Handler)(req("PATCH", "/api/digital-twin/tags/t1", { tagName: "x" }), params("t1")), sinks: ["updateTag"] },
];

const allSinks = (): number =>
  [svc.createNode, svc.updateNode, svc.createRelation, svc.updateRelation, svc.createLayout, svc.createTag, svc.updateTag]
    .reduce((n, f) => n + f.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = "ok";
  h.orgRole = "ADMIN";
  h.orgActor = "ok";
  h.refuse = null;
  h.siteRoles = { s1: "SITE_ADMIN", s2: "SITE_ADMIN" };
  h.allowed = ["s1", "s2"];
  h.inactive = [];
  h.nodes = { n1: { id: "n1", siteId: "s1" }, n2: { id: "n2", siteId: "s1" }, n3: { id: "n3", siteId: "s2" } };
  h.relations = { r1: { siteIds: ["s1"] } };
  h.assets = { a1: { id: "a1", siteId: "s1" }, a2: { id: "a2", siteId: "s2" } };
  h.tags = { t1: { id: "t1", assetId: "a1" } };
});

describe("authentication", () => {
  it.each(cases)("$name → 401 when unauthenticated, and nothing is touched", async (c) => {
    h.auth = "unauth";
    const res = await c.call();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTHENTICATION_REQUIRED");
    expect(allSinks()).toBe(0);
    for (const s of c.sinks) expect(svc[s], String(s)).not.toHaveBeenCalled();
  });

  it.each(cases)("$name → 403 SESSION_REQUIRED for an API-key caller (session only)", async (c) => {
    h.auth = "apikey";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("SESSION_REQUIRED");
    expect(allSinks()).toBe(0);
  });

  it.each(cases)("$name → 401 when the session cookie is missing at the org layer", async (c) => {
    h.orgActor = "unauth";
    const res = await c.call();
    expect(res.status).toBe(401);
    expect(allSinks()).toBe(0);
  });

  it.each(cases)("$name → 403 for a non-member of the organisation", async (c) => {
    h.orgActor = "nonmember";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect(allSinks()).toBe(0);
  });
});

describe("organisation roles", () => {
  it.each(cases.filter((c) => c.write))("$name → 403 for a VIEWER, no write reaches the service", async (c) => {
    h.orgRole = "VIEWER";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect(allSinks()).toBe(0);
  });

  it.each(cases.filter((c) => c.write))("$name → 403 for an ENGINEER (read-only on the twin)", async (c) => {
    h.orgRole = "ENGINEER";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect(allSinks()).toBe(0);
  });

  it.each(cases.filter((c) => !c.write))("$name → readable by a VIEWER at a reachable site", async (c) => {
    h.orgRole = "VIEWER";
    h.siteRoles = { s1: "SITE_VIEWER", s2: "SITE_VIEWER" };
    const res = await c.call();
    expect(res.status).toBe(200);
  });
});

describe("site scope — an unreachable site is NOT FOUND", () => {
  beforeEach(() => {
    h.siteRoles = {}; // the caller reaches no site at all
    h.allowed = [];
  });

  const byId = (name: string) => cases.find((c) => c.name === name)!;

  it("GET /nodes/[id] → 404, identical to a node that does not exist", async () => {
    const hidden = await byId("GET /nodes/[id]").call();
    const missing = await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/zzz"), params("zzz"));
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    expect(svc.getNodeRelations).not.toHaveBeenCalled();
  });

  it("PATCH /nodes/[id] → 404 and updateNode is never called", async () => {
    const res = await byId("PATCH /nodes/[id]").call();
    expect(res.status).toBe(404);
    expect(svc.updateNode).not.toHaveBeenCalled();
  });

  it("POST /nodes with an unreachable siteId → 404 SITE_NOT_FOUND, createNode never called", async () => {
    const res = await byId("POST /nodes").call();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SITE_NOT_FOUND");
    expect(svc.createNode).not.toHaveBeenCalled();
  });

  it("GET /graph → 404 SITE_NOT_FOUND and the graph is never built", async () => {
    const res = await byId("GET /graph").call();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SITE_NOT_FOUND");
    expect(svc.getAssetGraph).not.toHaveBeenCalled();
  });

  it("POST /layout → 404 and createLayout is never called", async () => {
    const res = await byId("POST /layout").call();
    expect(res.status).toBe(404);
    expect(svc.createLayout).not.toHaveBeenCalled();
  });

  it("POST /relations → 404 and createRelation is never called", async () => {
    const res = await byId("POST /relations").call();
    expect(res.status).toBe(404);
    expect(svc.createRelation).not.toHaveBeenCalled();
  });

  it("GET/PATCH /relations/[id] → 404", async () => {
    expect((await byId("GET /relations/[id]").call()).status).toBe(404);
    expect((await byId("PATCH /relations/[id]").call()).status).toBe(404);
    expect(svc.updateRelation).not.toHaveBeenCalled();
  });

  it("POST /tags for an asset at an unreachable site → 404 ASSET_NOT_FOUND, same as a missing asset", async () => {
    const hidden = await byId("POST /tags").call();
    h.assets = {};
    const missing = await byId("POST /tags").call();
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    expect(svc.createTag).not.toHaveBeenCalled();
  });

  it("GET/PATCH /tags/[id] → 404", async () => {
    expect((await byId("GET /tags/[id]").call()).status).toBe(404);
    expect((await byId("PATCH /tags/[id]").call()).status).toBe(404);
    expect(svc.updateTag).not.toHaveBeenCalled();
  });

  it("list routes receive an EMPTY allow-list, so they cannot return rows", async () => {
    await byId("GET /nodes").call();
    await byId("GET /relations").call();
    await byId("GET /layout").call();
    await byId("GET /tags").call();
    expect(svc.listNodesPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: [] }));
    expect(svc.listRelationsPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: [] }));
    expect(svc.listLayoutsPage).toHaveBeenCalledWith("org-A", undefined, []);
    expect(svc.listTagsPage).toHaveBeenCalledWith("a1", "org-A", { allowedSiteIds: [] });
  });
});

describe("site scope — partial reach", () => {
  beforeEach(() => {
    h.siteRoles = { s1: "SITE_MANAGER" }; // s2 is NOT reachable
    h.allowed = ["s1"];
  });

  it("lists pass exactly the caller's allowed sites (and a requested siteId narrows, never widens)", async () => {
    await (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes?siteId=s2"));
    expect(svc.listNodesPage).toHaveBeenCalledWith("org-A", { siteId: "s2", allowedSiteIds: ["s1"] });
  });

  it("a node at the reachable site is served; one at the other site is 404", async () => {
    const ok = await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/n1"), params("n1"));
    const no = await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/n3"), params("n3"));
    expect(ok.status).toBe(200);
    expect(no.status).toBe(404);
  });

  it("a relation between a reachable and an unreachable node is refused (404), nothing created", async () => {
    const res = await (relationsRoute.POST as Handler)(
      req("POST", "/api/digital-twin/relations", { sourceNodeId: "n1", targetNodeId: "n3", relationType: "FEEDS" }),
    );
    expect(res.status).toBe(404);
    expect(svc.createRelation).not.toHaveBeenCalled();
  });

  it("a SITE_VIEWER may read but not write: 403 INSUFFICIENT_SITE_PERMISSION, service untouched", async () => {
    h.siteRoles = { s1: "SITE_VIEWER" };
    const read = await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/n1"), params("n1"));
    const write = await (nodeIdRoute.PATCH as Handler)(req("PATCH", "/api/digital-twin/nodes/n1", { displayName: "x" }), params("n1"));
    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect((await write.json()).code).toBe("INSUFFICIENT_SITE_PERMISSION");
    expect(svc.updateNode).not.toHaveBeenCalled();
  });

  it("a SITE_ENGINEER may not manage the twin either", async () => {
    h.siteRoles = { s1: "SITE_ENGINEER" };
    const res = await (nodesRoute.POST as Handler)(req("POST", "/api/digital-twin/nodes", { siteId: "s1", displayName: "N", nodeType: "AREA" }));
    expect(res.status).toBe(403);
    expect(svc.createNode).not.toHaveBeenCalled();
  });

  it("an authorised write reaches the service with the SERVER-derived org and actor", async () => {
    const res = await (nodesRoute.POST as Handler)(
      req("POST", "/api/digital-twin/nodes", { siteId: "s1", displayName: "N", nodeType: "AREA", organizationId: "org-EVIL", actorUserId: "evil" }),
    );
    expect(res.status).toBe(201);
    const arg = (svc.createNode.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg.organizationId).toBe("org-A");
    expect(arg.actorUserId).toBe("user-1");
  });
});

describe("mass assignment", () => {
  it("PATCH /nodes/[id] drops injected identity and scope fields", async () => {
    await (nodeIdRoute.PATCH as Handler)(
      req("PATCH", "/api/digital-twin/nodes/n1", { displayName: "N", organizationId: "org-EVIL", id: "x", siteId: "s2", createdAt: "2000" }),
      params("n1"),
    );
    const patch = (svc.updateNode.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(patch.displayName).toBe("N");
    for (const k of ["organizationId", "id", "siteId", "createdAt"]) expect(patch).not.toHaveProperty(k);
  });

  it("PATCH /tags/[id] cannot move a tag to another asset", async () => {
    await (tagIdRoute.PATCH as Handler)(req("PATCH", "/api/digital-twin/tags/t1", { tagName: "x", assetId: "a2", tagPath: "z" }), params("t1"));
    const patch = (svc.updateTag.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("assetId");
    expect(patch).not.toHaveProperty("tagPath");
  });
});

describe("validation at the boundary", () => {
  it("rejects a malformed siteId in a query with 400", async () => {
    const res = await (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes?siteId=a%20b"));
    expect(res.status).toBe(400);
    expect(svc.listNodesPage).not.toHaveBeenCalled();
  });

  it("answers a malformed path id exactly like an absent record (404)", async () => {
    const res = await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/a%20b"), params("a b"));
    expect(res.status).toBe(404);
    expect(svc.getNode).not.toHaveBeenCalled();
  });

  it("rejects an invalid nodeType with 400 and does not reach the service", async () => {
    const res = await (nodesRoute.POST as Handler)(req("POST", "/api/digital-twin/nodes", { siteId: "s1", displayName: "N", nodeType: "ROBOT" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_FAILED");
    expect(svc.createNode).not.toHaveBeenCalled();
  });

  it("rejects oversized metadata with 400", async () => {
    const res = await (nodesRoute.POST as Handler)(
      req("POST", "/api/digital-twin/nodes", { siteId: "s1", displayName: "N", nodeType: "AREA", metadata: { blob: "x".repeat(20_000) } }),
    );
    expect(res.status).toBe(400);
    expect(svc.createNode).not.toHaveBeenCalled();
  });

  it("rejects an oversize request body with 413", async () => {
    const res = await (nodesRoute.POST as Handler)(req("POST", "/api/digital-twin/nodes", "x".repeat(70_000)));
    expect(res.status).toBe(413);
    expect(svc.createNode).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 INVALID_JSON", async () => {
    const res = await (nodesRoute.POST as Handler)(req("POST", "/api/digital-twin/nodes", "{oops"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_JSON");
  });

  it("graph requires a siteId", async () => {
    const res = await (graphRoute.GET as Handler)(req("GET", "/api/digital-twin/graph"));
    expect(res.status).toBe(400);
  });
});

describe("error contract through the routes", () => {
  const prismaLike = (code: string, message: string) => Object.assign(new Error(message), { code, meta: { target: ["secret_index"] } });

  it("a P2002 from the service is a 409 that names no constraint", async () => {
    svc.createNode.mockRejectedValueOnce(prismaLike("P2002", "Unique constraint failed on `uq_secret_index`"));
    const res = await cases.find((c) => c.name === "POST /nodes")!.call();
    expect(res.status).toBe(409);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/secret_index|constraint|P2002/i);
  });

  it("a P2003 is a 409 REFERENCE_CONFLICT", async () => {
    svc.createRelation.mockRejectedValueOnce(prismaLike("P2003", "Foreign key constraint failed on DigitalTwinRelation_sourceNodeId_fkey"));
    const res = await cases.find((c) => c.name === "POST /relations")!.call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("REFERENCE_CONFLICT");
    expect(JSON.stringify(body)).not.toMatch(/fkey|DigitalTwinRelation/);
  });

  it("an unexpected failure is a 500 with a fixed body", async () => {
    svc.updateNode.mockRejectedValueOnce(new Error("relation \"DigitalTwinNode\" does not exist at 10.1.2.3"));
    const res = await cases.find((c) => c.name === "PATCH /nodes/[id]")!.call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  it("a domain refusal keeps its own status and code (cycle → 422)", async () => {
    const { TwinDomainError } = await import("@/lib/digital-twin/errors");
    svc.createRelation.mockRejectedValueOnce(new TwinDomainError("HIERARCHY_CYCLE", 422, "This change would create a cycle in the hierarchy"));
    const res = await cases.find((c) => c.name === "POST /relations")!.call();
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("HIERARCHY_CYCLE");
  });

  it("a missing database (service returns null) is a 503", async () => {
    svc.createNode.mockResolvedValueOnce(null as never);
    const res = await cases.find((c) => c.name === "POST /nodes")!.call();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("STORAGE_UNAVAILABLE");
  });

  it("a thrown error in a GET is also sanitised", async () => {
    svc.listNodesPage.mockRejectedValueOnce(new Error("password authentication failed for user hermes"));
    const res = await cases.find((c) => c.name === "GET /nodes")!.call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/password|hermes/);
  });
});

// ── RV-03 ───────────────────────────────────────────────────────────────────
const { REFUSAL_MESSAGE } = await import("@/lib/auth/context-result");

describe("platform refusals keep status, message AND code (RV-03)", () => {
  const OFFICIAL: Array<[keyof typeof REFUSAL_MESSAGE, number]> = [
    ["AUTHENTICATION_REQUIRED", 401],
    ["ORGANIZATION_SELECTION_REQUIRED", 409],
    ["ORGANIZATION_CONTEXT_CONFLICT", 409],
    ["ORGANIZATION_PRECONDITION_REQUIRED", 428],
    ["ORGANIZATION_CONTEXT_UNAVAILABLE", 503],
    ["INTERNAL_ERROR", 500],
  ];
  const rows = cases.flatMap((c) => OFFICIAL.map(([code, status]) => ({ name: c.name, call: c.call, code, status })));

  it.each(rows)("$name · requirePlatformAuth refuses with $code → $status, forwarded verbatim", async ({ call, code, status }) => {
    h.refuse = code;
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(status);
    expect(body.code).toBe(code);
    expect(body.error).toBe(REFUSAL_MESSAGE[code]);
    // Exactly {error, code}: no stack, no internals, no extra fields.
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    expect(allSinks()).toBe(0);
  });

  it.each(cases)("$name · a non-member keeps 403 FORBIDDEN", async (c) => {
    h.orgActor = "nonmember";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it.each(cases.filter((c) => c.write))("$name · an RBAC permission denial keeps 403 FORBIDDEN", async (c) => {
    h.orgRole = "VIEWER";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it.each(cases)("$name · session-required keeps 403 SESSION_REQUIRED", async (c) => {
    h.auth = "apikey";
    const res = await c.call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("SESSION_REQUIRED");
  });

  it("an UNCODED refusal outside 401/403 keeps its status and is NOT relabelled FORBIDDEN", async () => {
    h.orgActor = "uncoded409";
    const res = await cases.find((c) => c.name === "GET /nodes")!.call();
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("REQUEST_REFUSED");
    expect(body.code).not.toBe("FORBIDDEN");
  });

  it("an unexpected exception is still the fixed sanitised 500", async () => {
    svc.listNodesPage.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.9.9.9 password=hunter2"));
    const res = await cases.find((c) => c.name === "GET /nodes")!.call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });
});

// ── RV-02 ───────────────────────────────────────────────────────────────────
describe("POST /relations — hidden and missing endpoints are indistinguishable (RV-02)", () => {
  const post = (s: string, t: string) =>
    (relationsRoute.POST as Handler)(req("POST", "/api/digital-twin/relations", { sourceNodeId: s, targetNodeId: t, relationType: "FEEDS" }));
  const snap = async (res: Response) => ({
    status: res.status,
    body: await res.json(),
    headers: [...res.headers.entries()].filter(([k]) => ["content-type", "cache-control", "retry-after", "www-authenticate"].includes(k)),
  });

  beforeEach(() => {
    // The caller manages site s1 only. n1 (s1) is theirs; n3 (s2) is a REAL node they must not see.
    h.siteRoles = { s1: "SITE_MANAGER" };
    h.allowed = ["s1"];
  });

  it("a real node at an unreachable site answers exactly like a missing SOURCE", async () => {
    const hidden = await snap(await post("n3", "n1"));
    const missing = await snap(await post("does-not-exist", "n1"));
    expect(hidden).toEqual(missing);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe("SOURCE_NODE_NOT_FOUND");
  });

  it("a real node at an unreachable site answers exactly like a missing TARGET", async () => {
    const hidden = await snap(await post("n1", "n3"));
    const missing = await snap(await post("n1", "does-not-exist"));
    expect(hidden).toEqual(missing);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe("TARGET_NODE_NOT_FOUND");
  });

  it("the generic NODE_NOT_FOUND of the earlier version is gone from this route", async () => {
    for (const [s, t] of [["n3", "n1"], ["n1", "n3"], ["n3", "n3"], ["x", "y"]] as const) {
      const body = (await snap(await post(s, t))).body;
      expect(body.code, `${s}→${t}`).not.toBe("NODE_NOT_FOUND");
      expect(JSON.stringify(body)).not.toMatch(/"Node not found"/);
    }
  });

  it("source and target keep DIFFERENT endpoint-specific answers from each other", async () => {
    const s = (await snap(await post("does-not-exist", "n1"))).body;
    const t = (await snap(await post("n1", "does-not-exist"))).body;
    expect(s.code).toBe("SOURCE_NODE_NOT_FOUND");
    expect(t.code).toBe("TARGET_NODE_NOT_FOUND");
  });

  it("an authorised source with a hidden target is refused as TARGET, and nothing is created", async () => {
    const res = await post("n1", "n3");
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("TARGET_NODE_NOT_FOUND");
    expect(svc.createRelation).not.toHaveBeenCalled();
  });

  it("a hidden source with an authorised target is refused as SOURCE, and nothing is created", async () => {
    const res = await post("n3", "n1");
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SOURCE_NODE_NOT_FOUND");
    expect(svc.createRelation).not.toHaveBeenCalled();
  });

  it("two reachable endpoints still reach the service", async () => {
    h.nodes.n2 = { id: "n2", siteId: "s1" };
    const res = await post("n1", "n2");
    expect(res.status).toBe(201);
    expect(svc.createRelation).toHaveBeenCalledTimes(1);
  });

  it("no response names the hidden id", async () => {
    const res = await post("n3", "n1");
    expect(JSON.stringify(await res.json())).not.toContain("n3");
  });
});

describe("site scope — inactive sites (IR-01)", () => {
  beforeEach(() => {
    h.siteRoles = { s1: "SITE_MANAGER", s2: "SITE_MANAGER" };
    h.allowed = ["s1", "s2"];     // the UserSite grants are both ACTIVE ...
    h.inactive = ["s2"];          // ... but site s2 itself is not
  });

  it("every collection route receives ONLY the active granted sites", async () => {
    await (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes"));
    await (relationsRoute.GET as Handler)(req("GET", "/api/digital-twin/relations"));
    await (layoutRoute.GET as Handler)(req("GET", "/api/digital-twin/layout"));
    await (tagsRoute.GET as Handler)(req("GET", "/api/digital-twin/tags?assetId=a1"));
    await (nodeIdRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes/n1"), params("n1"));
    expect(svc.listNodesPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: ["s1"] }));
    expect(svc.listRelationsPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: ["s1"] }));
    expect(svc.listLayoutsPage).toHaveBeenCalledWith("org-A", undefined, ["s1"]);
    expect(svc.listTagsPage).toHaveBeenCalledWith("a1", "org-A", { allowedSiteIds: ["s1"] });
    expect(svc.getNodeRelations).toHaveBeenCalledWith("n1", "org-A", { allowedSiteIds: ["s1"] });
  });

  it("an explicit ?siteId of the inactive site is passed through unchanged but cannot widen the scope", async () => {
    await (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes?siteId=s2"));
    await (layoutRoute.GET as Handler)(req("GET", "/api/digital-twin/layout?siteId=s2"));
    expect(svc.listNodesPage).toHaveBeenCalledWith("org-A", { siteId: "s2", allowedSiteIds: ["s1"] });
    expect(svc.listLayoutsPage).toHaveBeenCalledWith("org-A", "s2", ["s1"]);
  });

  it("a member whose only grant is an inactive site gets the authorised-empty allow-list everywhere", async () => {
    h.allowed = ["s2"];
    await (nodesRoute.GET as Handler)(req("GET", "/api/digital-twin/nodes"));
    await (relationsRoute.GET as Handler)(req("GET", "/api/digital-twin/relations"));
    await (layoutRoute.GET as Handler)(req("GET", "/api/digital-twin/layout"));
    await (tagsRoute.GET as Handler)(req("GET", "/api/digital-twin/tags?assetId=a2"));
    expect(svc.listNodesPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: [] }));
    expect(svc.listRelationsPage).toHaveBeenCalledWith("org-A", expect.objectContaining({ allowedSiteIds: [] }));
    expect(svc.listLayoutsPage).toHaveBeenCalledWith("org-A", undefined, []);
    expect(svc.listTagsPage).toHaveBeenCalledWith("a2", "org-A", { allowedSiteIds: [] });
  });
});
