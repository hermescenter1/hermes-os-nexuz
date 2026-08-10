/**
 * PHASE 102 — proof that a REAL request actually traverses the hardened read
 * primitive.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The sibling suites (`stream-route`, `subtitle-poster-get`) double
 * `openMediaObject`. That is the right call there — it lets those files assert
 * Range arithmetic and content policy without a filesystem — but it means they
 * prove nothing whatsoever about the WIRING. An import is not proof: a route
 * could import `openMediaObject` and, under a double, appear to work while the
 * production path underneath it opened a symlink.
 *
 * So nothing is doubled here except the two things that cannot be real in a unit
 * test — the database and the session. `src/lib/media/storage.ts` and
 * `src/lib/media/secure-read.ts` both run for real, against a real temporary
 * storage root with real bytes on disk, and `openSecureFile` is WRAPPED (not
 * replaced) so the test can observe exactly what the route caused it to be
 * called with.
 *
 * Three things are established for each of the three surfaces:
 *
 *   1. A successful request reaches `openSecureFile`, ONCE, with the canonical
 *      storage root and the exact validated key — not a pathname the route
 *      assembled itself.
 *   2. A key whose path resolves OUTSIDE that root is refused AT THE ROUTE, with
 *      the same uniform 404 as everything else. (Symlink-based; see the loud
 *      skip below on hosts that cannot create one.)
 *   3. The bytes in the response are the bytes on disk — so the descriptor the
 *      primitive proved is genuinely the one that was served.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ORG_A,
  VALID_WEBVTT,
  buildAsset,
  emptyStore,
  getRequest,
  mp4Bytes,
  pngBytes,
  type FakeRow,
  type FakeStore,
} from "./harness";

// ── Platform capability, probed rather than assumed ──────────────────────────

/**
 * A symlink is the only way to make a shape-valid key resolve outside the root,
 * so on a host that cannot create one those cases cannot run. They are SKIPPED
 * LOUDLY — never silently — and CI is ubuntu-latest, where they really execute.
 */
function probeSymlinkCapability(): { supported: boolean; skipReason: string } {
  let dir: string | null = null;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "hermes-symlink-probe-"));
    fsSync.writeFileSync(path.join(dir, "target"), "x");
    fsSync.symlinkSync(path.join(dir, "target"), path.join(dir, "link"));
    return { supported: true, skipReason: "" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code ?? "UNKNOWN";
    return {
      supported: false,
      skipReason:
        `SKIPPED: real symlinks cannot be created on this host ` +
        `(platform=${os.platform()}, errno=${code}). The route-level escape cases ` +
        `MUST run on Linux, where CI and production live.`,
    };
  } finally {
    if (dir) fsSync.rmSync(dir, { recursive: true, force: true });
  }
}

const SYMLINK = probeSymlinkCapability();
if (!SYMLINK.supported) console.warn(`[route-secure-read-wiring] ${SYMLINK.skipReason}`);

/**
 * A Windows DIRECTORY JUNCTION needs no privilege, and Node reports it as a
 * symbolic link — so the intermediate-directory escape (the one a `startsWith`
 * prefix test cannot see, and the most valuable case in this file) can be
 * exercised for real on a developer host that cannot create a true symlink.
 *
 * Linux takes the normal `symlink(dir)` branch; the assertion is identical
 * either way, so this widens coverage without weakening it.
 */
function probeDirLinkCapability(): { supported: boolean; type: "dir" | "junction"; skipReason: string } {
  if (SYMLINK.supported) return { supported: true, type: "dir", skipReason: "" };
  let dir: string | null = null;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "hermes-junction-probe-"));
    const target = path.join(dir, "target");
    fsSync.mkdirSync(target);
    fsSync.symlinkSync(target, path.join(dir, "link"), "junction");
    if (!fsSync.lstatSync(path.join(dir, "link")).isSymbolicLink()) {
      return {
        supported: false,
        type: "junction",
        skipReason: "SKIPPED: junctions are not reported as symbolic links on this host.",
      };
    }
    return { supported: true, type: "junction", skipReason: "" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code ?? "UNKNOWN";
    return {
      supported: false,
      type: "junction",
      skipReason:
        `SKIPPED: neither a symlink nor a directory junction can be created here ` +
        `(platform=${os.platform()}, errno=${code}). This case MUST run on Linux.`,
    };
  } finally {
    if (dir) fsSync.rmSync(dir, { recursive: true, force: true });
  }
}

