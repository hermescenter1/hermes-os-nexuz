/**
 * PHASE 102 — tests for the two caption/poster GET routes:
 *
 *   GET /api/media/assets/[id]/subtitles/[trackId]
 *   GET /api/media/assets/[id]/poster
 *
 * These routes close the gap that made captions non-functional end to end: the
 * model, the upload path and the player `<track>` support all existed, but
 * nothing served a `.vtt` or a poster back.
 *
 * WHAT IS ACTUALLY BEING PROVEN
 * -----------------------------
 *  1. THE AUTHORIZATION CHAIN IS THE STREAM ROUTE'S. Same repository gate (real,
 *     not stubbed — a fake Prisma that honours the `where` clause), same
 *     published/public/READY rule, same 404-not-403 discipline. A caption is
 *     editorial content; leaking one across a tenant boundary is the same class
 *     of failure as leaking the video.
 *  2. A TRACK BELONGS TO EXACTLY ONE ASSET. `trackId` is only ever resolved with
 *     `{ id, organizationId, mediaAssetId }` together, so a track borrowed from
 *     another asset — or another tenant — is not found rather than served under
 *     an authorization it never passed.
 *  3. STORED BYTES ARE UNTRUSTED ON THE WAY OUT. Subtitle content is rendered
 *     into the player, so a stored object that is not WebVTT is never served,
 *     whatever the row claims.
 *
 * Only the three filesystem-touching storage functions are mocked; the key
 * validator, the media allow-list and the WebVTT signature verifier are all
 * real, so a route that accepted a bad key or bad bytes would fail here exactly
 * as it would in production.
 */

import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  VALID_WEBVTT,
  buildAsset,
  buildPublicReadyAsset,
  emptyStore,
  getRequest,
  pngBytes,
  shellScriptBytes,
  type FakeRow,
  type FakeStore,
} from "./harness";

const OTHER_ASSET_ID = "asset000000000000000002";
const TRACK_ID = "track000000000000000001";
const OTHER_TRACK_ID = "track000000000000000002";

const TRACK_KEY = `media/${ORG_A}/${ASSET_ID}/aaaaaaaa-1111-4111-8111-111111111111.vtt`;
const OTHER_TRACK_KEY = `media/${ORG_A}/${OTHER_ASSET_ID}/bbbbbbbb-2222-4222-8222-222222222222.vtt`;
const POSTER_KEY = `media/${ORG_A}/${ASSET_ID}/cccccccc-3333-4333-8333-333333333333.png`;
const JPEG_POSTER_KEY = `media/${ORG_A}/${ASSET_ID}/dddddddd-4444-4444-8444-444444444444.jpg`;
/** A key shaped like a video object — must never be served by the poster route. */
const VIDEO_SHAPED_POSTER_KEY = `media/${ORG_A}/${ASSET_ID}/eeeeeeee-5555-4555-8555-555555555555.mp4`;

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  session: null as null | { userId: string; orgId: string; role: string },
  actorCalls: 0,
  /** The only "filesystem" these tests have. Absent key ⇒ absent object. */
  objects: new Map<string, Buffer>(),
  /** Every key a descriptor was OPENED for. */
  opened: [] as string[],
  /** Every key whose bytes were actually read or streamed. */
  touched: [] as string[],
  /** The byte windows the routes actually asked the descriptor for. */
  windows: [] as { start: number; end: number }[],
  /** How many descriptors were explicitly released. */
  closed: 0,
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
  // that reached storage with a malformed key must fail here as it would in
  // production.
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    /**
     * The ONE accessor the routes are now allowed to use. It stands in for
     * `openSecureFile` and hands back a descriptor double with the same
     * ownership rules: `read` works until a stream claims it, exactly one stream
     * may be created, and `close` is idempotent.
     *
     * `statMediaObject`, `openMediaByteRange` and `readMediaByteRange` are
     * deliberately NOT stubbed. They keep their real implementations, which
     * resolve a real filesystem path — so a route that regressed to the
     * stat-then-reopen pattern would read nothing here and fail loudly rather
     * than quietly pass on a mock.
     */
    openMediaObject: async (key: string) => {
      actual.assertMediaStorageKey(key);
      const object = h.objects.get(key);
      if (object === undefined) return null;
      h.opened.push(key);
      let released = false;
      let closed = false;
      const whole = { start: 0, end: object.byteLength - 1 };
      return {
        sizeBytes: object.byteLength,
        async read(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? whole;
          h.touched.push(key);
          return object.subarray(window.start, window.end + 1);
        },
        createReadStream(range?: { start: number; end: number }) {
          if (released || closed) throw new Error("descriptor released");
          const window = range ?? whole;
          if (object.byteLength === 0 || window.end >= object.byteLength) {
            throw new Error("range not satisfiable");
          }
          released = true;
          h.touched.push(key);
          h.windows.push(window);
          return Readable.from([object.subarray(window.start, window.end + 1)]);
        },
        async close() {
          closed = true;
          h.closed += 1;
        },
      };
    },
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function buildTrack(overrides: Partial<FakeRow> = {}): FakeRow {
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
    ...overrides,
  };
}

