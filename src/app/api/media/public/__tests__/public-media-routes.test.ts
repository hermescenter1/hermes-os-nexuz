/**
 * PHASE 102 — the ANONYMOUS public media plane, proven end to end.
 *
 * The real `src/lib/media/db.ts` runs against an in-memory Prisma double, so every
 * assertion below is about the `where` clause the REPOSITORY actually issued — not
 * about a stub that was told what to return. A route that started re-implementing
 * the visibility gate, or that stopped passing the default audience, fails here.
 *
 * What this file proves:
 *   A. the public library and detail reads serve ONLY PUBLISHED + PUBLIC + READY,
 *      and every "you cannot see it" case is the same 404;
 *   B. the response projection is a closed whitelist — no organizationId, no
 *      database id, no storage key, no processing/editorial internals;
 *   C. the query surface is a closed allow-list and is bounded;
 *   D. the anonymous beacon cannot attribute a view to another user, cannot write
 *      watch progress at all, stores an ipHash and never a raw address, and is
 *      bounded in bytes, content type and request rate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ORG_A,
  ORG_B,
  asset,
  createMediaPrismaDouble,
  translation,
  type Double,
} from "./media-prisma-double";

const LIST_ROUTE = "../videos/route";
const DETAIL_ROUTE = "../videos/[slug]/route";
const VIEW_ROUTE = "../videos/[slug]/view/route";

let db: Double;
let rateLimitAllows: boolean;
let sessionUserId: string | null;

const ENV_KEYS = ["JWT_ACCESS_SECRET", "HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let savedEnv: Record<string, string | undefined>;

function seed(): Double {
  return createMediaPrismaDouble({
    organization: [{ ...ORG_A }, { ...ORG_B }],
    mediaAsset: [
      asset("a-public", ORG_A.id, "plc-basics"),
      asset("a-draft", ORG_A.id, "secret-draft", {
        status: "DRAFT",
        visibility: "PRIVATE",
        processingState: "PENDING_UPLOAD",
        publishedAt: null,
        rejectionReason: "not good enough yet",
      }),
      asset("a-internal", ORG_A.id, "internal-only", { visibility: "ORGANIZATION" }),
      asset("a-validating", ORG_A.id, "still-validating", { processingState: "VALIDATING" }),
      asset("a-quarantined", ORG_A.id, "quarantined-bytes", { processingState: "QUARANTINED" }),
      asset("b-public", ORG_B.id, "other-tenant"),
    ],
    mediaAssetTranslation: [
      translation("a-public", ORG_A.id, "en", "PLC Basics"),
      translation("a-public", ORG_A.id, "fa", "مبانی پی‌ال‌سی"),
      translation("a-draft", ORG_A.id, "en", "Unreleased Draft"),
      translation("a-internal", ORG_A.id, "en", "Internal Only"),
      translation("a-validating", ORG_A.id, "en", "Still Validating"),
      translation("a-quarantined", ORG_A.id, "en", "Quarantined Bytes"),
      translation("b-public", ORG_B.id, "en", "Other Tenant"),
    ],
    mediaChapter: [
      {
        id: "ch-1",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        locale: "en",
        orderIndex: 0,
        startSeconds: 0,
        endSeconds: 120,
        title: "Introduction",
      },
    ],
    mediaSubtitleTrack: [
      {
        id: "sub-1",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        locale: "en",
        label: "English",
        storageKey: "media/org-A/a-public.en.vtt",
        format: "vtt",
        isDefault: true,
      },
    ],
    mediaCategory: [
      { id: "cat-1", organizationId: ORG_A.id, slug: "automation", nameEn: "Automation" },
    ],
    mediaInstructor: [
      { id: "ins-1", organizationId: ORG_A.id, slug: "h-forozandeh", displayName: "H. F." },
    ],
  });
}

async function loadRoute(routePath: string) {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db.client }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => rateLimitAllows,
    retryAfter: () => 42,
    limitWindowSeconds: () => 60,
  }));
  vi.doMock("@/lib/org/context", () => ({
    getUserIdFromRequest: async () => sessionUserId,
  }));
  return import(routePath);
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.JWT_ACCESS_SECRET = "test-secret-for-ip-hash-derivation";
  db = seed();
  rateLimitAllows = true;
  sessionUserId = null;
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/auth/rate-limiter");
  vi.doUnmock("@/lib/org/context");
});

function get(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: "GET", headers });
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** The complete, intentional public card contract. */
const CARD_KEYS = [
  "slug",
  "locale",
  "primaryLocale",
  "title",
  "summary",
  "skillLevel",
  "durationSeconds",
  "hasPoster",
  "hasVideo",
  "viewCount",
  "publishedAt",
].sort();

