/**
 * PHASE 102 — the AUTHENTICATED per-subject media plane.
 *
 * ADR §8: "every read of `MediaSave` / `MediaWatchProgress` is filtered by the
 * authenticated `userId` at the database query level, never by post-filtering in
 * application code."
 *
 * This file proves that as a property of the QUERY, not of the response. The real
 * `src/lib/media/db.ts` runs against an in-memory Prisma double, and the assertions
 * inspect the `where` clause that actually reached Prisma — so an implementation
 * that fetched every subject's rows and filtered them in JavaScript would fail here
 * even though its output looked identical.
 *
 * Concretely, user A must not be able to read, write or delete user B's rows:
 *   - by naming B in the query string       → the query surface is a closed
 *                                             allow-list, so it is a 400;
 *   - by naming B in the request body       → the schemas are `.strict()`, so it is
 *                                             a 400 (there is no `userId` field);
 *   - by any other means                    → `userId` is taken only from the
 *                                             verified session and is a required
 *                                             predicate on every read and write.
 *
 * The suite also proves the gate ORDER (auth → membership → RBAC → entitlement),
 * that an API key is refused as a subject, that a denied entitlement response is
 * returned verbatim, and that a client cannot store nonsense progress.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  ORG_A,
  ORG_B,
  asset,
  createMediaPrismaDouble,
  type Double,
} from "../../public/__tests__/media-prisma-double";

const PROGRESS_ROUTE = "../progress/route";
const FAVOURITES_ROUTE = "../favourites/route";

const USER_A = "user-A";
const USER_B = "user-B";
const ORIGIN = "http://localhost:3000";

type AuthState =
  | { kind: "anon" }
  | { kind: "apiKey" }
  | { kind: "nonMember" }
  | { kind: "member"; role: string; orgId?: string; userId?: string };

let db: Double;
let auth: AuthState;
let entitled: boolean;
let entitlementCalls: Array<Record<string, unknown>>;

function seed(): Double {
  return createMediaPrismaDouble({
    organization: [{ ...ORG_A }, { ...ORG_B }],
    mediaAsset: [
      asset("a-public", ORG_A.id, "plc-basics", { durationSeconds: 600 }),
      asset("a-internal", ORG_A.id, "internal-only", { visibility: "ORGANIZATION" }),
      asset("a-draft", ORG_A.id, "secret-draft", {
        status: "DRAFT",
        visibility: "PRIVATE",
        processingState: "PENDING_UPLOAD",
      }),
      asset("a-noduration", ORG_A.id, "no-duration", { durationSeconds: null }),
      asset("b-public", ORG_B.id, "other-tenant"),
    ],
    mediaWatchProgress: [
      {
        id: "wp-A",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        userId: USER_A,
        positionSeconds: 120,
        progressPct: 20,
        completedAt: null,
        lastWatchedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "wp-B",
        organizationId: ORG_A.id,
        mediaAssetId: "a-internal",
        userId: USER_B,
        positionSeconds: 500,
        progressPct: 80,
        completedAt: null,
        lastWatchedAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ],
    mediaSave: [
      {
        id: "sv-A",
        organizationId: ORG_A.id,
        mediaAssetId: "a-internal",
        userId: USER_A,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "sv-B",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        userId: USER_B,
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ],
  });
}

async function loadRoute(routePath: string) {
  vi.resetModules();

  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () => {
      if (auth.kind === "anon") return { error: "Authentication required", status: 401 };
      if (auth.kind === "apiKey") {
        // An API key resolves an org but NO user — the shape the real helper returns.
        return { ctx: { userId: null, orgId: ORG_A.id, authMethod: "apikey", scopes: ["admin"] } };
      }
      const orgId = auth.kind === "member" ? (auth.orgId ?? ORG_A.id) : ORG_A.id;
      const userId = auth.kind === "member" ? (auth.userId ?? USER_A) : USER_A;
      return { ctx: { userId, orgId, authMethod: "jwt", scopes: ["admin"] } };
    },
  }));

  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () => {
      if (auth.kind === "anon") return { error: "Authentication required", status: 401 };
      if (auth.kind === "nonMember") {
        return { error: "Not a member of this organization", status: 403 };
      }
      return {
        ctx: {
          userId: auth.kind === "member" ? (auth.userId ?? USER_A) : USER_A,
          orgId: auth.kind === "member" ? (auth.orgId ?? ORG_A.id) : ORG_A.id,
          memberId: "mem-A",
          role: auth.kind === "member" ? auth.role : "ENGINEER",
          status: "ACTIVE",
        },
      };
    },
    getUserIdFromRequest: async () => USER_A,
  }));

  vi.doMock("@/lib/billing-governance/runtime/require-entitlement", () => ({
    enforceEntitlement: async (args: Record<string, unknown>) => {
      entitlementCalls.push(args);
      if (entitled) return { ok: true, decision: { allowed: true } };
      return {
        ok: false,
        decision: { allowed: false, reason: "FEATURE_NOT_IN_PLAN" },
        response: NextResponse.json(
          { error: "entitlement_denied", reason: "FEATURE_NOT_IN_PLAN" },
          { status: 402 },
        ),
      };
    },
  }));

  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db.client }));

  return import(routePath);
}

beforeEach(() => {
  db = seed();
  auth = { kind: "member", role: "ENGINEER" };
  entitled = true;
  entitlementCalls = [];
  (globalThis as Record<string, unknown>).__hermesAudit = [];
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("@/lib/api/auth");
  vi.doUnmock("@/lib/org/context");
  vi.doUnmock("@/lib/billing-governance/runtime/require-entitlement");
  vi.doUnmock("@/lib/db/prisma");
});

function req(
  url: string,
  init: { method?: string; body?: unknown; origin?: string | null; contentType?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.body !== undefined && init.contentType !== null) {
    headers["content-type"] = init.contentType ?? "application/json";
  }
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

/** Every `where` the given model saw that carries a `userId` predicate. */
function userScopedWheres(model: string): Record<string, unknown>[] {
  return db.wheres(model).filter((w) => "userId" in w);
}

