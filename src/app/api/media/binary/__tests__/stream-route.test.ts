/**
 * PHASE 102 — tests for GET /api/media/assets/[id]/stream.
 *
 * Two things are being proven here and they are equally load-bearing:
 *
 *  1. RANGE CORRECTNESS. Seeking in a `<video>` element is an HTTP behaviour, so
 *     the status/`Content-Range`/`Content-Length` triple is the feature, not a
 *     detail. The parser lives in `src/lib/media/storage.ts` and is NOT mocked —
 *     only the two filesystem calls are — so these assertions exercise the real
 *     RFC 9110 decision table.
 *
 *  2. THAT BYTES ARE NEVER SERVED WITHOUT AUTHORITY. The repository gate is real
 *     (a fake Prisma that honours the `where` clause), so an unpublished,
 *     organization-visibility, unready or quarantined asset is genuinely filtered
 *     by the query rather than by a stub.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  buildAsset,
  buildPublicReadyAsset,
  emptyStore,
  getRequest,
  routeParams,
  type FakeStore,
} from "./harness";

const OBJECT_SIZE = 1000;

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  session: null as null | { userId: string; orgId: string; role: string },
  actorCalls: 0,
  objectSize: 1000 as number | null,
  /** Every window a STREAM was actually created over. */
  opened: [] as Array<{ key: string; range?: { start: number; end: number } }>,
  /** Every key a DESCRIPTOR was opened for — at most one per request. */
  descriptors: [] as string[],
  /** How many descriptors were explicitly released without being streamed. */
  closed: 0,
  /** Buffered reads off the descriptor. The stream route must never do one. */
  bufferedReads: 0,
  wholeObjectReads: 0,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const { createFakePrisma } = await import("./harness");
    return createFakePrisma(h.store);
  },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) => {
    h.actorCalls += 1;
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
  // type is inferred (TS2775). Calling the real validator is the point — a route
  // that minted a malformed key must fail here exactly as it would in production.
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    // Whole-object read: must never be reached by this route.
    getMediaObject: async () => {
      h.wholeObjectReads += 1;
      return Buffer.alloc(0);
    },
    /**
     * The ONE accessor the route is now allowed to use. It stands in for
     * `openSecureFile`, and the double enforces the same descriptor ownership
     * rules: exactly one stream per descriptor, and `close` is idempotent.
     *
     * `statMediaObject` and `openMediaByteRange` are deliberately left REAL. The
     * route may not call them — they would resolve an actual filesystem path
     * that does not exist here — so a regression back to the stat-then-reopen
     * pattern fails loudly instead of passing on a convenient stub.
     */
    openMediaObject: async (key: string) => {
      actual.assertMediaStorageKey(key);
      if (h.objectSize === null) return null;
      const sizeBytes = h.objectSize;
      h.descriptors.push(key);
      let released = false;
      let closed = false;
      // A deterministic body: byte i holds (i % 251), so a slice can be checked.
      const sliceOf = (start: number, length: number): Buffer => {
        const out = Buffer.alloc(length);
        for (let i = 0; i < length; i += 1) out[i] = (start + i) % 251;
        return out;
      };
      return {
        sizeBytes,
        async read(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? { start: 0, end: sizeBytes - 1 };
          h.bufferedReads += 1;
          return sliceOf(window.start, window.end - window.start + 1);
        },
        createReadStream(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? { start: 0, end: sizeBytes - 1 };
          if (sizeBytes === 0 || window.end >= sizeBytes) {
            throw new Error("range not satisfiable");
          }
          released = true;
          h.opened.push({ key, range });
          return Readable.from([sliceOf(window.start, window.end - window.start + 1)]);
        },
        async close() {
          closed = true;
          h.closed += 1;
        },
      };
    },
  };
});

const URL_STREAM = `http://hermes.test/api/media/assets/${ASSET_ID}/stream`;

async function route() {
  return import("../../assets/[id]/stream/route");
}

