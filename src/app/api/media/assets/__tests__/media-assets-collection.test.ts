/**
 * PHASE 102 — `/api/media/assets` (collection) route tests.
 *
 * The real authorization chain runs: `requirePlatformAuth` → `requireOrgActor`
 * → `requirePermission` against the real `src/lib/org/rbac.ts` table, and the
 * real repository in `src/lib/media/db.ts` against an in-memory Prisma double.
 * Only the edges are mocked, so a regression in the RBAC table or in the
 * published-only gate fails these tests rather than passing through a mock.
 *
 * Invariants asserted here:
 *   CROSS_TENANT_MEDIA_LIST = 0
 *   UNKNOWN_QUERY_PARAMETER_SILENTLY_IGNORED = 0
 *   CLIENT_SUPPLIED_TENANT_OR_LIFECYCLE = 0
 *   UNENTITLED_MEDIA_CREATE = 0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  freshState,
  getRequest,
  installMocks,
  jsonRequest,
  seedAsset,
  seedMember,
  uninstallMocks,
  type HarnessState,
} from "./harness";

let state: HarnessState;

beforeEach(() => {
  vi.resetModules();
  state = freshState();
  installMocks(state);
});

afterEach(() => {
  uninstallMocks();
  vi.restoreAllMocks();
});

async function listGET(query = "") {
  const { GET } = await import("../route");
  const res = await GET(getRequest(query));
  return { res, json: (await res.json()) as Record<string, never> };
}

async function createPOST(body: unknown, contentType = "application/json") {
  const { POST } = await import("../route");
  const res = await POST(jsonRequest("POST", body, "", contentType));
  return { res, json: (await res.json()) as Record<string, never> };
}

function actAs(role: string, userId = "user-1", organizationId = "org-A") {
  state.payload = { sub: userId, role: "engineer", sid: "sid-1" };
  seedMember(state, { userId, organizationId, role });
}

describe("GET /api/media/assets — authentication and membership", () => {
  it("401 without a session", async () => {
    state.payload = null;
    const { res } = await listGET();
    expect(res.status).toBe(401);
  });

  it("401 when the session has been revoked", async () => {
    actAs("ENGINEER");
    state.sessionActive = false;
    const { res } = await listGET();
    expect(res.status).toBe(401);
  });

  it("409 when the caller belongs to no organization", async () => {
    state.payload = { sub: "orphan", role: "engineer", sid: "s" };
    const { res } = await listGET();
    /*
     * No ACTIVE membership → no server-derived org → the platform guard refuses,
     * exactly as before. PHASE 107 STAGE 6-A changed only WHICH refusal: this
     * caller IS authenticated, so 401 told them to sign in again — advice that
     * cannot help. The property under test, that the guard refuses and serves
     * nothing, is unchanged.
     */
    expect(res.status).toBe(409);
    expect(state.tables.mediaAsset.length).toBe(0);
  });

  it("refuses a membership that is not ACTIVE", async () => {
    state.payload = { sub: "u", role: "engineer", sid: "s" };
    seedMember(state, { userId: "u", organizationId: "org-A", role: "ENGINEER", status: "SUSPENDED" });
    const { res } = await listGET();
    // The org is derived from ACTIVE memberships only, so a suspended member has
    // no server-derived tenant at all and is refused before the membership guard
    // ever runs. Two independent gates, both fail-closed — and still refused;
    // only the status now says WHY (409, not "your session ended").
    expect(res.status).toBe(409);
    expect(state.tables.mediaAsset.length).toBe(0);
  });
});

describe("GET /api/media/assets — tenant isolation", () => {
  it("never returns another organization's assets", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "a-own", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY" });
    seedAsset(state, { id: "b-other", organizationId: "org-B", status: "PUBLISHED", visibility: "PUBLIC", processingState: "READY" });

    const { res, json } = await listGET();
    expect(res.status).toBe(200);
    const ids = (json.assets as unknown as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(["a-own"]);
  });
});