/** Anything on this list appearing in a public response is a leak. */
const FORBIDDEN_KEYS = [
  "id",
  "organizationId",
  "siteId",
  "categoryId",
  "instructorId",
  "storageKey",
  "posterStorageKey",
  "storageProvider",
  "checksumSha256",
  "byteSize",
  "status",
  "visibility",
  "processingState",
  "processingFailureCode",
  "rejectionReason",
  "createdBy",
  "updatedBy",
  "reviewedAt",
  "submittedAt",
  "archivedAt",
  "createdAt",
  "updatedAt",
  "mediaAssetId",
];

function assertNoForbiddenKeys(payload: unknown): void {
  const seen: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (FORBIDDEN_KEYS.includes(key)) seen.push(key);
        walk(value);
      }
    }
  };
  walk(payload);
  expect(seen).toEqual([]);
}

// ════════════════════════════════════════════════════════════════════════════
// A. GET /api/media/public/videos — the library
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/media/public/videos", () => {
  it("serves ONLY the published + public + ready asset, and applies the gate in the database", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(get("http://localhost/api/media/public/videos?org=hermes-a"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { slug: string }) => i.slug)).toEqual(["plc-basics"]);
    expect(body.total).toBe(1);

    // The gate is the REPOSITORY's, and it reached Prisma.
    const where = db.wheres("mediaAsset", "findMany")[0];
    expect(where).toMatchObject({
      organizationId: ORG_A.id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      processingState: "READY",
    });
  });

  it("returns the closed whitelist projection and leaks no internal field", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(get("http://localhost/api/media/public/videos?org=hermes-a"));
    const body = await res.json();

    expect(Object.keys(body.items[0]).sort()).toEqual(CARD_KEYS);
    expect(body.items[0]).toMatchObject({
      slug: "plc-basics",
      title: "PLC Basics",
      hasVideo: true,
      hasPoster: true,
      viewCount: 5,
    });
    assertNoForbiddenKeys(body);
    expect(JSON.stringify(body)).not.toContain("media/org-A");
  });

  it("resolves the requested locale and falls back to the asset's primary locale", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const fa = await (
      await GET(get("http://localhost/api/media/public/videos?org=hermes-a&locale=fa"))
    ).json();
    expect(fa.items[0].locale).toBe("fa");
    expect(fa.items[0].title).toBe("مبانی پی‌ال‌سی");

    db.reset();
    const de = await (
      await GET(get("http://localhost/api/media/public/videos?org=hermes-a&locale=de"))
    ).json();
    expect(de.items[0].locale).toBe("en"); // primaryLocale, not a fabricated German title
  });

  it("refuses an unrecognised query parameter instead of ignoring it", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    for (const key of ["organizationId", "status", "visibility", "processingState", "take"]) {
      const res = await GET(
        get(`http://localhost/api/media/public/videos?org=hermes-a&${key}=x`),
      );
      expect(res.status).toBe(400);
      // The rejected key is never echoed back.
      expect(JSON.stringify(await res.json())).not.toContain(key);
    }
    expect(db.wheres("mediaAsset", "findMany")).toHaveLength(0);
  });

  it("bounds the page size — an oversized request is refused, not clamped silently", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos?org=hermes-a&pageSize=500000"),
    );
    expect(res.status).toBe(400);
    expect(db.wheres("mediaAsset", "findMany")).toHaveLength(0);
  });

  it("treats an unknown organization exactly like one with nothing published", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(get("http://localhost/api/media/public/videos?org=no-such-org"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      page: 1,
      pageSize: 24,
      total: 0,
      hasMore: false,
    });
    // No asset query ran at all — nothing to time, nothing to probe.
    expect(db.wheres("mediaAsset", "findMany")).toHaveLength(0);
  });

  it("rate limits the anonymous surface and answers 429 with Retry-After", async () => {
    rateLimitAllows = false;
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos?org=hermes-a", { "x-real-ip": "10.0.0.9" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(db.calls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Search
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/media/public/videos?q=…", () => {
  it("requires an explicit locale so the join cannot duplicate rows or approximate a total", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(get("http://localhost/api/media/public/videos?org=hermes-a&q=plc"));
    expect(res.status).toBe(400);
  });

  it("searches in the database under the repository's own visibility fragment", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos?org=hermes-a&locale=en&q=plc"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { slug: string }) => i.slug)).toEqual(["plc-basics"]);
    assertNoForbiddenKeys(body);

    const where = db.wheres("mediaAssetTranslation", "findMany")[0];
    expect(where.mediaAsset).toMatchObject({
      organizationId: ORG_A.id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      processingState: "READY",
    });
  });

  it("cannot surface a draft, an organization-only asset or another tenant's asset", async () => {
    const { GET } = await loadRoute(LIST_ROUTE);
    for (const q of ["Unreleased", "Internal", "Validating", "Quarantined", "Other Tenant"]) {
      const body = await (
        await GET(
          get(
            `http://localhost/api/media/public/videos?org=hermes-a&locale=en&q=${encodeURIComponent(q)}`,
          ),
        )
      ).json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. GET /api/media/public/videos/[slug] — detail
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/media/public/videos/[slug]", () => {
  it("serves a published public asset with chapters and subtitle metadata but no storage key", async () => {
    const { GET } = await loadRoute(DETAIL_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos/plc-basics?org=hermes-a&locale=en"),
      params("plc-basics"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.video.slug).toBe("plc-basics");
    expect(body.video.title).toBe("PLC Basics");
    expect(body.video.chapters).toEqual([
      { orderIndex: 0, startSeconds: 0, endSeconds: 120, title: "Introduction" },
    ]);
    expect(body.video.subtitleTracks).toEqual([
      { locale: "en", label: "English", format: "vtt", isDefault: true },
    ]);
    assertNoForbiddenKeys(body);
    expect(JSON.stringify(body)).not.toContain(".vtt");
    expect(JSON.stringify(body)).not.toContain("media/org-A");
  });

  it("answers the SAME 404 for a draft, an org-only asset, unvalidated bytes, another tenant and an unknown org", async () => {
    const { GET } = await loadRoute(DETAIL_ROUTE);
    const cases: Array<[string, string]> = [
      ["secret-draft", "hermes-a"],
      ["internal-only", "hermes-a"],
      ["still-validating", "hermes-a"],
      ["quarantined-bytes", "hermes-a"],
      ["other-tenant", "hermes-a"], // cross-tenant slug
      ["plc-basics", "hermes-b"], // right slug, wrong tenant
      ["plc-basics", "no-such-org"],
      ["does-not-exist", "hermes-a"],
    ];
    for (const [slug, org] of cases) {
      const res = await GET(
        get(`http://localhost/api/media/public/videos/${slug}?org=${org}`),
        params(slug),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
    }
  });

  it("never reveals a rejection reason", async () => {
    const { GET } = await loadRoute(DETAIL_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos/secret-draft?org=hermes-a"),
      params("secret-draft"),
    );
    expect(JSON.stringify(await res.json())).not.toContain("not good enough yet");
  });

  it("refuses an unrecognised query parameter", async () => {
    const { GET } = await loadRoute(DETAIL_ROUTE);
    const res = await GET(
      get("http://localhost/api/media/public/videos/plc-basics?org=hermes-a&includeUnpublished=true"),
      params("plc-basics"),
    );
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D. POST /api/media/public/videos/[slug]/view — the beacon
// ════════════════════════════════════════════════════════════════════════════

function beacon(
  slug: string,
  org: string,
  body: unknown,
  init: { contentType?: string | null; ip?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.contentType !== null) headers["content-type"] = init.contentType ?? "application/json";
  if (init.ip) headers["x-real-ip"] = init.ip;
  return new NextRequest(
    `http://localhost/api/media/public/videos/${slug}/view?org=${org}`,
    { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) },
  );
}

describe("POST /api/media/public/videos/[slug]/view", () => {
  it("records an anonymous PLAY with an ipHash and no raw address", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    const res = await POST(
      beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { ip: "203.0.113.7" }),
      params("plc-basics"),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ recorded: true });

    expect(db.tables.mediaViewEvent).toHaveLength(1);
    const event = db.tables.mediaViewEvent[0];
    expect(event.userId).toBeNull();
    expect(event.eventType).toBe("PLAY");
    expect(String(event.ipHash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(event.ipHash)).not.toContain("203.0.113.7");
    // The counter moved, and only the counter.
    expect(db.tables.mediaAsset.find((a) => a.id === "a-public")?.viewCount).toBe(6);
  });

  it("produces a different hash for a different address and a stable one for the same", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    await POST(beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { ip: "203.0.113.7" }), params("plc-basics"));
    await POST(beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { ip: "203.0.113.7" }), params("plc-basics"));
    await POST(beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { ip: "198.51.100.4" }), params("plc-basics"));
    const [h1, h2, h3] = db.tables.mediaViewEvent.map((e) => e.ipHash);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("omits the hash entirely when no server-side salt is configured", async () => {
    delete process.env.JWT_ACCESS_SECRET;
    const { POST } = await loadRoute(VIEW_ROUTE);
    await POST(
      beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { ip: "203.0.113.7" }),
      params("plc-basics"),
    );
    expect(db.tables.mediaViewEvent[0].ipHash).toBeNull();
  });

  it("takes userId from the session and NEVER from the payload", async () => {
    sessionUserId = "user-A";
    const { POST } = await loadRoute(VIEW_ROUTE);

    // A body naming another subject is refused outright — it is not a field.
    const spoof = await POST(
      beacon("plc-basics", "hermes-a", { eventType: "PLAY", userId: "user-B" }),
      params("plc-basics"),
    );
    expect(spoof.status).toBe(400);
    expect(db.tables.mediaViewEvent).toHaveLength(0);

    const ok = await POST(beacon("plc-basics", "hermes-a", { eventType: "PLAY" }), params("plc-basics"));
    expect(ok.status).toBe(202);
    expect(db.tables.mediaViewEvent[0].userId).toBe("user-A");
  });

  it("refuses every attempt to smuggle a tenant, a row or a hash through the body", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    for (const payload of [
      { eventType: "PLAY", organizationId: "org-B" },
      { eventType: "PLAY", mediaAssetId: "b-public" },
      { eventType: "PLAY", ipHash: "f".repeat(64) },
      { eventType: "PLAY", progressPct: 100 },
      { eventType: "NOT_A_REAL_EVENT" },
      { eventType: "PLAY", positionSeconds: -5 },
    ]) {
      const res = await POST(beacon("plc-basics", "hermes-a", payload), params("plc-basics"));
      expect(res.status).toBe(400);
    }
    expect(db.tables.mediaViewEvent).toHaveLength(0);
  });

  it("never writes watch progress or a favourite — inflating another user's progress is unreachable", async () => {
    sessionUserId = "user-A";
    const { POST } = await loadRoute(VIEW_ROUTE);
    await POST(
      beacon("plc-basics", "hermes-a", { eventType: "COMPLETE", positionSeconds: 600 }),
      params("plc-basics"),
    );
    expect(db.tables.mediaWatchProgress).toHaveLength(0);
    expect(db.tables.mediaSave).toHaveLength(0);
    // A COMPLETE event does not touch the completion counter either — that is
    // deduplicated per subject by the authenticated plane.
    expect(db.tables.mediaAsset.find((a) => a.id === "a-public")?.completionCount).toBe(0);
  });

  it("rejects a non-JSON content type before parsing anything", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    const res = await POST(
      beacon("plc-basics", "hermes-a", { eventType: "PLAY" }, { contentType: "text/plain" }),
      params("plc-basics"),
    );
    expect(res.status).toBe(415);
    expect(db.calls).toHaveLength(0);
  });

  it("bounds the body in bytes", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    const huge = JSON.stringify({ eventType: "PLAY", locale: "e".repeat(64 * 1024) });
    const res = await POST(beacon("plc-basics", "hermes-a", huge), params("plc-basics"));
    expect(res.status).toBe(413);
    expect(db.calls).toHaveLength(0);
  });

  it("answers 404 — and writes nothing — for a draft, an org-only asset, unready bytes or another tenant", async () => {
    const { POST } = await loadRoute(VIEW_ROUTE);
    for (const [slug, org] of [
      ["secret-draft", "hermes-a"],
      ["internal-only", "hermes-a"],
      ["still-validating", "hermes-a"],
      ["other-tenant", "hermes-a"],
      ["plc-basics", "no-such-org"],
    ] as Array<[string, string]>) {
      const res = await POST(beacon(slug, org, { eventType: "PLAY" }), params(slug));
      expect(res.status).toBe(404);
    }
    expect(db.tables.mediaViewEvent).toHaveLength(0);
  });

  it("is rate limited before it touches the database", async () => {
    rateLimitAllows = false;
    const { POST } = await loadRoute(VIEW_ROUTE);
    const res = await POST(beacon("plc-basics", "hermes-a", { eventType: "PLAY" }), params("plc-basics"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(db.calls).toHaveLength(0);
  });
});