const DIR_LINK = probeDirLinkCapability();
if (!DIR_LINK.supported) console.warn(`[route-secure-read-wiring] ${DIR_LINK.skipReason}`);

// ── Doubles: ONLY the database and the session ───────────────────────────────

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  /** Every `openSecureFile` call the ROUTE caused, with what it was given. */
  calls: [] as Array<{ root: string; relativePath: string; maxBytes: number }>,
  /** Calls that actually returned a usable descriptor. */
  granted: 0,
  /** Descriptor lifecycle, counted on the REAL SecureFile (see ADR §4). */
  closeCalls: 0,
  /** Windows handed to `createReadStream` — the streaming path. */
  streamWindows: [] as Array<{ start: number; end: number } | undefined>,
  /** Windows handed to `read` — the BUFFERING path. */
  readWindows: [] as Array<{ start: number; end: number } | undefined>,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const { createFakePrisma } = await import("./harness");
    return createFakePrisma(h.store);
  },
}));

vi.mock("@/lib/org/context", () => ({
  // Every case below is an ANONYMOUS read of a published public asset, so the
  // member path is never taken and needs no fixture.
  requireOrgActor: async () => ({ error: "Authentication required", status: 401 }),
}));

/**
 * The seam. `openSecureFile` keeps its REAL implementation — this only records
 * the arguments the route caused it to receive and whether it granted. Replacing
 * it would defeat the entire purpose of the file.
 */
vi.mock("@/lib/media/secure-read", async (importOriginal) => {
  const actual: typeof import("@/lib/media/secure-read") =
    await importOriginal<typeof import("@/lib/media/secure-read")>();
  return {
    ...actual,
    openSecureFile: async (input: import("@/lib/media/secure-read").OpenSecureFileInput) => {
      h.calls.push({
        root: input.root,
        relativePath: input.relativePath,
        maxBytes: input.maxBytes,
      });
      const result = await actual.openSecureFile(input);
      if (!result.ok) return result;
      h.granted += 1;

      // The descriptor itself stays REAL. It is only wrapped so the test can
      // count what the route does with it — how many times it closes, and
      // whether it streamed or buffered.
      const file = result.file;
      const wrapped: import("@/lib/media/secure-read").SecureFile = {
        get sizeBytes() {
          return file.sizeBytes;
        },
        read: (range) => {
          h.readWindows.push(range);
          return file.read(range);
        },
        createReadStream: (range) => {
          h.streamWindows.push(range);
          return file.createReadStream(range);
        },
        close: async () => {
          h.closeCalls += 1;
          return file.close();
        },
      };
      return { ...result, file: wrapped };
    },
  };
});

// ── Environment ──────────────────────────────────────────────────────────────

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let saved: Record<string, string | undefined>;
/** The configured root. */
let root: string;
/** The same root after `realpath` — what containment is actually decided against. */
let canonicalRoot: string;
/** A directory OUTSIDE the root, holding the bytes an escape would reach. */
let outside: string;

const TRACK_ID = "track00000000000000001";
const VIDEO_KEY = `media/${ORG_A}/${ASSET_ID}/11111111-2222-4333-8444-555555555555.mp4`;
const POSTER_KEY = `media/${ORG_A}/${ASSET_ID}/22222222-3333-4444-8555-666666666666.png`;
const TRACK_KEY = `media/${ORG_A}/${ASSET_ID}/33333333-4444-4555-8666-777777777777.vtt`;

const VIDEO_BYTES = mp4Bytes(968);
const POSTER_BYTES = pngBytes();
const TRACK_BYTES = Buffer.from(VALID_WEBVTT, "utf8");