describe("GET /api/media/assets — the published-only default", () => {
  beforeEach(() => {
    actAs("ENGINEER");
    seedAsset(state, { id: "pub", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY" });
    seedAsset(state, { id: "draft", organizationId: "org-A", status: "DRAFT", visibility: "ORGANIZATION" });
    seedAsset(state, { id: "private", organizationId: "org-A", status: "PUBLISHED", visibility: "PRIVATE", processingState: "READY" });
    seedAsset(state, { id: "unvalidated", organizationId: "org-A", status: "PUBLISHED", visibility: "PUBLIC", processingState: "QUARANTINED" });
  });

  it("hides drafts, private assets and unvalidated bytes by default", async () => {
    const { res, json } = await listGET();
    expect(res.status).toBe(200);
    expect((json.assets as unknown as Array<{ id: string }>).map((a) => a.id)).toEqual(["pub"]);
    expect(json.scope).toBe("published");
  });

  it("scope=editorial reveals unpublished assets to an authoring actor", async () => {
    const { res, json } = await listGET("?scope=editorial");
    expect(res.status).toBe(200);
    const ids = (json.assets as unknown as Array<{ id: string }>).map((a) => a.id).sort();
    expect(ids).toEqual(["draft", "private", "pub", "unvalidated"]);
  });
});

describe("GET /api/media/assets — scope=editorial is not granted by view_media alone", () => {
  it("a VIEWER may list published media but not the editorial scope", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "pub", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY" });
    seedAsset(state, { id: "draft", organizationId: "org-A", status: "DRAFT" });

    expect((await listGET()).res.status).toBe(200);
    const editorial = await listGET("?scope=editorial");
    expect(editorial.res.status).toBe(403);
  });

  it("a BILLING_ADMIN is likewise refused the editorial scope", async () => {
    actAs("BILLING_ADMIN");
    expect((await listGET("?scope=editorial")).res.status).toBe(403);
  });

  it("a MANAGER (review_media) may read the editorial scope", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "draft", organizationId: "org-A", status: "DRAFT" });
    const { res, json } = await listGET("?scope=editorial");
    expect(res.status).toBe(200);
    expect((json.assets as unknown as unknown[]).length).toBe(1);
  });
});