async function bodyOf(res: Response): Promise<Buffer> {
  return Buffer.from(new Uint8Array(await res.arrayBuffer()));
}

beforeEach(() => {
  h.store = emptyStore();
  h.store.assets.push(buildPublicReadyAsset({ byteSize: OBJECT_SIZE }));
  h.session = null;
  h.actorCalls = 0;
  h.objectSize = OBJECT_SIZE;
  h.opened = [];
  h.descriptors = [];
  h.closed = 0;
  h.bufferedReads = 0;
  h.wholeObjectReads = 0;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Range semantics ──────────────────────────────────────────────────────────

describe("stream — Range handling", () => {
  it("answers 200 with Accept-Ranges when no Range is sent", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Content-Length")).toBe(String(OBJECT_SIZE));
    expect(res.headers.get("Content-Range")).toBeNull();
    expect((await bodyOf(res)).byteLength).toBe(OBJECT_SIZE);
  });

  it("answers 206 with a correct Content-Range for a closed range", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM, { range: "bytes=0-9" }), routeParams(ASSET_ID));

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-9/${OBJECT_SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    const payload = await bodyOf(res);
    expect(payload.byteLength).toBe(10);
    expect(payload[0]).toBe(0);
    expect(payload[9]).toBe(9);
  });

  it("answers 206 for an open-ended range and streams to the last byte", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM, { range: "bytes=990-" }), routeParams(ASSET_ID));

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 990-999/${OBJECT_SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("10");
  });

  it("answers 206 for a suffix range", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM, { range: "bytes=-10" }), routeParams(ASSET_ID));

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 990-999/${OBJECT_SIZE}`);
    expect((await bodyOf(res)).byteLength).toBe(10);
  });

  it("clamps a range whose end runs past the object", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM, { range: "bytes=995-99999" }), routeParams(ASSET_ID));

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 995-999/${OBJECT_SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("5");
  });

  it("answers 416 with `bytes */size` when the start is past the object", async () => {
    const { GET } = await route();
    const res = await GET(
      getRequest(URL_STREAM, { range: "bytes=5000-6000" }),
      routeParams(ASSET_ID),
    );

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${OBJECT_SIZE}`);
    expect((await bodyOf(res)).byteLength).toBe(0);
    expect(h.opened).toHaveLength(0);
  });

  it("REFUSES a multi-range request rather than serving only its first part", async () => {
    const { GET } = await route();
    const res = await GET(
      getRequest(URL_STREAM, { range: "bytes=0-9,20-29" }),
      routeParams(ASSET_ID),
    );

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${OBJECT_SIZE}`);
    // Nothing was opened, so no partial body could have escaped.
    expect(h.opened).toHaveLength(0);
    expect((await bodyOf(res)).byteLength).toBe(0);
  });

  it("ignores an unparsable Range and serves the whole representation", async () => {
    const malformed = ["bytes=abc-def", "bytes=100-50", "bytes=", "items=0-9", "0-9"];
    for (const range of malformed) {
      vi.resetModules();
      h.opened = [];
      const { GET } = await route();
      const res = await GET(getRequest(URL_STREAM, { range }), routeParams(ASSET_ID));
      expect(res.status, range).toBe(200);
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Content-Length")).toBe(String(OBJECT_SIZE));
      expect((await bodyOf(res)).byteLength).toBe(OBJECT_SIZE);
    }
  });

  it("opens ONLY the requested window — the object is never materialised", async () => {
    const { GET } = await route();
    await GET(getRequest(URL_STREAM, { range: "bytes=400-499" }), routeParams(ASSET_ID));

    expect(h.opened).toEqual([
      { key: h.store.assets[0].storageKey, range: { start: 400, end: 499 } },
    ]);
    expect(h.wholeObjectReads).toBe(0);
  });
});

// ── Response hardening ───────────────────────────────────────────────────────

describe("stream — response headers", () => {
  it("asserts the stored content type, forbids sniffing and disposes inline with a server name", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));

    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="media-${ASSET_ID}.mp4"`,
    );
    // No client input reaches the disposition, so it cannot name an executable.
    expect(res.headers.get("Content-Disposition")).not.toContain("attachment");
  });

  it("marks a public asset cacheable and a private one no-store", async () => {
    const { GET } = await route();
    const publicRes = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(publicRes.headers.get("Cache-Control")).toBe("public, max-age=3600");

    h.store.assets[0] = buildAsset({
      status: "PUBLISHED",
      visibility: "ORGANIZATION",
      processingState: "READY",
      contentType: "video/mp4",
      storageKey: `media/${ORG_A}/${ASSET_ID}/11111111-2222-4333-8444-555555555555.mp4`,
    });
    h.session = { userId: "u-1", orgId: ORG_A, role: "VIEWER" };
    vi.resetModules();
    const { GET: GET2 } = await route();
    const privateRes = await GET2(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(privateRes.status).toBe(200);
    expect(privateRes.headers.get("Cache-Control")).toBe("private, no-store");
    expect(privateRes.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("refuses to serve a stored content type outside the media allow-list", async () => {
    h.store.assets[0].contentType = "text/html";
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("stream — authorization", () => {
  it("serves a PUBLISHED + PUBLIC + READY asset anonymously", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(200);
    // No session was ever required.
    expect(h.actorCalls).toBe(0);
  });

  it("does NOT serve a PUBLISHED asset whose visibility is only ORGANIZATION", async () => {
    h.store.assets[0].visibility = "ORGANIZATION";
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("does NOT serve a DRAFT asset anonymously", async () => {
    h.store.assets[0].status = "DRAFT";
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("serves a DRAFT asset to an org member holding view_media", async () => {
    h.store.assets[0].status = "DRAFT";
    h.store.assets[0].visibility = "PRIVATE";
    h.session = { userId: "u-1", orgId: ORG_A, role: "ENGINEER" };
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("NEVER serves a QUARANTINED asset, even to an OWNER", async () => {
    h.store.assets[0].processingState = "QUARANTINED";
    h.session = { userId: "owner-1", orgId: ORG_A, role: "OWNER" };
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("never serves an asset whose bytes have not finished validating", async () => {
    for (const state of ["PENDING_UPLOAD", "UPLOADED", "VALIDATING", "FAILED"]) {
      vi.resetModules();
      h.opened = [];
      h.store.assets[0].processingState = state;
      h.session = { userId: "owner-1", orgId: ORG_A, role: "OWNER" };
      const { GET } = await route();
      const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
      expect(res.status, state).toBe(404);
      expect(h.opened).toHaveLength(0);
    }
  });

  it("answers 404 — never 403 — to a member of a different organization", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "attacker", orgId: ORG_B, role: "OWNER" };
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("answers 404 — never 403 — to an org member whose role lacks view_media", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "u-1", orgId: ORG_A, role: "NOT_A_ROLE" };
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("answers 404 for an unknown asset id and never touches storage", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams("assetdoesnotexist00001"));
    expect(res.status).toBe(404);
    expect(h.actorCalls).toBe(0);
    expect(h.opened).toHaveLength(0);
  });

  it("answers 404 for a syntactically impossible asset id", async () => {
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams("../../../../etc/passwd"));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("answers 404 when the row has no storage key yet", async () => {
    h.store.assets[0].storageKey = null;
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.opened).toHaveLength(0);
  });

  it("answers 404 when the object is missing from storage", async () => {
    h.objectSize = null;
    const { GET } = await route();
    const res = await GET(getRequest(URL_STREAM), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("does not mutate anything — the handler is free of persistence writes", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/api/media/assets/[id]/stream/route.ts", "utf8");
    const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const token of [".create(", ".update(", ".updateMany(", ".upsert(", ".delete(", "$transaction("]) {
      expect(live, token).not.toContain(token);
    }
  });
});
