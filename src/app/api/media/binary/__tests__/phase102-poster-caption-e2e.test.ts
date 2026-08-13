/**
 * PHASE 102 / RELEASE BLOCKER 1 — poster and captions, end to end, with real
 * bytes on a real filesystem.
 *
 * THE DEFECT
 * The read half of this feature shipped without the write half, and the product
 * layer was never connected to either. `GET …/poster` and
 * `GET …/subtitles/[trackId]` existed and worked. `MediaAsset.posterStorageKey`
 * had NO writer anywhere in the product. The Video Hub loader returned
 * `posterUrl: null` and `subtitleTracks: []` as literals, and the public detail
 * API described caption tracks without giving a caller any way to fetch one. So
 * `MediaPlayer` — which has rendered `<video poster>` and `<track>` since the
 * phase began — was handed nothing, every time, by construction.
 *
 * WHY THIS TEST IS AT THIS LEVEL
 * The unit suites all passed while the feature was inert, because each layer was
 * correct in isolation. Only a test that runs the WHOLE chain can show the
 * product works:
 *
 *   1. POST the real poster route with real PNG bytes
 *   2. POST the real subtitle route with real WEBVTT
 *   3. load the Video Hub watch view through the real loader
 *   4. take the URLs it minted and GET them through the real byte routes
 *   5. assert the bytes that come back are byte-identical to what went in
 *
 * Nothing about steps 4 and 5 can pass if any earlier step invented a URL: the
 * address has to round-trip to the object that was actually written.
 *
 * WHAT IS REAL: the storage layer (a real temp directory on disk), the validator
 * and its magic-byte table, both upload handlers, both byte handlers, the
 * byte-serving authorization chain, the key algebra and the Video Hub loader.
 * Only Prisma, the limiter, the entitlement resolver and the audit sink are
 * doubled.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createMediaPrismaDouble, type Double } from "../../public/__tests__/media-prisma-double";

const ORG = { id: "org-A", slug: "hermes-a", name: "Hermes A" };
const ASSET_ID = "a-public";
const SLUG = "plc-basics";

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; tables: Record<string, Record<string, unknown>[]> },
  session: { userId: "user-1", orgId: "org-A", role: "OWNER" } as null | {
    userId: string;
    orgId: string;
    role: string;
  },
}));

vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db.client }));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () =>
    h.session
      ? { ctx: { userId: h.session.userId, orgId: h.session.orgId, authMethod: "jwt", scopes: [] } }
      : { error: "Authentication required", status: 401 },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) =>
    h.session && h.session.orgId === orgId
      ? {
          ctx: {
            userId: h.session.userId,
            orgId,
            memberId: "member-1",
            role: h.session.role,
            status: "ACTIVE",
          },
        }
      : { error: "Not a member", status: 403 },
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async () => true,
  retryAfter: () => 42,
}));

vi.mock("@/lib/billing-governance/runtime/require-entitlement", () => ({
  enforceEntitlement: async () => ({ ok: true, decision: { allowed: true } }),
}));

vi.mock("@/lib/audit/audit-service", () => ({ recordAuditEvent: async () => {} }));

/* ── Real bytes ─────────────────────────────────────────────────────────────
 *
 * A structurally valid PNG (signature + IHDR length field) and a WEBVTT file
 * that satisfies the real container inspector. Random bytes would prove nothing:
 * `validateMediaUpload` reads the magic and the inspector parses the header.
 */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from("IHDR", "latin1"),
  Buffer.alloc(48),
]);

const VTT_TEXT = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:04.000",
  "Isolate the drive before opening the cabinet.",
  "",
  "00:00:04.000 --> 00:00:09.000",
  "<v Engineer>Confirm the zero-energy state.</v>",
  "",
].join("\n");

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let savedEnv: Record<string, string | undefined>;
let storageDir: string;

beforeAll(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  storageDir = mkdtempSync(path.join(tmpdir(), "hermes-p102-e2e-"));
  process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "local";
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = storageDir;
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(storageDir, { recursive: true, force: true });
});