function servableAsset(): FakeRow {
  return buildAsset({
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
    storageKey: VIDEO_KEY,
    posterStorageKey: POSTER_KEY,
    contentType: "video/mp4",
    byteSize: VIDEO_BYTES.byteLength,
    publishedAt: new Date("2026-02-01T00:00:00.000Z"),
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
    byteSize: TRACK_BYTES.byteLength,
    isDefault: true,
  };
}

/** Writes bytes at a key path under the REAL root, creating parents. */
async function writeAtKey(key: string, bytes: Buffer): Promise<void> {
  const full = path.join(root, ...key.split("/"));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

beforeEach(async () => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-route-wiring-"));
  canonicalRoot = await fs.realpath(root);
  outside = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-route-outside-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = root;

  await writeAtKey(VIDEO_KEY, VIDEO_BYTES);
  await writeAtKey(POSTER_KEY, POSTER_BYTES);
  await writeAtKey(TRACK_KEY, TRACK_BYTES);

  h.store = emptyStore();
  h.store.assets.push(servableAsset());
  h.store.subtitles.push(track());
  h.calls = [];
  h.granted = 0;
  h.closeCalls = 0;
  h.streamWindows = [];
  h.readWindows = [];
  vi.resetModules();
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ── The three surfaces ───────────────────────────────────────────────────────

interface Surface {
  readonly name: string;
  /** The key THIS surface is expected to hand the primitive. */
  readonly key: string;
  readonly bytes: Buffer;
  readonly run: () => Promise<Response>;
}

const SURFACES: readonly Surface[] = [
  {
    name: "stream",
    key: VIDEO_KEY,
    bytes: VIDEO_BYTES,
    run: async () => {
      const { GET } = await import("../../assets/[id]/stream/route");
      return GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
        params: Promise.resolve({ id: ASSET_ID }),
      });
    },
  },
  {
    name: "poster",
    key: POSTER_KEY,
    bytes: POSTER_BYTES,
    run: async () => {
      const { GET } = await import("../../assets/[id]/poster/route");
      return GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/poster`), {
        params: Promise.resolve({ id: ASSET_ID }),
      });
    },
  },
  {
    name: "subtitles",
    key: TRACK_KEY,
    bytes: TRACK_BYTES,
    run: async () => {
      const { GET } = await import("../../assets/[id]/subtitles/[trackId]/route");
      return GET(
        getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/subtitles/${TRACK_ID}`),
        { params: Promise.resolve({ id: ASSET_ID, trackId: TRACK_ID }) },
      );
    },
  },
];

async function bodyOf(res: Response): Promise<Buffer> {
  return Buffer.from(new Uint8Array(await res.arrayBuffer()));
}

// ── 1. The primitive is genuinely on the request path ────────────────────────

describe("a real request reaches openSecureFile with the canonical root", () => {
  for (const surface of SURFACES) {
    it(`${surface.name} opens through the primitive, once, with the validated key`, async () => {
      const res = await surface.run();
      expect(res.status).toBe(200);

      // The route caused EXACTLY ONE resolution. Two would mean a
      // stat-then-reopen pattern had come back, which is the TOCTOU window the
      // primitive exists to close.
      expect(h.calls).toHaveLength(1);
      const call = h.calls[0]!;

      // The root is the configured storage root, resolved at call time — not a
      // path the route assembled and not a frozen module-load snapshot.
      expect(path.resolve(call.root)).toBe(path.resolve(root));
      // ...and it canonicalises to the same directory containment is decided
      // against, which is what makes the assertion above meaningful.
      expect(await fs.realpath(call.root)).toBe(canonicalRoot);

      // The key travels VERBATIM. A route that decoded, joined or normalised it
      // on the way would show a different string here.
      expect(call.relativePath).toBe(surface.key);

      // The ceiling is the storage-wide one; the routes layer their tighter
      // per-kind ceilings on top of the descriptor's fstat size afterwards.
      const { MEDIA_MAX_STORED_OBJECT_BYTES } = await import("@/lib/media/storage");
      expect(call.maxBytes).toBe(MEDIA_MAX_STORED_OBJECT_BYTES);

      expect(h.granted).toBe(1);
    });

    it(`${surface.name} serves the bytes that are actually on disk`, async () => {
      const res = await surface.run();
      expect(res.status).toBe(200);
      expect(await bodyOf(res)).toEqual(surface.bytes);
    });
  }
});