// ════════════════════════════════════════════════════════════════════════════
// A. The gate — order, API keys, RBAC, entitlement
// ════════════════════════════════════════════════════════════════════════════

describe("per-subject media plane — the gate", () => {
  it("answers 401 for an anonymous caller and touches no data", async () => {
    auth = { kind: "anon" };
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/progress"));
    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0);
    expect(entitlementCalls).toHaveLength(0);
  });

  it("refuses an API-key context — a key is not a subject", async () => {
    auth = { kind: "apiKey" };
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/progress"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "a user session is required" });
    expect(db.calls).toHaveLength(0);
  });

  it("answers 403 for a non-member and never reaches the entitlement check", async () => {
    auth = { kind: "nonMember" };
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    expect((await GET(req("http://localhost/api/media/me/progress"))).status).toBe(403);
    expect(entitlementCalls).toHaveLength(0);
  });

  it("enforces view_media — a role without it is 403 BEFORE the entitlement check", async () => {
    auth = { kind: "member", role: "MEMBER" }; // holds no media permission at all
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/progress"));
    expect(res.status).toBe(403);
    // RBAC first: an unauthorised caller learns nothing about the tenant's plan.
    expect(entitlementCalls).toHaveLength(0);
    expect(db.calls).toHaveLength(0);
  });

  it("returns the entitlement denial response verbatim", async () => {
    entitled = false;
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/progress"));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "entitlement_denied", reason: "FEATURE_NOT_IN_PLAN" });
    expect(db.calls).toHaveLength(0);
    expect(entitlementCalls[0]).toMatchObject({
      organisationId: ORG_A.id,
      entitlementKey: "video_hub",
      userId: USER_A,
    });
  });

  it("checks availability (0 units) on a read and consumption (1 unit) on a write", async () => {
    const { GET, PUT } = await loadRoute(PROGRESS_ROUTE);
    await GET(req("http://localhost/api/media/me/progress"));
    expect(entitlementCalls[0].requestedUnits).toBe(0);
    await PUT(
      req("http://localhost/api/media/me/progress", {
        method: "PUT",
        body: { slug: "plc-basics", positionSeconds: 10, progressPct: 5 },
      }),
    );
    expect(entitlementCalls[1].requestedUnits).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Watch progress — private to the subject
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/media/me/progress", () => {
  it("returns ONLY the caller's rows, filtered by userId in the database query", async () => {
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/progress"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items).toEqual([
      {
        slug: "plc-basics",
        positionSeconds: 120,
        progressPct: 20,
        completed: false,
        lastWatchedAt: "2026-02-01T00:00:00.000Z",
        durationSeconds: 600,
      },
    ]);
    // Not a post-filter: the predicate reached Prisma.
    const wheres = userScopedWheres("mediaWatchProgress");
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where.userId).toBe(USER_A);
      expect(where.organizationId).toBe(ORG_A.id);
    }
    // And the joined asset still carries the repository's audience gate.
    expect(db.wheres("mediaWatchProgress", "findMany")[0].mediaAsset).toMatchObject({
      status: "PUBLISHED",
      processingState: "READY",
    });
  });

  it("cannot be redirected at another subject through the query string", async () => {
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    for (const qs of ["userId=user-B", "organizationId=org-B", "user=user-B"]) {
      const res = await GET(req(`http://localhost/api/media/me/progress?${qs}`));
      expect(res.status).toBe(400);
    }
    expect(db.calls).toHaveLength(0);
  });

  it("never returns another subject's row even when B's data is the only match on the asset", async () => {
    auth = { kind: "member", role: "ENGINEER", userId: USER_B };
    const { GET } = await loadRoute(PROGRESS_ROUTE);
    const body = await (await GET(req("http://localhost/api/media/me/progress"))).json();
    expect(body.items.map((i: { slug: string }) => i.slug)).toEqual(["internal-only"]);
    expect(JSON.stringify(body)).not.toContain("plc-basics");
  });
});

