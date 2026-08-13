/**
 * PHASE 102 — the byte-serving AUTHORIZATION CONTRACT, asserted against all
 * three handlers at once.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `src/lib/media/byte-serving-auth.ts` hoisted one ~70-line tenancy chain out of
 * three routes that each carried a copy of it. Hoisting removes the drift risk
 * from the CHAIN, but it introduces a new one at the CALL SITE: a route can stop
 * calling the shared helper, or call it and then ignore the answer, and every
 * per-route test would still pass because each of those suites only ever drives
 * its own handler.
 *
 * So this suite drives the SAME matrix through `stream`, `poster` and
 * `subtitles/[trackId]` and requires the SAME status from each. A route that
 * drops a predicate — quarantine, visibility, publication, membership,
 * `view_media`, tenant ownership — diverges from its two siblings on at least
 * one row and fails here.
 *
 * The matrix is behavioural, not structural: the repository gate in
 * `src/lib/media/db.ts` is REAL (a fake Prisma that honours the `where` clause),
 * so an unpublished or quarantined asset is filtered by the actual query rather
 * than by a stub. Only the two filesystem-touching calls are doubled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  VALID_WEBVTT,
  buildAsset,
  emptyStore,
  getRequest,
  mp4Bytes,
  pngBytes,
  type FakeRow,
  type FakeStore,
} from "./harness";

const TRACK_ID = "track00000000000000001";
const VIDEO_KEY = `media/${ORG_A}/${ASSET_ID}/11111111-2222-4333-8444-555555555555.mp4`;
const POSTER_KEY = `media/${ORG_A}/${ASSET_ID}/22222222-3333-4444-8555-666666666666.png`;
const TRACK_KEY = `media/${ORG_A}/${ASSET_ID}/33333333-4444-4555-8666-777777777777.vtt`;

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  session: null as null | { userId: string; orgId: string; role: string },
  /** Flipped off to prove the infrastructure outcome is 503, not 404. */
  prismaAvailable: true,
  /** Every key a descriptor was opened for, across whichever route ran. */
  opened: [] as string[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (!h.prismaAvailable) return null;
    const { createFakePrisma } = await import("./harness");
    return createFakePrisma(h.store);
  },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) => {
    if (!h.session) return { error: "Authentication required", status: 401 };
    if (h.session.orgId !== orgId) return { error: "Not a member", status: 403 };
    return {
      ctx: {
        userId: h.session.userId,
        orgId,
        memberId: "member-1",
        role: h.session.role,
        status: "ACTIVE",
      },
    };
  },
}));

vi.mock("@/lib/media/storage", async (importOriginal) => {
  // The annotation is REQUIRED, not stylistic: `assertMediaStorageKey` is an
  // assertion function, and TypeScript refuses to call one through a name whose
  // type is inferred (TS2775). Calling the real validator is the point.
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();

  /** Bytes each surface will actually accept, chosen by canonical extension. */
  const contentFor = (key: string): Buffer | null => {
    if (key.endsWith(".mp4")) return mp4Bytes(968);
    if (key.endsWith(".png")) return pngBytes();
    if (key.endsWith(".vtt")) return Buffer.from(VALID_WEBVTT, "utf8");
    return null;
  };

  return {
    ...actual,
    openMediaObject: async (key: string) => {
      actual.assertMediaStorageKey(key);
      const object = contentFor(key);
      if (object === null) return null;
      h.opened.push(key);
      let released = false;
      let closed = false;
      const whole = { start: 0, end: object.byteLength - 1 };
      return {
        sizeBytes: object.byteLength,
        async read(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? whole;
          return object.subarray(window.start, window.end + 1);
        },
        createReadStream(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? whole;
          if (object.byteLength === 0 || window.end >= object.byteLength) {
            throw new Error("range not satisfiable");
          }
          released = true;
          return Readable.from([object.subarray(window.start, window.end + 1)]);
        },
        async close() {
          closed = true;
        },
      };
    },
  };
});

// ── The three surfaces, behind one uniform driver ────────────────────────────

interface Surface {
  readonly name: string;
  readonly source: string;
  readonly run: (assetId: string) => Promise<Response>;
}