function subtitleUrl(assetId: string, trackId: string): string {
  return `http://hermes.test/api/media/assets/${assetId}/subtitles/${trackId}`;
}

function posterUrl(assetId: string): string {
  return `http://hermes.test/api/media/assets/${assetId}/poster`;
}

function subtitleParams(id: string, trackId: string): {
  params: Promise<{ id: string; trackId: string }>;
} {
  return { params: Promise.resolve({ id, trackId }) };
}

function posterParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function subtitleRoute() {
  return import("../../assets/[id]/subtitles/[trackId]/route");
}

async function posterRoute() {
  return import("../../assets/[id]/poster/route");
}

async function bodyOf(res: Response): Promise<Buffer> {
  return Buffer.from(new Uint8Array(await res.arrayBuffer()));
}

beforeEach(() => {
  h.store = emptyStore();
  h.store.assets.push(buildPublicReadyAsset({ posterStorageKey: POSTER_KEY }));
  h.store.subtitles.push(buildTrack());
  h.session = null;
  h.actorCalls = 0;
  h.objects = new Map<string, Buffer>([
    [TRACK_KEY, Buffer.from(VALID_WEBVTT, "utf8")],
    [OTHER_TRACK_KEY, Buffer.from(VALID_WEBVTT, "utf8")],
    [POSTER_KEY, pngBytes()],
    [JPEG_POSTER_KEY, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(24)])],
    [VIDEO_SHAPED_POSTER_KEY, Buffer.alloc(64)],
  ]);
  h.opened = [];
  h.touched = [];
  h.windows = [];
  h.closed = 0;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Subtitles: the happy path and its headers ────────────────────────────────