// ── 2. An escape is refused AT THE ROUTE ─────────────────────────────────────

// Asserted OUTSIDE the `skipIf` below — a guard placed INSIDE a skipped
// `describe` never runs when skipped, so a Linux CI runner that silently lost
// symlink capability would report the suite green instead of failing red.
it("declares the symlink capability explicitly and never skips silently", () => {
  if (SYMLINK.supported) {
    expect(SYMLINK.skipReason).toBe("");
    return;
  }
  expect(SYMLINK.skipReason).toMatch(/^SKIPPED: real symlinks cannot be created/);
  expect(SYMLINK.skipReason).toContain(os.platform());
  expect(SYMLINK.skipReason).toMatch(/MUST run on Linux/);
  // A Linux host that cannot create a symlink is a broken CI runner, not a
  // reason to skip the suite below. Fail loudly rather than report green.
  expect(process.platform).not.toBe("linux");
});

describe.skipIf(!SYMLINK.supported)("a key resolving outside the root is refused at the route", () => {
  for (const surface of SURFACES) {
    it(`${surface.name} — final component is a symlink to a file outside the root`, async () => {
      const target = path.join(outside, "stolen.bin");
      await fs.writeFile(target, surface.bytes);
      const full = path.join(root, ...surface.key.split("/"));
      await fs.rm(full);
      await fs.symlink(target, full);

      const res = await surface.run();

      expect(res.status).toBe(404);
      // The route DID reach the primitive — it is the primitive that refused,
      // which is the wiring this file is here to prove.
      expect(h.calls).toHaveLength(1);
      expect(h.granted).toBe(0);
      expect(await bodyOf(res)).toEqual(Buffer.from(JSON.stringify({ ok: false, error: "not_found" })));
    });

  }
});

describe.skipIf(!DIR_LINK.supported)(
  "an INTERMEDIATE directory linked out of the root is refused at the route",
  () => {
    it(`asserts the link cases really ran on this host (type=${DIR_LINK.type})`, () => {
      expect(DIR_LINK.supported, DIR_LINK.skipReason).toBe(true);
    });

    for (const surface of SURFACES) {
      it(`${surface.name} — the asset directory is a link out of the root`, async () => {
        // The classic bypass a `startsWith(root)` prefix test cannot see: every
        // character of the assembled path is still under the root string, and
        // only resolving the link reveals that the bytes are elsewhere.
        const assetDir = path.join(root, "media", ORG_A, ASSET_ID);
        const stash = path.join(outside, "assets");
        await fs.mkdir(stash, { recursive: true });
        await fs.writeFile(path.join(stash, path.basename(surface.key)), surface.bytes);
        await fs.rm(assetDir, { recursive: true, force: true });
        await fs.symlink(stash, assetDir, DIR_LINK.type);

        // The escape really is reachable by an ordinary path read — otherwise
        // this test would pass for the wrong reason.
        expect(await fs.readFile(path.join(root, ...surface.key.split("/")))).toEqual(surface.bytes);

        const res = await surface.run();

        expect(res.status).toBe(404);
        expect(h.calls).toHaveLength(1);
        expect(h.granted).toBe(0);
      });
    }
  },
);

// ── 3. Portable refusals — no symlink required ───────────────────────────────