const SURFACES: readonly Surface[] = [
  {
    name: "stream",
    source: "src/app/api/media/assets/[id]/stream/route.ts",
    run: async (assetId) => {
      const { GET } = await import("../../assets/[id]/stream/route");
      return GET(getRequest(`http://hermes.test/api/media/assets/${assetId}/stream`), {
        params: Promise.resolve({ id: assetId }),
      });
    },
  },
  {
    name: "poster",
    source: "src/app/api/media/assets/[id]/poster/route.ts",
    run: async (assetId) => {
      const { GET } = await import("../../assets/[id]/poster/route");
      return GET(getRequest(`http://hermes.test/api/media/assets/${assetId}/poster`), {
        params: Promise.resolve({ id: assetId }),
      });
    },
  },
  {
    name: "subtitles",
    source: "src/app/api/media/assets/[id]/subtitles/[trackId]/route.ts",
    run: async (assetId) => {
      const { GET } = await import("../../assets/[id]/subtitles/[trackId]/route");
      return GET(
        getRequest(`http://hermes.test/api/media/assets/${assetId}/subtitles/${TRACK_ID}`),
        { params: Promise.resolve({ id: assetId, trackId: TRACK_ID }) },
      );
    },
  },
];

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Every surface's key is present, so the ONLY variable is authorization. */
function servableAsset(overrides: Partial<FakeRow> = {}): FakeRow {
  return buildAsset({
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
    storageKey: VIDEO_KEY,
    posterStorageKey: POSTER_KEY,
    contentType: "video/mp4",
    byteSize: 1000,
    publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    ...overrides,
  });
}

function track(): FakeRow {
  return {
    id: TRACK_ID,
    organizationId: ORG_A,
    mediaAssetId: ASSET_ID,
    locale: "en",
    label: "English",
    storageKey: TRACK_KEY,
    format: "vtt",
    byteSize: Buffer.byteLength(VALID_WEBVTT, "utf8"),
    isDefault: true,
  };
}

/**
 * One row of the contract. `expected` is the status EVERY surface must return —
 * that identity is the whole point of the file.
 */
interface Case {
  readonly name: string;
  readonly expected: number;
  readonly asset?: Partial<FakeRow>;
  readonly session?: { userId: string; orgId: string; role: string };
  readonly assetId?: string;
  readonly prismaAvailable?: boolean;
}

const CASES: readonly Case[] = [
  // ── The two grants ────────────────────────────────────────────────────────
  { name: "anonymous · PUBLISHED + PUBLIC + READY", expected: 200 },
  {
    name: "member of the owning org with view_media · DRAFT + PRIVATE + READY",
    expected: 200,
    asset: { status: "DRAFT", visibility: "PRIVATE", publishedAt: null },
    session: { userId: "u-1", orgId: ORG_A, role: "VIEWER" },
  },

  // ── Publication / visibility / processing state ───────────────────────────
  {
    name: "anonymous · DRAFT is not public",
    expected: 404,
    asset: { status: "DRAFT", publishedAt: null },
  },
  {
    name: "anonymous · ORGANIZATION visibility is not public",
    expected: 404,
    asset: { visibility: "ORGANIZATION" },
  },
  { name: "anonymous · PRIVATE visibility is not public", expected: 404, asset: { visibility: "PRIVATE" } },
  {
    name: "anonymous · not READY yet",
    expected: 404,
    asset: { processingState: "PROCESSING" },
  },
  {
    name: "anonymous · QUARANTINED never serves a byte",
    expected: 404,
    asset: { processingState: "QUARANTINED" },
  },
  {
    name: "member with view_media · QUARANTINED still never serves a byte",
    expected: 404,
    asset: { processingState: "QUARANTINED", status: "DRAFT", visibility: "PRIVATE" },
    session: { userId: "u-1", orgId: ORG_A, role: "VIEWER" },
  },

  // ── Tenancy and permission ────────────────────────────────────────────────
  {
    name: "member of a DIFFERENT organization · cross-tenant read",
    expected: 404,
    asset: { status: "DRAFT", visibility: "PRIVATE", publishedAt: null },
    session: { userId: "u-2", orgId: ORG_B, role: "OWNER" },
  },
  {
    name: "member of the owning org WITHOUT view_media",
    expected: 404,
    asset: { status: "DRAFT", visibility: "PRIVATE", publishedAt: null },
    session: { userId: "u-3", orgId: ORG_A, role: "MEMBER" },
  },
  {
    name: "anonymous · private asset, no session at all",
    expected: 404,
    asset: { status: "DRAFT", visibility: "PRIVATE", publishedAt: null },
  },

  // ── Identifier shape and existence ────────────────────────────────────────
  { name: "traversal-shaped asset id", expected: 404, assetId: "../../../../etc/passwd" },
  { name: "asset id with a NUL byte", expected: 404, assetId: "asset 000000000000001" },
  { name: "unknown asset id", expected: 404, assetId: "assetdoesnotexist000001" },

  // ── Infrastructure ────────────────────────────────────────────────────────
  {
    name: "no database client is infrastructure, not a statement about the asset",
    expected: 503,
    prismaAvailable: false,
  },
];