describe("subtitles GET — serving a track", () => {
  it("serves the stored WebVTT of a PUBLISHED + PUBLIC + READY asset anonymously", async () => {
    const { GET } = await subtitleRoute();
    const res = await GET(getRequest(subtitleUrl(ASSET_ID, TRACK_ID)), subtitleParams(ASSET_ID, TRACK_ID));

    expect(res.status).toBe(200);
    expect((await bodyOf(res)).toString("utf8")).toBe(VALID_WEBVTT);
    // No session was ever required.
    expect(h.actorCalls).toBe(0);
  });

  it("declares text/vtt with an explicit charset, forbids sniffing and disposes inline", async () => {
    const { GET } = await subtitleRoute();
    const res = await GET(getRequest(subtitleUrl(ASSET_ID, TRACK_ID)), subtitleParams(ASSET_ID, TRACK_ID));

    expect(res.headers.get("Content-Type")).toBe("text/vtt; charset=utf-8");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="media-${ASSET_ID}-${TRACK_ID}.vtt"`,
    );
    // No client input reaches the disposition, so it cannot name an executable.
    expect(res.headers.get("Content-Disposition")).not.toContain("attachment");
    expect(res.headers.get("Content-Length")).toBe(String(Buffer.byteLength(VALID_WEBVTT, "utf8")));
  });

  it("marks a public track cacheable and a session-gated one no-store", async () => {
    const { GET } = await subtitleRoute();
    const publicRes = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );
    expect(publicRes.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(publicRes.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");

    h.store.assets[0].visibility = "ORGANIZATION";
    h.session = { userId: "u-1", orgId: ORG_A, role: "VIEWER" };
    vi.resetModules();
    const { GET: GET2 } = await subtitleRoute();
    const privateRes = await GET2(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );
    expect(privateRes.status).toBe(200);
    expect(privateRes.headers.get("Cache-Control")).toBe("private, no-store");
    expect(privateRes.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });
});

// ── Subtitles: IDOR ──────────────────────────────────────────────────────────

describe("subtitles GET — a track belongs to exactly one asset", () => {
  it("does NOT serve a track that belongs to a DIFFERENT asset in the same organization", async () => {
    h.store.assets.push(
      buildPublicReadyAsset({ id: OTHER_ASSET_ID, slug: "another-video" }),
    );
    h.store.subtitles.push(
      buildTrack({
        id: OTHER_TRACK_ID,
        mediaAssetId: OTHER_ASSET_ID,
        storageKey: OTHER_TRACK_KEY,
      }),
    );

    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, OTHER_TRACK_ID)),
      subtitleParams(ASSET_ID, OTHER_TRACK_ID),
    );

    expect(res.status).toBe(404);
    // The other asset's captions were never read off disk.
    expect(h.touched).toHaveLength(0);
  });

  it("does NOT serve a track row owned by another organization", async () => {
    // A row that names this asset but belongs to ORG_B — the shape a broken
    // writer or a hostile insert would produce. The organization predicate on
    // the lookup is the only thing standing in its way.
    h.store.subtitles[0] = buildTrack({ organizationId: ORG_B });

    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 for a track id that does not exist", async () => {
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, "trackdoesnotexist0001")),
      subtitleParams(ASSET_ID, "trackdoesnotexist0001"),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 for a syntactically impossible track id and never touches storage", async () => {
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, "x")),
      subtitleParams(ASSET_ID, "../../../../etc/passwd"),
    );

    expect(res.status).toBe(404);
    expect(h.actorCalls).toBe(0);
    expect(h.touched).toHaveLength(0);
  });
});

// ── Subtitles: authorization ─────────────────────────────────────────────────

describe("subtitles GET — authorization", () => {
  it("does NOT serve a DRAFT asset's captions anonymously", async () => {
    h.store.assets[0].status = "DRAFT";
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("does NOT serve a PUBLISHED asset whose visibility is only ORGANIZATION, anonymously", async () => {
    h.store.assets[0].visibility = "ORGANIZATION";
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("serves a DRAFT asset's captions to an org member holding view_media", async () => {
    h.store.assets[0].status = "DRAFT";
    h.store.assets[0].visibility = "PRIVATE";
    h.session = { userId: "u-1", orgId: ORG_A, role: "ENGINEER" };
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 404 — never 403 — to an OWNER of a DIFFERENT organization", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "attacker", orgId: ORG_B, role: "OWNER" };
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 — never 403 — to an org member whose role lacks view_media", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "u-1", orgId: ORG_A, role: "NOT_A_ROLE" };
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("NEVER serves a QUARANTINED asset's captions, even to an OWNER", async () => {
    h.store.assets[0].processingState = "QUARANTINED";
    h.session = { userId: "owner-1", orgId: ORG_A, role: "OWNER" };
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("never serves captions for an asset whose bytes have not finished validating", async () => {
    for (const state of ["PENDING_UPLOAD", "UPLOADED", "VALIDATING", "FAILED"]) {
      vi.resetModules();
      h.touched = [];
      h.store.assets[0].processingState = state;
      h.session = { userId: "owner-1", orgId: ORG_A, role: "OWNER" };
      const { GET } = await subtitleRoute();
      const res = await GET(
        getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
        subtitleParams(ASSET_ID, TRACK_ID),
      );
      expect(res.status, state).toBe(404);
      expect(h.touched).toHaveLength(0);
    }
  });

  it("answers 404 for an unknown asset id without consulting the session", async () => {
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl("assetdoesnotexist00001", TRACK_ID)),
      subtitleParams("assetdoesnotexist00001", TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.actorCalls).toBe(0);
    expect(h.touched).toHaveLength(0);
  });
});

// ── Subtitles: the stored object is untrusted ────────────────────────────────

describe("subtitles GET — stored bytes are untrusted on the way out", () => {
  it("refuses a stored track whose bytes are not WebVTT", async () => {
    h.objects.set(TRACK_KEY, shellScriptBytes());
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect((await bodyOf(res)).toString("utf8")).not.toContain("pwned");
  });

  it("refuses bytes that merely start with the WEBVTT letters but are markup", async () => {
    // "WEBVTTX…" fails the signature terminator rule, which is exactly what a
    // crafted payload trying to ride the prefix check would look like.
    h.objects.set(TRACK_KEY, Buffer.from('WEBVTT<script>alert(1)</script>', "utf8"));
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect((await bodyOf(res)).toString("utf8")).not.toContain("<script>");
  });

  it("refuses bytes that are not valid UTF-8, since the response declares a charset", async () => {
    h.objects.set(
      TRACK_KEY,
      Buffer.concat([Buffer.from("WEBVTT\n\n", "utf8"), Buffer.from([0xff, 0xfe, 0xff])]),
    );
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
  });

  it("answers 404 when the object is missing from storage", async () => {
    h.objects.delete(TRACK_KEY);
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
  });

  it("refuses a row whose storage key is not the server-generated shape", async () => {
    // The shape a hand-written or legacy row would have. It must be refused
    // before the filesystem resolver ever sees it — if it reached the mock, the
    // real `assertMediaStorageKey` would throw rather than 404.
    h.store.subtitles[0].storageKey = "media/2026/../../etc/passwd";
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("refuses a track row pointing at a non-subtitle object", async () => {
    h.store.subtitles[0].storageKey = VIDEO_SHAPED_POSTER_KEY;
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("refuses a track whose declared format is not WebVTT", async () => {
    h.store.subtitles[0].format = "srt";
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("refuses a stored object larger than the subtitle ceiling", async () => {
    const { MAX_MEDIA_SUBTITLE_BYTES } = await import("@/lib/media/validation");
    h.objects.set(
      TRACK_KEY,
      Buffer.concat([Buffer.from("WEBVTT\n\n", "utf8"), Buffer.alloc(MAX_MEDIA_SUBTITLE_BYTES)]),
    );
    const { GET } = await subtitleRoute();
    const res = await GET(
      getRequest(subtitleUrl(ASSET_ID, TRACK_ID)),
      subtitleParams(ASSET_ID, TRACK_ID),
    );

    expect(res.status).toBe(404);
    // Refused on the stat, so the oversized object was never buffered.
    expect(h.touched).toHaveLength(0);
  });
});

// ── Poster ───────────────────────────────────────────────────────────────────

describe("poster GET", () => {
  it("serves the poster of a PUBLISHED + PUBLIC + READY asset anonymously", async () => {
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="media-${ASSET_ID}-poster.png"`,
    );
    expect(res.headers.get("Content-Disposition")).not.toContain("attachment");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("Content-Length")).toBe(String(pngBytes().byteLength));
    expect((await bodyOf(res)).equals(pngBytes())).toBe(true);
    expect(h.actorCalls).toBe(0);
  });

  it("resolves the content type from the key extension, not from any row field", async () => {
    h.store.assets[0].posterStorageKey = JPEG_POSTER_KEY;
    // A hostile/incorrect asset content type must not influence the poster type.
    h.store.assets[0].contentType = "text/html";
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="media-${ASSET_ID}-poster.jpg"`,
    );
  });

  it("NEVER serves a poster key that points at a video object", async () => {
    h.store.assets[0].posterStorageKey = VIDEO_SHAPED_POSTER_KEY;
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 when no poster was ever uploaded — none is generated", async () => {
    h.store.assets[0].posterStorageKey = null;
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("refuses a poster key that is not the server-generated shape", async () => {
    h.store.assets[0].posterStorageKey = "media/2026/secret-poster.png";
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 when the poster object is missing from storage", async () => {
    h.objects.delete(POSTER_KEY);
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
  });

  it("does NOT serve a DRAFT asset's poster anonymously", async () => {
    h.store.assets[0].status = "DRAFT";
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("serves a DRAFT asset's poster to an org member holding view_media, uncacheable", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "u-1", orgId: ORG_A, role: "ENGINEER" };
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("answers 404 — never 403 — to an OWNER of a DIFFERENT organization", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "attacker", orgId: ORG_B, role: "OWNER" };
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 — never 403 — to an org member whose role lacks view_media", async () => {
    h.store.assets[0].status = "DRAFT";
    h.session = { userId: "u-1", orgId: ORG_A, role: "NOT_A_ROLE" };
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("NEVER serves a QUARANTINED asset's poster, even to an OWNER", async () => {
    h.store.assets[0].processingState = "QUARANTINED";
    h.session = { userId: "owner-1", orgId: ORG_A, role: "OWNER" };
    const { GET } = await posterRoute();
    const res = await GET(getRequest(posterUrl(ASSET_ID)), posterParams(ASSET_ID));

    expect(res.status).toBe(404);
    expect(h.touched).toHaveLength(0);
  });

  it("answers 404 for an unknown asset id and for an impossible one", async () => {
    const { GET } = await posterRoute();
    expect((await GET(getRequest(posterUrl("nosuchasset0000000001")), posterParams("nosuchasset0000000001"))).status).toBe(404);
    expect((await GET(getRequest(posterUrl("x")), posterParams("../../../../etc/passwd"))).status).toBe(404);
    expect(h.actorCalls).toBe(0);
    expect(h.touched).toHaveLength(0);
  });

  it("does not advertise a Range capability it does not implement", async () => {
    const { GET } = await posterRoute();
    const res = await GET(
      getRequest(posterUrl(ASSET_ID), { range: "bytes=0-3" }),
      posterParams(ASSET_ID),
    );

    // An unhonoured Range yields the whole representation, which is always valid.
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBeNull();
    expect(res.headers.get("Content-Range")).toBeNull();
    expect((await bodyOf(res)).byteLength).toBe(pngBytes().byteLength);
  });
});

// ── Both routes are read-only ────────────────────────────────────────────────

describe("subtitles + poster GET — no persistence writes", () => {
  it("neither handler mutates anything", async () => {
    const { readFileSync } = await import("node:fs");
    const sources = [
      "src/app/api/media/assets/[id]/subtitles/[trackId]/route.ts",
      "src/app/api/media/assets/[id]/poster/route.ts",
    ];
    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const token of [
        ".create(",
        ".update(",
        ".updateMany(",
        ".upsert(",
        ".delete(",
        ".deleteMany(",
        "$transaction(",
      ]) {
        expect(live, `${path} :: ${token}`).not.toContain(token);
      }
    }
  });
});