describe("shape-valid keys that cannot be served are refused uniformly", () => {
  for (const surface of SURFACES) {
    it(`${surface.name} — the object is simply absent under the root`, async () => {
      await fs.rm(path.join(root, ...surface.key.split("/")));
      const res = await surface.run();
      expect(res.status).toBe(404);
      expect(h.calls).toHaveLength(1);
      expect(h.granted).toBe(0);
    });

    it(`${surface.name} — the key names a directory, not a file`, async () => {
      const full = path.join(root, ...surface.key.split("/"));
      await fs.rm(full);
      await fs.mkdir(full);
      const res = await surface.run();
      expect(res.status).toBe(404);
      expect(h.granted).toBe(0);
    });
  }

  it("a traversal-shaped stored key never reaches the primitive at all", async () => {
    // The key validator is the FIRST gate and refuses before any filesystem
    // resolution — so the primitive is not even consulted.
    h.store.assets[0]!.storageKey = "media/../../../../etc/passwd";
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("an absolute stored key never reaches the primitive either", async () => {
    h.store.assets[0]!.storageKey = path.join(outside, "anything.mp4").replace(/\\/g, "/");
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.calls).toEqual([]);
  });
});

// ── 3b. Descriptor lifecycle — exactly one close, never two, never none ──────

/**
 * The number of descriptors this process currently holds.
 *
 * `/proc/self/fd` is Linux-only, which is fine: Linux is where CI and
 * production run, and a leak is a property of the deployed host. On a developer
 * host the count is unavailable and the leak assertions skip loudly, while the
 * portable close-accounting below still runs everywhere.
 */
function openFdCount(): number | null {
  try {
    return fsSync.readdirSync("/proc/self/fd").length;
  } catch {
    return null;
  }
}

const FD_COUNTING = openFdCount() !== null;
if (!FD_COUNTING) {
  console.warn(
    `[route-secure-read-wiring] SKIPPED: /proc/self/fd is unavailable on this host ` +
      `(platform=${os.platform()}), so descriptor-leak counting cannot run. It MUST run on Linux.`,
  );
}

/** Waits, bounded, for the process to drop back to a descriptor baseline. */
async function settleToFdBaseline(baseline: number): Promise<number> {
  let last = openFdCount() ?? baseline;
  for (let attempt = 0; attempt < 50 && last > baseline; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    last = openFdCount() ?? baseline;
  }
  return last;
}

describe("the descriptor is accounted for on every exit path", () => {
  it("success — ownership passes to the stream, so the route must NOT also close", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(200);
    await bodyOf(res);

    // A close here would be a DOUBLE close: `createReadStream` was opened with
    // `autoClose`, so the stream already owns and closes the descriptor.
    expect(h.closeCalls, "route double-closed a descriptor it had handed away").toBe(0);
    expect(h.streamWindows).toHaveLength(1);
  });

  it("416 — the route closes the descriptor it opened and did not use", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, {
        range: `bytes=${VIDEO_BYTES.byteLength + 10}-`,
      }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(res.status).toBe(416);
    // Exactly once: a leak on the refusal path is an availability bug under a
    // client that retries a refused range.
    expect(h.closeCalls).toBe(1);
    expect(h.streamWindows).toEqual([]);
  });

  it("multi-range is refused, and its descriptor is released too", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, {
        range: "bytes=0-9,20-29",
      }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(res.status).toBe(416);
    expect(h.closeCalls).toBe(1);
    expect(h.streamWindows).toEqual([]);
  });

  it("a content-policy refusal after the open still closes — poster magic mismatch", async () => {
    // Bytes that are not a PNG at a key the route believes is one.
    await writeAtKey(POSTER_KEY, Buffer.from("#!/bin/sh\necho pwned\n", "utf8"));
    const { GET } = await import("../../assets/[id]/poster/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/poster`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.granted).toBe(1);
    expect(h.closeCalls).toBe(1);
  });

  it("a content-policy refusal after the open still closes — stream magic mismatch", async () => {
    // The exact adversarial reproduction (Blocker-2 Finding 2): 64 bytes of
    // 0x01 at a key whose row claims video/mp4. This used to answer 200 with
    // Content-Type: video/mp4; it must now converge on the same uniform 404
    // as poster and subtitles, and the descriptor must still be released.
    await writeAtKey(VIDEO_KEY, Buffer.alloc(64, 0x01));
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.granted).toBe(1);
    expect(h.closeCalls).toBe(1);
  });

  it("subtitles close the descriptor exactly once on the success path", async () => {
    // This route reads into memory (a 2 MB-capped WebVTT track) rather than
    // streaming, so IT owns the close and must perform exactly one.
    const { GET } = await import("../../assets/[id]/subtitles/[trackId]/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/subtitles/${TRACK_ID}`),
      { params: Promise.resolve({ id: ASSET_ID, trackId: TRACK_ID }) },
    );
    expect(res.status).toBe(200);
    expect(h.closeCalls).toBe(1);
    expect(h.streamWindows).toEqual([]);
  });

  it.skipIf(!FD_COUNTING)("leaks no descriptor across success, refusal and abort", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const baseline = openFdCount()!;

    // 1. A fully consumed success.
    const ok = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    await bodyOf(ok);
    expect(await settleToFdBaseline(baseline)).toBeLessThanOrEqual(baseline);

    // 2. A refused range.
    const refused = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, {
        range: `bytes=${VIDEO_BYTES.byteLength + 10}-`,
      }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(refused.status).toBe(416);
    expect(await settleToFdBaseline(baseline)).toBeLessThanOrEqual(baseline);

    // 3. A client that navigates away mid-playback.
    const controller = new AbortController();
    const aborted = await GET(
      new NextRequest(
        new Request(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, {
          method: "GET",
          signal: controller.signal,
        }),
      ),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(aborted.status).toBe(200);
    controller.abort();
    expect(
      await settleToFdBaseline(baseline),
      "a client abort left a descriptor open on the server",
    ).toBeLessThanOrEqual(baseline);
  });
});