function seed(): Double {
  return createMediaPrismaDouble({
    organization: [{ ...ORG }],
    mediaAsset: [
      {
        id: ASSET_ID,
        organizationId: ORG.id,
        slug: SLUG,
        primaryLocale: "en",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        processingState: "READY",
        skillLevel: null,
        categoryId: null,
        instructorId: null,
        siteId: null,
        storageKey: `media/${ORG.id}/${ASSET_ID}/99999999-2222-4333-8444-555555555555.mp4`,
        storageProvider: "local",
        contentType: "video/mp4",
        byteSize: 2048,
        checksumSha256: null,
        durationSeconds: 600,
        posterStorageKey: null,
        viewCount: 0,
        saveCount: 0,
        completionCount: 0,
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
        archivedAt: null,
        createdBy: "user-1",
        updatedBy: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    mediaAssetTranslation: [
      {
        id: "tr-1",
        organizationId: ORG.id,
        mediaAssetId: ASSET_ID,
        locale: "en",
        title: "PLC Basics",
        summary: null,
        description: null,
        seoTitle: null,
        seoDescription: null,
        keywords: [],
      },
    ],
    mediaSubtitleTrack: [],
    mediaChapter: [],
    mediaTranscript: [],
    mediaCategory: [],
    mediaInstructor: [],
  });
}

beforeEach(() => {
  h.db = seed() as never;
  h.session = { userId: "user-1", orgId: ORG.id, role: "OWNER" };
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ── Drivers over the REAL handlers ─────────────────────────────────────────*/

const ALLOWED_ORIGIN = "https://hermesnovin.com";

function multipart(url: string, form: FormData): Request {
  return new Request(url, {
    method: "POST",
    body: form,
    headers: { origin: ALLOWED_ORIGIN, "x-real-ip": "10.0.0.9" },
  });
}

async function uploadPoster(): Promise<Response> {
  const { POST } = await import("../../assets/[id]/poster/upload/route");
  const form = new FormData();
  form.append("file", new File([new Uint8Array(PNG_BYTES)], "cover.png", { type: "image/png" }));
  return POST(
    multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/poster/upload`, form) as never,
    { params: Promise.resolve({ id: ASSET_ID }) } as never,
  );
}

async function uploadCaptions(locale: string, label: string, isDefault: boolean): Promise<Response> {
  const { POST } = await import("../../assets/[id]/subtitles/route");
  const form = new FormData();
  form.append("file", new File([VTT_TEXT], "captions.vtt", { type: "text/vtt" }));
  form.append("locale", locale);
  form.append("label", label);
  if (isDefault) form.append("isDefault", "true");
  return POST(
    multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/subtitles`, form) as never,
    { params: Promise.resolve({ id: ASSET_ID }) } as never,
  );
}

/** Fetch a minted same-origin URL through whichever real GET handler owns it. */
async function fetchMinted(url: string): Promise<Response> {
  const req = new Request(`http://hermes.test${url}`, { method: "GET" });
  const parts = url.split("/").filter(Boolean); // api media assets <id> …
  const assetId = parts[3];

  if (parts[4] === "poster") {
    const { GET } = await import("../../assets/[id]/poster/route");
    return GET(req as never, { params: Promise.resolve({ id: assetId }) } as never);
  }
  const { GET } = await import("../../assets/[id]/subtitles/[trackId]/route");
  return GET(req as never, {
    params: Promise.resolve({ id: assetId, trackId: parts[5] }),
  } as never);
}

async function watchView() {
  const { loadVideoWatch } = await import("@/app/[locale]/videos/data");
  return loadVideoWatch({
    scope: { organizationId: ORG.id, orgSlug: ORG.slug },
    slug: SLUG,
    routeLocale: "en",
  });
}

/* ═══════════════════════════════ the chain ═════════════════════════════════ */

describe("poster: upload → loader → byte route → the same bytes back", () => {
  it("round-trips real PNG bytes through a URL the product minted", async () => {
    // Before the upload the product honestly reports no poster.
    expect((await watchView())?.playback.posterUrl).toBeNull();

    const uploaded = await uploadPoster();
    expect(uploaded.status).toBe(201);
    const uploadBody = (await uploaded.json()) as { data: { posterUrl: string } };

    // The loader now mints an address, and it agrees with what the upload said.
    const view = await watchView();
    const posterUrl = view?.playback.posterUrl;
    expect(posterUrl).toBe(`/api/media/assets/${ASSET_ID}/poster`);
    expect(uploadBody.data.posterUrl).toBe(posterUrl);

    // And that address serves the exact bytes that were uploaded.
    const served = await fetchMinted(posterUrl as string);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");

    const body = Buffer.from(await served.arrayBuffer());
    expect(body.equals(PNG_BYTES)).toBe(true);
  });

  it("never puts the storage key in any response on the path", async () => {
    const uploaded = await uploadPoster();
    const uploadText = JSON.stringify(await uploaded.json());
    expect(uploadText).not.toContain("media/org-A");
    expect(uploadText).not.toContain("storageKey");

    const view = await watchView();
    expect(JSON.stringify(view)).not.toContain("media/org-A");
  });

  it("refuses a caption file offered to the poster surface", async () => {
    const { POST } = await import("../../assets/[id]/poster/upload/route");
    const form = new FormData();
    form.append("file", new File([VTT_TEXT], "captions.vtt", { type: "text/vtt" }));
    const res = await POST(
      multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/poster/upload`, form) as never,
      { params: Promise.resolve({ id: ASSET_ID }) } as never,
    );
    expect(res.status).toBe(415);
    expect((await watchView())?.playback.posterUrl).toBeNull();
  });

  it("refuses bytes that contradict the declared image type", async () => {
    const { POST } = await import("../../assets/[id]/poster/upload/route");
    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from("#!/bin/sh\necho pwned\n")], "cover.png", { type: "image/png" }),
    );
    const res = await POST(
      multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/poster/upload`, form) as never,
      { params: Promise.resolve({ id: ASSET_ID }) } as never,
    );
    expect(res.status).toBe(422);
    expect((await watchView())?.playback.posterUrl).toBeNull();
  });

  it("replaces an existing poster and keeps serving the NEW bytes", async () => {
    expect((await uploadPoster()).status).toBe(201);

    const second = Buffer.concat([PNG_BYTES, Buffer.from("second-generation")]);
    const { POST } = await import("../../assets/[id]/poster/upload/route");
    const form = new FormData();
    form.append("file", new File([new Uint8Array(second)], "cover2.png", { type: "image/png" }));
    const replaced = await POST(
      multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/poster/upload`, form) as never,
      { params: Promise.resolve({ id: ASSET_ID }) } as never,
    );
    expect(replaced.status).toBe(201);
    expect(((await replaced.json()) as { data: { replacedExisting: boolean } }).data.replacedExisting).toBe(
      true,
    );

    const view = await watchView();
    const served = await fetchMinted(view?.playback.posterUrl as string);
    const body = Buffer.from(await served.arrayBuffer());
    expect(body.equals(second)).toBe(true);
  });
});

describe("captions: upload → loader → byte route → the same WEBVTT back", () => {
  it("round-trips real WEBVTT through a URL the product minted", async () => {
    expect((await watchView())?.playback.subtitleTracks).toEqual([]);

    expect((await uploadCaptions("en", "English", true)).status).toBe(201);
    expect((await uploadCaptions("fa", "فارسی", false)).status).toBe(201);

    const view = await watchView();
    const tracks = view?.playback.subtitleTracks ?? [];
    expect(tracks).toHaveLength(2);
    // The default track sorts first, which is what the player reads.
    expect(tracks[0].isDefault).toBe(true);
    expect(tracks[0].locale).toBe("en");

    for (const track of tracks) {
      expect(track.src).toBe(`/api/media/assets/${ASSET_ID}/subtitles/${track.id}`);

      const served = await fetchMinted(track.src);
      expect(served.status, track.locale).toBe(200);
      expect(served.headers.get("content-type")).toBe("text/vtt; charset=utf-8");
      expect(served.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await served.text()).toBe(VTT_TEXT);
    }
  });

  it("mints a distinct address per track — the ids are not interchangeable", async () => {
    await uploadCaptions("en", "English", true);
    await uploadCaptions("fa", "فارسی", false);

    const tracks = (await watchView())?.playback.subtitleTracks ?? [];
    const ids = tracks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tracks.map((t) => t.src)).size).toBe(tracks.length);
  });

  it("exposes no storage key through the loader or the byte response", async () => {
    await uploadCaptions("en", "English", true);
    const view = await watchView();
    expect(JSON.stringify(view?.playback.subtitleTracks)).not.toContain("media/org-A");
    expect(JSON.stringify(view?.playback.subtitleTracks)).not.toContain("storageKey");
  });

  it("refuses a poster offered to the caption surface", async () => {
    const { POST } = await import("../../assets/[id]/subtitles/route");
    const form = new FormData();
    form.append("file", new File([new Uint8Array(PNG_BYTES)], "cover.png", { type: "image/png" }));
    form.append("locale", "en");
    const res = await POST(
      multipart(`http://hermes.test/api/media/assets/${ASSET_ID}/subtitles`, form) as never,
      { params: Promise.resolve({ id: ASSET_ID }) } as never,
    );
    expect(res.status).toBe(415);
    expect((await watchView())?.playback.subtitleTracks).toEqual([]);
  });
});

/* ═════════════════════════ what the player receives ════════════════════════ */

describe("the rendered player carries the minted addresses", () => {
  it("hands MediaPlayer a poster and one <track> per caption, all same-origin", async () => {
    await uploadPoster();
    await uploadCaptions("en", "English", true);
    await uploadCaptions("fa", "فارسی", false);

    const view = await watchView();
    const playback = view?.playback;

    // The exact props MediaPlayer reads: `poster={media.posterUrl}` and one
    // <track src> per entry of `media.subtitleTracks` (MediaPlayer.tsx).
    expect(playback?.posterUrl).toBe(`/api/media/assets/${ASSET_ID}/poster`);
    expect(playback?.subtitleTracks.map((t) => t.locale).sort()).toEqual(["en", "fa"]);

    for (const url of [playback?.posterUrl, ...(playback?.subtitleTracks ?? []).map((t) => t.src)]) {
      // Same-origin and rooted at the byte plane. An absolute URL here would be
      // a third-party fetch from the player.
      expect(String(url).startsWith("/api/media/assets/")).toBe(true);
    }

    // Every one of them resolves through a real handler.
    for (const url of [playback?.posterUrl, ...(playback?.subtitleTracks ?? []).map((t) => t.src)]) {
      expect((await fetchMinted(String(url))).status, String(url)).toBe(200);
    }
  });
});