beforeEach(() => {
  h.store = emptyStore();
  h.session = null;
  h.prismaAvailable = true;
  h.opened = [];
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── The matrix ───────────────────────────────────────────────────────────────

describe("byte-serving authorization — all three surfaces answer identically", () => {
  for (const testCase of CASES) {
    it(`${testCase.name} → ${testCase.expected} on every surface`, async () => {
      const observed: Record<string, number> = {};

      for (const surface of SURFACES) {
        // A fresh world per surface: these handlers must not depend on each
        // other's state, and one must not warm a cache for the next.
        h.store = emptyStore();
        h.store.assets.push(servableAsset(testCase.asset ?? {}));
        h.store.subtitles.push(track());
        h.session = testCase.session ?? null;
        h.prismaAvailable = testCase.prismaAvailable ?? true;
        h.opened = [];
        vi.resetModules();

        const res = await surface.run(testCase.assetId ?? ASSET_ID);
        observed[surface.name] = res.status;

        // A refusal must never have reached the filesystem: an unauthorized
        // caller may not make the server open a descriptor.
        if (testCase.expected !== 200) {
          expect(h.opened, `${surface.name} opened a descriptor for a refusal`).toEqual([]);
        }
      }

      // Asserting the whole object at once means a failure message names the
      // surface that diverged rather than just the first one checked.
      expect(observed).toEqual({
        stream: testCase.expected,
        poster: testCase.expected,
        subtitles: testCase.expected,
      });
    });
  }
});

// ── Refusals disclose nothing, uniformly ─────────────────────────────────────

describe("every refusal body is the same, on every surface", () => {
  it("a cross-tenant refusal is byte-identical to a nonexistent-asset refusal", async () => {
    for (const surface of SURFACES) {
      h.store = emptyStore();
      h.store.assets.push(
        servableAsset({ status: "DRAFT", visibility: "PRIVATE", publishedAt: null }),
      );
      h.store.subtitles.push(track());
      h.session = { userId: "u-2", orgId: ORG_B, role: "OWNER" };
      vi.resetModules();
      const crossTenant = await surface.run(ASSET_ID);
      const crossTenantBody = await crossTenant.text();

      h.store = emptyStore();
      h.session = null;
      vi.resetModules();
      const missing = await surface.run("assetdoesnotexist000001");
      const missingBody = await missing.text();

      expect(crossTenant.status, surface.name).toBe(missing.status);
      expect(crossTenantBody, surface.name).toBe(missingBody);
      // Nothing that varies with the reason may appear in the headers either.
      expect(crossTenant.headers.get("Content-Type"), surface.name).toBe(
        missing.headers.get("Content-Type"),
      );
      expect(crossTenant.headers.get("Cache-Control"), surface.name).toBe("no-store");
    }
  });

  it("no refusal leaks a path, a key, an errno or a tenant id", async () => {
    for (const surface of SURFACES) {
      h.store = emptyStore();
      h.store.assets.push(
        servableAsset({ status: "DRAFT", visibility: "PRIVATE", publishedAt: null }),
      );
      h.store.subtitles.push(track());
      h.session = { userId: "u-2", orgId: ORG_B, role: "OWNER" };
      vi.resetModules();

      const res = await surface.run(ASSET_ID);
      const body = await res.text();
      const headers = JSON.stringify([...res.headers.entries()]);
      const surfaceText = `${body}\n${headers}`;

      for (const secret of [ORG_A, VIDEO_KEY, POSTER_KEY, TRACK_KEY, "media/", "ENOENT", "EACCES"]) {
        expect(surfaceText, `${surface.name} leaked ${secret}`).not.toContain(secret);
      }
    }
  });
});

// ── The call sites themselves ────────────────────────────────────────────────

describe("every surface routes its decision through the shared chain", () => {
  it("each handler calls authorizeByteServing and re-asserts the permission", async () => {
    const { readFileSync } = await import("node:fs");
    for (const surface of SURFACES) {
      const source = readFileSync(surface.source, "utf8");
      const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

      expect(live, `${surface.name} must import the shared chain`).toContain(
        'from "@/lib/media/byte-serving-auth"',
      );
      expect(live, `${surface.name} must call the shared chain`).toContain(
        "authorizeByteServing(",
      );
      // Defence in depth AND the Phase 99 guard-token evidence: the classifier
      // reads the handler body and does not follow imports, so a handler that
      // dropped this call would reclassify as UNKNOWN.
      expect(live, `${surface.name} must re-assert view_media at the surface`).toContain(
        "requirePermission(",
      );
      expect(live, `${surface.name} must render refusals through the shared mapper`).toContain(
        "byteServingRefusalResponse(",
      );
      // No handler may mint its own status for an authorization outcome.
      expect(live, `${surface.name} must not invent a 401`).not.toContain("status: 401");
      expect(live, `${surface.name} must not invent a 403`).not.toContain("status: 403");
    }
  });

  it("no surface re-derives the organization from the request", async () => {
    const { readFileSync } = await import("node:fs");
    for (const surface of SURFACES) {
      const live = readFileSync(surface.source, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      // The owning tenant comes from the grant only. Reading it from a header,
      // a query parameter or the body would reintroduce the cross-tenant hole
      // the shared chain exists to close.
      for (const forbidden of [
        'searchParams.get("organizationId")',
        'headers.get("x-organization-id")',
        'headers.get("x-org-id")',
      ]) {
        expect(live, `${surface.name} :: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