// ── 4. Range streaming still comes off the proven descriptor ─────────────────

describe("stream — a real Range is satisfied from the verified descriptor", () => {
  it("206 with the exact requested bytes, read through the primitive", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, { range: "bytes=10-19" }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Content-Range")).toBe(`bytes 10-19/${VIDEO_BYTES.byteLength}`);
    expect(await bodyOf(res)).toEqual(VIDEO_BYTES.subarray(10, 20));
    expect(h.calls).toHaveLength(1);
  });

  it("the size in Content-Range is the fstat size, not the database column", async () => {
    // The row lies about the size; the descriptor cannot.
    h.store.assets[0]!.byteSize = 999_999;
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(VIDEO_BYTES.byteLength));
  });

  it("streams the window — it never buffers the object to serve a Range", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, { range: "bytes=10-19" }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(res.status).toBe(206);
    await bodyOf(res);

    // THE regression this guards (ADR §4): "simplify to readFile" keeps every
    // Range assertion green while memory per viewer becomes the whole file.
    // The ONLY buffered read is the bounded magic-byte sniff (Blocker-2
    // Finding 2) — never the Range itself — and the stream must have been
    // asked for EXACTLY the requested window, not the whole object.
    expect(h.readWindows, "only the bounded magic-byte sniff, never the Range").toEqual([
      { start: 0, end: 63 },
    ]);
    expect(h.streamWindows).toEqual([{ start: 10, end: 19 }]);
  });

  it("a full-object GET still streams rather than buffering", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`), {
      params: Promise.resolve({ id: ASSET_ID }),
    });
    expect(res.status).toBe(200);
    await bodyOf(res);
    expect(h.readWindows).toEqual([{ start: 0, end: 63 }]);
    expect(h.streamWindows).toHaveLength(1);
  });

  it("an unsatisfiable range is 416 against the real size", async () => {
    const { GET } = await import("../../assets/[id]/stream/route");
    const res = await GET(
      getRequest(`http://hermes.test/api/media/assets/${ASSET_ID}/stream`, {
        range: `bytes=${VIDEO_BYTES.byteLength + 10}-`,
      }),
      { params: Promise.resolve({ id: ASSET_ID }) },
    );
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${VIDEO_BYTES.byteLength}`);
  });
});