describe("GET /api/media/assets — the query allow-list rejects rather than ignores", () => {
  beforeEach(() => {
    actAs("ENGINEER");
    seedAsset(state, { id: "c1", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY", categoryId: "cat-1" });
    seedAsset(state, { id: "c2", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY", categoryId: "cat-2" });
  });

  it("400s on an unknown parameter instead of widening the result set", async () => {
    const { res, json } = await listGET("?catgoryId=cat-1");
    expect(res.status).toBe(400);
    expect(json.code).toBe("UNKNOWN_QUERY_PARAMETER");
  });

  it("does not echo the unknown parameter back to the caller", async () => {
    const { json } = await listGET("?%3Cscript%3E=1");
    expect(JSON.stringify(json)).not.toContain("script");
  });

  it("applies an allow-listed filter exactly", async () => {
    const { res, json } = await listGET("?categoryId=cat-1");
    expect(res.status).toBe(200);
    expect((json.assets as unknown as Array<{ id: string }>).map((a) => a.id)).toEqual(["c1"]);
  });

  it("400s on an out-of-range page size rather than silently clamping", async () => {
    expect((await listGET("?pageSize=999")).res.status).toBe(400);
    expect((await listGET("?pageSize=0")).res.status).toBe(400);
    expect((await listGET("?page=0")).res.status).toBe(400);
    expect((await listGET("?pageSize=abc")).res.status).toBe(400);
  });

  it("400s on a skillLevel outside the closed vocabulary", async () => {
    expect((await listGET("?skillLevel=GURU")).res.status).toBe(400);
  });

  it("is paginated and reports totals", async () => {
    const { res, json } = await listGET("?pageSize=1&page=1");
    expect(res.status).toBe(200);
    expect((json.assets as unknown as unknown[]).length).toBe(1);
    expect(json.total).toBe(2);
    expect(json.hasMore).toBe(true);
  });
});

describe("POST /api/media/assets — RBAC then entitlement", () => {
  it("a VIEWER cannot create, and the entitlement is never consulted", async () => {
    actAs("VIEWER");
    const { res } = await createPOST({ title: "Intro to PLCs" });
    expect(res.status).toBe(403);
    expect(state.entitlementCalls.length).toBe(0);
  });

  it("an ENGINEER creates a DRAFT and the entitlement is checked for the actor's org", async () => {
    actAs("ENGINEER");
    const { res, json } = await createPOST({ title: "Intro to PLCs" });
    expect(res.status).toBe(201);
    const asset = json.asset as unknown as Record<string, unknown>;
    expect(asset.status).toBe("DRAFT");
    expect(asset.processingState).toBe("PENDING_UPLOAD");
    expect(asset.slug).toBe("intro-to-plcs");
    expect(state.entitlementCalls[0]).toMatchObject({
      organisationId: "org-A",
      entitlementKey: "video_hub",
    });
  });

  it("returns the entitlement denial response verbatim", async () => {
    actAs("ENGINEER");
    state.entitlementAllowed = false;
    const { res, json } = await createPOST({ title: "Intro to PLCs" });
    expect(res.status).toBe(402);
    expect(json.code).toBe("FEATURE_NOT_ENTITLED");
    expect(state.tables.mediaAsset.length).toBe(0);
  });

  it("429s with Retry-After when the write limiter refuses", async () => {
    actAs("ENGINEER");
    state.rateLimitAllowed = false;
    const { res } = await createPOST({ title: "Intro to PLCs" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(state.entitlementCalls.length).toBe(0);
  });
});

describe("POST /api/media/assets — mass assignment", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("rejects a client-supplied tenant, lifecycle, slug, counters or attribution", async () => {
    for (const bad of [
      { title: "t", organizationId: "org-B" },
      { title: "t", status: "PUBLISHED" },
      { title: "t", processingState: "READY" },
      { title: "t", slug: "chosen-by-client" },
      { title: "t", publishedAt: "2026-01-01T00:00:00.000Z" },
      { title: "t", viewCount: 9999 },
      { title: "t", createdBy: "someone-else" },
      { title: "t", storageKey: "../../etc/passwd" },
    ]) {
      const { res, json } = await createPOST(bad);
      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_INPUT");
    }
    expect(state.tables.mediaAsset.length).toBe(0);
  });

  it("stamps organizationId and createdBy from the actor", async () => {
    await createPOST({ title: "Owned by the actor" });
    const row = state.tables.mediaAsset[0];
    expect(row.organizationId).toBe("org-A");
    expect(row.createdBy).toBe("user-1");
  });

  it("requires a title", async () => {
    expect((await createPOST({})).res.status).toBe(400);
    expect((await createPOST({ title: "   " })).res.status).toBe(400);
  });
});

describe("POST /api/media/assets — body handling", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("415s on a non-JSON content type", async () => {
    const { res } = await createPOST({ title: "t" }, "text/plain");
    expect(res.status).toBe(415);
  });

  it("413s on an oversized body without parsing it", async () => {
    const oversized = JSON.stringify({ title: "t", description: "x".repeat(40 * 1024) });
    const { POST } = await import("../route");
    const res = await POST(jsonRequest("POST", oversized));
    expect(res.status).toBe(413);
  });

  it("400s on malformed JSON", async () => {
    const { POST } = await import("../route");
    const res = await POST(jsonRequest("POST", "{ not json"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/media/assets — server-derived slug", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("de-duplicates within the organization", async () => {
    const first = await createPOST({ title: "PLC Basics" });
    const second = await createPOST({ title: "PLC Basics" });
    expect((first.json.asset as unknown as Record<string, string>).slug).toBe("plc-basics");
    expect((second.json.asset as unknown as Record<string, string>).slug).toBe("plc-basics-2");
  });

  it("keeps a non-Latin title meaningful instead of collapsing it", async () => {
    const { json } = await createPOST({ title: "آموزش پی ال سی", primaryLocale: "fa" });
    expect((json.asset as unknown as Record<string, string>).slug).toBe("آموزش-پی-ال-سی");
  });

  it("falls back to a generated slug when the title has no slug-able characters", async () => {
    const { res, json } = await createPOST({ title: "!!! ???" });
    expect(res.status).toBe(201);
    expect((json.asset as unknown as Record<string, string>).slug).toMatch(/^media-[a-z0-9]+$/);
  });

  it("does not collide with another organization's identical slug", async () => {
    seedAsset(state, { id: "other", organizationId: "org-B", slug: "plc-basics" });
    const { json } = await createPOST({ title: "PLC Basics" });
    expect((json.asset as unknown as Record<string, string>).slug).toBe("plc-basics");
  });
});

describe("POST /api/media/assets — cross-tenant references", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("refuses a category belonging to another organization", async () => {
    state.tables.mediaCategory.push({ id: "cat-b", organizationId: "org-B" });
    const { res, json } = await createPOST({ title: "t", categoryId: "cat-b" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REFERENCE");
    expect(state.tables.mediaAsset.length).toBe(0);
  });

  it("accepts a category belonging to the actor's organization", async () => {
    state.tables.mediaCategory.push({ id: "cat-a", organizationId: "org-A" });
    const { res, json } = await createPOST({ title: "t", categoryId: "cat-a" });
    expect(res.status).toBe(201);
    expect((json.asset as unknown as Record<string, string>).categoryId).toBe("cat-a");
  });

  it("refuses an industrial site belonging to another organization", async () => {
    state.tables.industrialSite.push({ id: "site-b", organizationId: "org-B" });
    const { res } = await createPOST({ title: "t", siteId: "site-b" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/media/assets — persistence and audit", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("writes the primary-locale translation alongside the asset", async () => {
    await createPOST({ title: "Motor Protection", primaryLocale: "de", summary: "kurz" });
    expect(state.tables.mediaAssetTranslation.length).toBe(1);
    const translation = state.tables.mediaAssetTranslation[0];
    expect(translation.locale).toBe("de");
    expect(translation.title).toBe("Motor Protection");
    expect(translation.organizationId).toBe("org-A");
  });

  it("records an audit event that carries no authored free text", async () => {
    await createPOST({ title: "A confidential internal title", summary: "secret summary" });
    const event = state.auditEvents.find((e) => e.action === "media.asset.created");
    expect(event).toBeDefined();
    expect(event?.organizationId).toBe("org-A");
    expect(JSON.stringify(event)).not.toContain("confidential");
    expect(JSON.stringify(event)).not.toContain("secret summary");
  });

  it("fails closed when the database is unavailable — and says so honestly", async () => {
    state.databaseAvailable = false;
    const { res } = await createPOST({ title: "t" });
    /*
     * PHASE 107 STAGE 6-A — still fails closed, and nothing is written. What
     * changed is the diagnosis: an unreachable database is the platform's
     * problem, not the caller's, and answering 401 sent an operator to a login
     * form in the middle of an outage.
     */
    expect(res.status).toBe(500);
    expect(state.tables.mediaAsset.length).toBe(0);
  });
});

/**
 * PHASE 107 STAGE 6-A.1 — the refusal a Media route sends is the one it was given.
 *
 * The independent review found eight Media routes that did not forward the
 * refusal verbatim, in three shapes. The worst hard-coded the STATUS as well as
 * the code, so three upload routes still answered 401 to a signed-in caller with
 * no organization — the original defect, alive on the routes that accept files.
 * Others forwarded a correct 409 while hard-coding
 * `code: "AUTHENTICATION_REQUIRED"`, so the status and the code contradicted one
 * another and a client branching on either got a different answer.
 *
 * These assert the whole refusal — status AND machine code — plus the two things
 * that must remain true whatever the code says: nothing is served, and nothing
 * is written.
 */
describe("Stage 6-A.1 — Media forwards the refusal exactly", () => {
  it("401 with AUTHENTICATION_REQUIRED when there is no session", async () => {
    state.payload = null;
    const { res, json } = await listGET();
    expect(res.status).toBe(401);
    expect((json as { code?: string }).code).toBe("AUTHENTICATION_REQUIRED");
    expect((json as { assets?: unknown }).assets).toBeUndefined();
  });

  it("409 with ORGANIZATION_CONTEXT_REQUIRED — never a contradictory code", async () => {
    state.payload = { sub: "orphan", role: "engineer", sid: "s" };
    const { res, json } = await listGET();
    const code = (json as { code?: string }).code;

    expect(res.status).toBe(409);
    // The exact contradiction the review caught: 409 carrying "sign in again".
    expect(code).toBe("ORGANIZATION_CONTEXT_REQUIRED");
    expect(code).not.toBe("AUTHENTICATION_REQUIRED");
    expect((json as { assets?: unknown }).assets).toBeUndefined();
  });

  it("500 with INTERNAL_ERROR when the store is unavailable", async () => {
    state.databaseAvailable = false;
    const { res, json } = await listGET();
    expect(res.status).toBe(500);
    expect((json as { code?: string }).code).toBe("INTERNAL_ERROR");
    expect((json as { assets?: unknown }).assets).toBeUndefined();
  });

  it("a refusal never writes and never discloses another tenant", async () => {
    seedAsset(state, { id: "asset-other", organizationId: "org-OTHER", slug: "other-tenant-asset" });
    const beforeCount = state.tables.mediaAsset.length;

    state.payload = { sub: "orphan", role: "engineer", sid: "s" };
    const { res, json } = await listGET();
    expect(res.status).toBe(409);

    // Nothing served, nothing written, and no trace of the other tenant.
    expect(JSON.stringify(json)).not.toMatch(/org-OTHER|asset-other|other-tenant-asset/);
    expect(state.tables.mediaAsset.length).toBe(beforeCount);

    const write = await createPOST({ title: "t" });
    expect(write.res.status).toBe(409);
    expect(state.tables.mediaAsset.length).toBe(beforeCount);
  });

  it("the three refusal statuses stay distinct", async () => {
    const seen: number[] = [];

    state.payload = null;
    seen.push((await listGET()).res.status);

    state.payload = { sub: "orphan", role: "engineer", sid: "s" };
    seen.push((await listGET()).res.status);

    state.databaseAvailable = false;
    seen.push((await listGET()).res.status);

    expect(seen).toEqual([401, 409, 500]);
    expect(new Set(seen).size).toBe(3);
  });
});