describe("PUT /api/media/me/progress", () => {
  const put = (body: unknown, init: Parameters<typeof req>[1] = {}) =>
    req("http://localhost/api/media/me/progress", { method: "PUT", body, ...init });

  it("upserts the caller's own row and repeats the userId predicate on the write", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    const res = await PUT(put({ slug: "plc-basics", positionSeconds: 300, progressPct: 50 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      slug: "plc-basics",
      positionSeconds: 300,
      progressPct: 50,
      completed: false,
    });

    const rowA = db.tables.mediaWatchProgress.find((r) => r.id === "wp-A");
    expect(rowA).toMatchObject({ positionSeconds: 300, progressPct: 50, userId: USER_A });
    // B's row is untouched.
    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-B")).toMatchObject({
      positionSeconds: 500,
      progressPct: 80,
    });

    const updates = db.wheres("mediaWatchProgress", "updateMany");
    expect(updates.length).toBe(1);
    expect(updates[0]).toMatchObject({ userId: USER_A, organizationId: ORG_A.id });
  });

  it("rejects a body that names another subject, tenant or row instead of ignoring it", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    for (const body of [
      { slug: "plc-basics", positionSeconds: 1, progressPct: 1, userId: USER_B },
      { slug: "plc-basics", positionSeconds: 1, progressPct: 1, organizationId: ORG_B.id },
      { slug: "plc-basics", positionSeconds: 1, progressPct: 1, mediaAssetId: "b-public" },
      { slug: "plc-basics", positionSeconds: 1, progressPct: 1, id: "wp-B" },
    ]) {
      const res = await PUT(put(body));
      expect(res.status).toBe(400);
    }
    // Nothing moved.
    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-B")).toMatchObject({
      progressPct: 80,
    });
    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-A")).toMatchObject({
      progressPct: 20,
    });
  });

  it("clamps nonsense — 5000% becomes 100, and a position past the end becomes the duration", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    const res = await PUT(put({ slug: "plc-basics", positionSeconds: 99_999, progressPct: 5000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ positionSeconds: 600, progressPct: 100, completed: true });
    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-A")).toMatchObject({
      positionSeconds: 600,
      progressPct: 100,
    });
  });

  it("clamps negative and fractional input to a stored integer", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    await PUT(put({ slug: "plc-basics", positionSeconds: -42, progressPct: 33.99 }));
    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-A")).toMatchObject({
      positionSeconds: 0,
      progressPct: 33,
    });
  });

  it("falls back to the absolute ceiling when the asset's duration is unknown", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    const res = await PUT(put({ slug: "no-duration", positionSeconds: 999_999, progressPct: 10 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ positionSeconds: 24 * 60 * 60 });
  });

  it("answers 404 — and writes nothing — for another tenant's asset or a draft", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    for (const slug of ["other-tenant", "secret-draft", "does-not-exist"]) {
      const res = await PUT(put({ slug, positionSeconds: 10, progressPct: 10 }));
      expect(res.status).toBe(404);
    }
    expect(db.tables.mediaWatchProgress).toHaveLength(2);
  });

  it("accepts an ORGANIZATION-visible asset, which the anonymous plane cannot see", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    const res = await PUT(put({ slug: "internal-only", positionSeconds: 30, progressPct: 10 }));
    expect(res.status).toBe(200);
    expect(db.tables.mediaWatchProgress).toHaveLength(3);
  });

  it("rejects a cross-origin write and a non-JSON content type", async () => {
    const { PUT } = await loadRoute(PROGRESS_ROUTE);
    const cross = await PUT(
      put({ slug: "plc-basics", positionSeconds: 1, progressPct: 1 }, { origin: "https://evil.example" }),
    );
    expect(cross.status).toBe(403);

    const wrongType = await PUT(
      put({ slug: "plc-basics", positionSeconds: 1, progressPct: 1 }, { contentType: "text/plain" }),
    );
    expect(wrongType.status).toBe(415);

    expect(db.tables.mediaWatchProgress.find((r) => r.id === "wp-A")).toMatchObject({
      progressPct: 20,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. Favourites — private to the subject
// ════════════════════════════════════════════════════════════════════════════

describe("/api/media/me/favourites", () => {
  it("lists ONLY the caller's saves, filtered by userId in the query", async () => {
    const { GET } = await loadRoute(FAVOURITES_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/favourites"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([
      {
        slug: "internal-only",
        savedAt: "2026-02-01T00:00:00.000Z",
        durationSeconds: 600,
        skillLevel: "BEGINNER",
      },
    ]);
    for (const where of userScopedWheres("mediaSave")) {
      expect(where.userId).toBe(USER_A);
    }
  });

  it("cannot be redirected at another subject through the query string", async () => {
    const { GET } = await loadRoute(FAVOURITES_ROUTE);
    const res = await GET(req("http://localhost/api/media/me/favourites?userId=user-B"));
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it("saves for the caller only, and is idempotent", async () => {
    const { POST } = await loadRoute(FAVOURITES_ROUTE);
    const first = await POST(
      req("http://localhost/api/media/me/favourites", { method: "POST", body: { slug: "plc-basics" } }),
    );
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ slug: "plc-basics", saved: true, created: true });

    const again = await POST(
      req("http://localhost/api/media/me/favourites", { method: "POST", body: { slug: "plc-basics" } }),
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ slug: "plc-basics", saved: true, created: false });

    const saves = db.tables.mediaSave.filter((s) => s.mediaAssetId === "a-public");
    expect(saves.map((s) => s.userId).sort()).toEqual([USER_A, USER_B]);
    // The counter moved exactly once.
    expect(db.tables.mediaAsset.find((a) => a.id === "a-public")?.saveCount).toBe(1);
  });

  it("rejects a save body that names another subject", async () => {
    const { POST } = await loadRoute(FAVOURITES_ROUTE);
    const res = await POST(
      req("http://localhost/api/media/me/favourites", {
        method: "POST",
        body: { slug: "plc-basics", userId: USER_B },
      }),
    );
    expect(res.status).toBe(400);
    expect(db.tables.mediaSave).toHaveLength(2);
  });

  it("deletes ONLY the caller's row — user B's save of the same asset survives", async () => {
    const { DELETE } = await loadRoute(FAVOURITES_ROUTE);
    // A has NOT saved `plc-basics`; B has. A's delete must be a no-op that leaves
    // B's row intact and does not disclose that it exists.
    const res = await DELETE(
      req("http://localhost/api/media/me/favourites?slug=plc-basics", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: "plc-basics", saved: false, removed: false });
    expect(db.tables.mediaSave.find((s) => s.id === "sv-B")).toBeDefined();

    const deletes = db.wheres("mediaSave", "deleteMany");
    expect(deletes[0]).toMatchObject({
      userId: USER_A,
      organizationId: ORG_A.id,
      mediaAssetId: "a-public",
    });
    // The counter is not driven negative by a delete that removed nothing.
    expect(db.tables.mediaAsset.find((a) => a.id === "a-public")?.saveCount).toBe(0);
  });

  it("removes the caller's own save", async () => {
    const { DELETE } = await loadRoute(FAVOURITES_ROUTE);
    const res = await DELETE(
      req("http://localhost/api/media/me/favourites?slug=internal-only", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: "internal-only", saved: false, removed: true });
    expect(db.tables.mediaSave.find((s) => s.id === "sv-A")).toBeUndefined();
    expect(db.tables.mediaSave.find((s) => s.id === "sv-B")).toBeDefined();
  });

  it("refuses a delete that names another subject in the query string", async () => {
    const { DELETE } = await loadRoute(FAVOURITES_ROUTE);
    const res = await DELETE(
      req("http://localhost/api/media/me/favourites?slug=internal-only&userId=user-B", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(400);
    expect(db.tables.mediaSave).toHaveLength(2);
  });

  it("answers 404 for another tenant's asset on both write verbs", async () => {
    const { POST, DELETE } = await loadRoute(FAVOURITES_ROUTE);
    expect(
      (
        await POST(
          req("http://localhost/api/media/me/favourites", {
            method: "POST",
            body: { slug: "other-tenant" },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await DELETE(
          req("http://localhost/api/media/me/favourites?slug=other-tenant", { method: "DELETE" }),
        )
      ).status,
    ).toBe(404);
    expect(db.tables.mediaSave).toHaveLength(2);
  });

  it("rejects a cross-origin write on both write verbs", async () => {
    const { POST, DELETE } = await loadRoute(FAVOURITES_ROUTE);
    expect(
      (
        await POST(
          req("http://localhost/api/media/me/favourites", {
            method: "POST",
            body: { slug: "plc-basics" },
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await DELETE(
          req("http://localhost/api/media/me/favourites?slug=internal-only", {
            method: "DELETE",
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(db.tables.mediaSave).toHaveLength(2);
  });
});
