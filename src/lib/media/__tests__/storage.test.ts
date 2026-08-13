import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsSync, { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Readable } from "stream";
import { SECURE_READ_PLATFORM } from "../secure-read";
import { MAX_MEDIA_UPLOAD_BYTES } from "../validation";
import {
  MAX_MEDIA_BUFFERED_RANGE_BYTES,
  MEDIA_KEY_PREFIX,
  MEDIA_MAX_STORED_OBJECT_BYTES,
  MEDIA_STORAGE_ERROR_CODES,
  MediaStorageError,
  assertMediaStorageKey,
  buildMediaStorageKey,
  deleteMediaObject,
  formatContentRange,
  formatUnsatisfiedContentRange,
  getMediaObject,
  isMediaStorageKey,
  mediaObjectExists,
  openMediaByteRange,
  parseRangeHeader,
  putMediaObject,
  readMediaByteRange,
  statMediaObject,
} from "../storage";

/**
 * PHASE 102 — media storage + range reader.
 *
 * These tests exercise the REAL local provider against a throwaway temp
 * directory (the same technique as the document object-storage suite), so the
 * path arithmetic behind the range reader is proven rather than mocked.
 *
 * The read side now delegates containment, symlink refusal, file-type proof and
 * the size ceiling to `../secure-read`. That module has its own adversarial
 * suite; what is pinned HERE is the WIRING — that the media layer actually
 * routes every read through it, with the right root and the right ceiling, and
 * that a refusal arrives as `null` rather than as an exception carrying a path.
 */

/** Windows needs Administrator or Developer Mode to create a symlink. */
function probeSymlinkCapability(): { supported: boolean; skipReason: string | null } {
  let dir: string | null = null;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "hermes-media-symlink-probe-"));
    fsSync.writeFileSync(path.join(dir, "t.bin"), "probe");
    fsSync.symlinkSync(path.join(dir, "t.bin"), path.join(dir, "l.bin"), "file");
    return { supported: true, skipReason: null };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "UNKNOWN";
    return {
      supported: false,
      skipReason:
        `SKIPPED: real symlinks cannot be created on this host ` +
        `(platform=${os.platform()}, errno=${code}). These cases MUST run on ` +
        `Linux, where CI and production live.`,
    };
  } finally {
    if (dir) fsSync.rmSync(dir, { recursive: true, force: true });
  }
}

const SYMLINK = probeSymlinkCapability();
if (!SYMLINK.supported) console.warn(SYMLINK.skipReason);

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let saved: Record<string, string | undefined>;
let tempDir: string;

const ORG_ID = "org1234567890abcdef";
const ASSET_ID = "asset1234567890abcd";

beforeEach(async () => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-media-storage-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

function newKey(extension = "mp4"): string {
  return buildMediaStorageKey({ organizationId: ORG_ID, assetId: ASSET_ID, extension });
}

/** Deterministic, non-repeating bytes so an off-by-one slice cannot pass. */
function payload(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) buffer[index] = index % 251;
  return buffer;
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// ── Key minting ──────────────────────────────────────────────────────────────

describe("buildMediaStorageKey", () => {
  it("namespaces by organization and asset and names the object with a UUID", () => {
    const key = newKey();
    expect(key).toMatch(
      new RegExp(
        `^${MEDIA_KEY_PREFIX}/${ORG_ID}/${ASSET_ID}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.mp4$`,
      ),
    );
  });

  it("never derives the object name from anything the client controls", () => {
    // Two mints for the same asset must not collide, which is only true because
    // the name is random rather than filename-derived.
    expect(newKey()).not.toBe(newKey());
  });

  it("refuses identifier segments that could alter the path", () => {
    for (const bad of ["../etc", "a/b", "a\\b", "", ".", "..", "a b", "a".repeat(65)]) {
      expect(() => buildMediaStorageKey({ organizationId: bad, assetId: ASSET_ID, extension: "mp4" }))
        .toThrow(MediaStorageError);
      expect(() => buildMediaStorageKey({ organizationId: ORG_ID, assetId: bad, extension: "mp4" }))
        .toThrow(MediaStorageError);
    }
  });

  it("refuses an extension outside the media allow-list", () => {
    for (const bad of ["exe", "php", "html", "pdf", "svg"]) {
      expect(() => newKey(bad)).toThrow(/allow-list/i);
    }
  });

  it("accepts every allow-listed media extension", () => {
    for (const good of ["mp4", "webm", "mkv", "ogv", "vtt", "png", "jpg", "webp"]) {
      expect(isMediaStorageKey(newKey(good))).toBe(true);
    }
  });
});

// ── Key validation (fail-closed, never rewriting) ────────────────────────────

describe("assertMediaStorageKey — traversal-shaped keys are refused, not sanitised", () => {
  const hostile = [
    "media/org/asset/../../../etc/passwd",
    "media/../../etc/passwd",
    "/media/org/asset/00000000-0000-4000-8000-000000000000.mp4",
    "media\\org\\asset\\00000000-0000-4000-8000-000000000000.mp4",
    "media/org/asset/../00000000-0000-4000-8000-000000000000.mp4",
    "media/org/asset/00000000-0000-4000-8000-000000000000.mp4/../../x.mp4",
    "documents/org/asset/00000000-0000-4000-8000-000000000000.mp4",
    "media/org/asset/original.mp4",
    "media/org/asset/00000000-0000-4000-8000-000000000000.exe",
    "media/org/asset/00000000-0000-4000-8000-000000000000.mp4.exe",
    "",
    "media//asset/00000000-0000-4000-8000-000000000000.mp4",
  ];

  it("rejects every hostile or non-canonical key shape", () => {
    for (const key of hostile) {
      expect(isMediaStorageKey(key)).toBe(false);
      expect(() => assertMediaStorageKey(key)).toThrow(MediaStorageError);
    }
  });

  it("rejects non-string keys", () => {
    for (const key of [null, undefined, 42, {}, []]) {
      expect(isMediaStorageKey(key)).toBe(false);
    }
  });

  it("refuses to read or write through a hostile key", async () => {
    const key = "media/org/asset/../../../etc/passwd";
    await expect(putMediaObject({ key, body: Buffer.from("x"), contentType: "video/mp4" }))
      .rejects.toThrow(MediaStorageError);
    await expect(getMediaObject(key)).rejects.toThrow(MediaStorageError);
    await expect(deleteMediaObject(key)).rejects.toThrow(MediaStorageError);
    await expect(mediaObjectExists(key)).rejects.toThrow(MediaStorageError);
    await expect(statMediaObject(key)).rejects.toThrow(MediaStorageError);
    await expect(openMediaByteRange(key)).rejects.toThrow(MediaStorageError);
  });
});

// ── Round trip through the shared seam ───────────────────────────────────────

describe("byte persistence delegates to the document object-storage seam", () => {
  it("round-trips bytes and returns the key unchanged", async () => {
    const key = newKey();
    const body = payload(4096);
    const result = await putMediaObject({ key, body, contentType: "video/mp4" });

    // Key equality proves the seam's sanitizeKey() is a no-op for our shape —
    // i.e. the range reader's own path arithmetic cannot diverge from it.
    expect(result.key).toBe(key);
    expect(result.sizeBytes).toBe(4096);
    expect(await getMediaObject(key)).toEqual(body);
    expect(await mediaObjectExists(key)).toBe(true);

    await deleteMediaObject(key);
    expect(await mediaObjectExists(key)).toBe(false);
  });

  it("writes underneath the configured storage root and nowhere else", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(16), contentType: "video/mp4" });
    const onDisk = path.join(tempDir, ...key.split("/"));
    await expect(fs.access(onDisk)).resolves.toBeUndefined();
  });
});

// ── stat ─────────────────────────────────────────────────────────────────────

describe("statMediaObject", () => {
  it("reports the true size without reading the object", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(12345), contentType: "video/mp4" });
    expect(await statMediaObject(key)).toEqual({ sizeBytes: 12345 });
  });

  it("returns null for an object that was never written", async () => {
    expect(await statMediaObject(newKey())).toBeNull();
  });
});

// ── Range parsing ────────────────────────────────────────────────────────────

describe("parseRangeHeader", () => {
  const SIZE = 1000;

  it("treats a missing or empty header as no range at all", () => {
    expect(parseRangeHeader(null, SIZE)).toEqual({ outcome: "none" });
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ outcome: "none" });
    expect(parseRangeHeader("   ", SIZE)).toEqual({ outcome: "none" });
  });

  it("parses a closed range", () => {
    expect(parseRangeHeader("bytes=0-499", SIZE)).toEqual({
      outcome: "satisfiable",
      start: 0,
      end: 499,
      length: 500,
      sizeBytes: SIZE,
    });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=900-", SIZE)).toEqual({
      outcome: "satisfiable",
      start: 900,
      end: 999,
      length: 100,
      sizeBytes: SIZE,
    });
  });

  it("parses a suffix range as the LAST n bytes", () => {
    expect(parseRangeHeader("bytes=-200", SIZE)).toEqual({
      outcome: "satisfiable",
      start: 800,
      end: 999,
      length: 200,
      sizeBytes: SIZE,
    });
  });

  it("clamps a suffix longer than the object to the whole object", () => {
    expect(parseRangeHeader("bytes=-99999", SIZE)).toEqual({
      outcome: "satisfiable",
      start: 0,
      end: 999,
      length: 1000,
      sizeBytes: SIZE,
    });
  });

  it("clamps an end past the object rather than failing", () => {
    expect(parseRangeHeader("bytes=990-99999", SIZE)).toEqual({
      outcome: "satisfiable",
      start: 990,
      end: 999,
      length: 10,
      sizeBytes: SIZE,
    });
  });

  it("reports an out-of-bounds start as UNSATISFIABLE so the caller can answer 416", () => {
    expect(parseRangeHeader("bytes=1000-1200", SIZE)).toEqual({
      outcome: "unsatisfiable",
      sizeBytes: SIZE,
    });
    expect(parseRangeHeader("bytes=5000-", SIZE)).toEqual({
      outcome: "unsatisfiable",
      sizeBytes: SIZE,
    });
    // A zero-length suffix is well-formed and can never be satisfied.
    expect(parseRangeHeader("bytes=-0", SIZE)).toEqual({
      outcome: "unsatisfiable",
      sizeBytes: SIZE,
    });
  });

  it("treats every range against a zero-length object as unsatisfiable", () => {
    expect(parseRangeHeader("bytes=0-0", 0)).toEqual({ outcome: "unsatisfiable", sizeBytes: 0 });
    expect(parseRangeHeader("bytes=-1", 0)).toEqual({ outcome: "unsatisfiable", sizeBytes: 0 });
  });

  it("reports an inverted range as malformed", () => {
    expect(parseRangeHeader("bytes=500-100", SIZE)).toEqual({
      outcome: "malformed",
      reason: "inverted",
    });
  });

  it("reports a multi-range request as malformed — a partial answer would be a lie", () => {
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toEqual({
      outcome: "malformed",
      reason: "multi_range",
    });
  });

  it("rejects a non-bytes unit", () => {
    expect(parseRangeHeader("items=0-99", SIZE)).toEqual({
      outcome: "malformed",
      reason: "unit_not_bytes",
    });
  });

  it("rejects non-numeric bounds", () => {
    for (const header of ["bytes=abc-def", "bytes=0x10-0x20", "bytes=1e3-2e3", "bytes=-abc"]) {
      const parsed = parseRangeHeader(header, SIZE);
      expect(parsed.outcome).toBe("malformed");
    }
  });

  it("rejects structurally broken headers", () => {
    for (const header of ["bytes", "bytes=", "bytes=-", "bytes=1-2-3", "bytes=1 - 2", "0-99"]) {
      expect(parseRangeHeader(header, SIZE).outcome).toBe("malformed");
    }
  });

  it("accepts a case-insensitive unit token", () => {
    expect(parseRangeHeader("BYTES=0-9", SIZE).outcome).toBe("satisfiable");
  });

  it("survives an absurdly long numeric bound without losing precision", () => {
    expect(parseRangeHeader(`bytes=${"9".repeat(40)}-`, SIZE)).toEqual({
      outcome: "unsatisfiable",
      sizeBytes: SIZE,
    });
    expect(parseRangeHeader(`bytes=0-${"9".repeat(40)}`, SIZE)).toEqual({
      outcome: "satisfiable",
      start: 0,
      end: 999,
      length: 1000,
      sizeBytes: SIZE,
    });
  });

  it("refuses to evaluate a range against a nonsensical object size", () => {
    expect(() => parseRangeHeader("bytes=0-9", -1)).toThrow(MediaStorageError);
    expect(() => parseRangeHeader("bytes=0-9", 1.5)).toThrow(MediaStorageError);
  });
});

describe("Content-Range formatting", () => {
  it("formats a 206 header", () => {
    expect(formatContentRange({ start: 0, end: 499, sizeBytes: 1000 })).toBe("bytes 0-499/1000");
  });

  it("formats a 416 header that discloses only the size", () => {
    expect(formatUnsatisfiedContentRange(1000)).toBe("bytes */1000");
  });
});

// ── The range reader ─────────────────────────────────────────────────────────

describe("openMediaByteRange — streams a slice without materialising the object", () => {
  it("returns exactly the requested bytes", async () => {
    const key = newKey();
    const body = payload(10_000);
    await putMediaObject({ key, body, contentType: "video/mp4" });

    const opened = await openMediaByteRange(key, { start: 4096, end: 8191 });
    expect(opened).not.toBeNull();
    if (!opened) return;
    expect(opened.start).toBe(4096);
    expect(opened.end).toBe(8191);
    expect(opened.length).toBe(4096);
    expect(opened.sizeBytes).toBe(10_000);
    expect(await collect(opened.stream)).toEqual(body.subarray(4096, 8192));
  });

  it("serves the last byte of the object, the classic seek probe", async () => {
    const key = newKey();
    const body = payload(2048);
    await putMediaObject({ key, body, contentType: "video/mp4" });

    const parsed = parseRangeHeader("bytes=-1", 2048);
    expect(parsed.outcome).toBe("satisfiable");
    if (parsed.outcome !== "satisfiable") return;

    const opened = await openMediaByteRange(key, { start: parsed.start, end: parsed.end });
    expect(opened).not.toBeNull();
    if (!opened) return;
    expect(await collect(opened.stream)).toEqual(body.subarray(2047));
  });

  it("defaults to the whole object when no range is given", async () => {
    const key = newKey();
    const body = payload(777);
    await putMediaObject({ key, body, contentType: "video/mp4" });

    const opened = await openMediaByteRange(key);
    expect(opened).not.toBeNull();
    if (!opened) return;
    expect(opened.length).toBe(777);
    expect(await collect(opened.stream)).toEqual(body);
  });

  it("returns null for a missing object instead of inventing an empty body", async () => {
    expect(await openMediaByteRange(newKey())).toBeNull();
  });

  it("throws for a range the object cannot satisfy", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(100), contentType: "video/mp4" });
    await expect(openMediaByteRange(key, { start: 0, end: 100 })).rejects.toThrow(MediaStorageError);
    await expect(openMediaByteRange(key, { start: 100, end: 200 })).rejects.toThrow(
      MediaStorageError,
    );
    await expect(openMediaByteRange(key, { start: 5, end: 4 })).rejects.toThrow(MediaStorageError);
    await expect(openMediaByteRange(key, { start: -1, end: 10 })).rejects.toThrow(MediaStorageError);
    await expect(openMediaByteRange(key, { start: 0.5, end: 10 })).rejects.toThrow(
      MediaStorageError,
    );
  });
});

describe("readMediaByteRange — bounded buffered slice", () => {
  it("returns exactly the requested bytes", async () => {
    const key = newKey();
    const body = payload(5000);
    await putMediaObject({ key, body, contentType: "video/mp4" });
    expect(await readMediaByteRange(key, { start: 10, end: 19 })).toEqual(body.subarray(10, 20));
  });

  it("returns null for a missing object", async () => {
    expect(await readMediaByteRange(newKey(), { start: 0, end: 1 })).toBeNull();
  });

  it("refuses a slice larger than the buffered cap rather than allocating it", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(1024), contentType: "video/mp4" });
    const error = await readMediaByteRange(key, {
      start: 0,
      end: MAX_MEDIA_BUFFERED_RANGE_BYTES,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MediaStorageError);
    expect((error as MediaStorageError).code).toBe("range_too_large");
  });
});

// ── Provider gate ────────────────────────────────────────────────────────────

describe("range reads fail closed on a non-local provider", () => {
  for (const provider of ["minio", "s3"] as const) {
    it(`refuses stat/open/read when the provider is ${provider}`, async () => {
      process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = provider;
      const key = newKey();

      await expect(statMediaObject(key)).rejects.toThrow(/local/i);
      await expect(openMediaByteRange(key)).rejects.toThrow(/local/i);
      await expect(readMediaByteRange(key, { start: 0, end: 1 })).rejects.toThrow(/local/i);

      const error = await openMediaByteRange(key).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MediaStorageError);
      expect((error as MediaStorageError).code).toBe("range_requires_local_provider");
    });
  }

  it("never silently downgrades a non-local provider to a whole-object read", async () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "s3";
    const key = newKey();
    // The seam itself still rejects — Phase 102 adds no fallback path.
    await expect(getMediaObject(key)).rejects.toThrow(/not yet implemented/i);
  });
});

// ── Wiring into the hardened read primitive ──────────────────────────────────

/** On-disk location of a key, built the way the SEAM builds it — not the way
 *  the reader does — so a divergence between the two shows up as a failure. */
function onDisk(key: string): string {
  return path.join(tempDir, ...key.split("/"));
}

describe("every read goes through the hardened primitive", () => {
  it("pins the ceiling to the upload cap rather than inventing a number", () => {
    expect(MEDIA_MAX_STORED_OBJECT_BYTES).toBe(MAX_MEDIA_UPLOAD_BYTES);
  });

  it("retains key_outside_storage_root in the vocabulary but no longer throws it", async () => {
    // Containment is now decided inside the primitive, which maps an escape to
    // the same "unavailable" outcome as a missing object so the two cannot be
    // told apart from outside. The code stays because operators read it in logs.
    expect(MEDIA_STORAGE_ERROR_CODES).toContain("key_outside_storage_root");
    const key = newKey();
    await putMediaObject({ key, body: payload(64), contentType: "video/mp4" });
    // A legitimate object still reads back, which proves the refusal path is not
    // simply refusing everything.
    expect(await statMediaObject(key)).toEqual({ sizeBytes: 64 });
  });

  it("refuses an object larger than the real ceiling, judged on its fstat size", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(1024), contentType: "video/mp4" });

    // Grown with ftruncate: instant, and the resulting `stat().size` is the real
    // thing the ceiling is applied to. No database column is involved anywhere.
    const target = onDisk(key);
    await fs.truncate(target, MEDIA_MAX_STORED_OBJECT_BYTES + 1);
    expect((await fs.stat(target)).size).toBe(MEDIA_MAX_STORED_OBJECT_BYTES + 1);

    expect(await statMediaObject(key)).toBeNull();
    expect(await openMediaByteRange(key)).toBeNull();
    expect(await readMediaByteRange(key, { start: 0, end: 15 })).toBeNull();
    expect(await getMediaObject(key)).toBeNull();
  });

  it("serves an object sitting exactly on the ceiling", async () => {
    const key = newKey();
    await putMediaObject({ key, body: payload(1024), contentType: "video/mp4" });
    await fs.truncate(onDisk(key), MEDIA_MAX_STORED_OBJECT_BYTES);
    expect(await statMediaObject(key)).toEqual({ sizeBytes: MEDIA_MAX_STORED_OBJECT_BYTES });
  });

  it("refuses a DIRECTORY sitting where the object should be", async () => {
    const key = newKey();
    await fs.mkdir(onDisk(key), { recursive: true });
    expect(await statMediaObject(key)).toBeNull();
    expect(await openMediaByteRange(key)).toBeNull();
    expect(await readMediaByteRange(key, { start: 0, end: 1 })).toBeNull();
    expect(await getMediaObject(key)).toBeNull();
  });

  it("returns null — never a path-bearing throw — when an object cannot be served", async () => {
    const key = newKey();
    const caught = await openMediaByteRange(key).catch((error: unknown) => error);
    expect(caught).toBeNull();
  });
});

// Asserted OUTSIDE the `skipIf` below — a guard placed INSIDE a skipped
// `describe` never runs when skipped, so a Linux CI runner that silently lost
// symlink capability would report the suite green instead of failing red.
it("declares the symlink capability explicitly and never skips silently", () => {
  if (SYMLINK.supported) {
    expect(SYMLINK.skipReason).toBeNull();
    return;
  }
  expect(SYMLINK.skipReason).toMatch(/^SKIPPED: real symlinks cannot be created/);
  expect(SYMLINK.skipReason).toContain(os.platform());
  expect(SYMLINK.skipReason).toMatch(/MUST run on/);
  // A Linux host that cannot create a symlink is a broken CI runner, not a
  // reason to skip the suite below. Fail loudly rather than report green.
  expect(process.platform).not.toBe("linux");
});

describe.skipIf(!SYMLINK.supported)("symlinked objects are refused by the storage layer", () => {
  it("refuses a key whose object is a symlink pointing outside the storage root", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-media-outside-"));
    try {
      const secret = path.join(outside, "secret.bin");
      await fs.writeFile(secret, "TOP SECRET");

      const key = newKey();
      const target = onDisk(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.symlink(secret, target, "file");

      expect(await statMediaObject(key)).toBeNull();
      expect(await openMediaByteRange(key)).toBeNull();
      expect(await readMediaByteRange(key, { start: 0, end: 1 })).toBeNull();
      expect(await getMediaObject(key)).toBeNull();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses a key reached through a symlinked INTERMEDIATE directory", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-media-outside-"));
    try {
      const key = newKey();
      const segments = key.split("/");
      const fileName = segments[segments.length - 1] as string;
      await fs.writeFile(path.join(outside, fileName), "TOP SECRET");

      // Replace the <assetId> directory with a link to somewhere else entirely.
      const assetDir = path.join(tempDir, ...segments.slice(0, segments.length - 1));
      await fs.mkdir(path.dirname(assetDir), { recursive: true });
      await fs.symlink(outside, assetDir, "dir");

      expect(await statMediaObject(key)).toBeNull();
      expect(await openMediaByteRange(key)).toBeNull();
      expect(await getMediaObject(key)).toBeNull();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses a symlink even when it points INSIDE the storage root", async () => {
    const real = newKey();
    await putMediaObject({ key: real, body: payload(32), contentType: "video/mp4" });

    const alias = newKey();
    const aliasPath = onDisk(alias);
    await fs.mkdir(path.dirname(aliasPath), { recursive: true });
    await fs.symlink(onDisk(real), aliasPath, "file");

    expect(await statMediaObject(alias)).toBeNull();
    // ...and the real object is unaffected.
    expect(await statMediaObject(real)).toEqual({ sizeBytes: 32 });
  });
});

describe("streaming owns exactly one descriptor", () => {
  it("keeps the descriptor alive for the stream and releases it at the end", async () => {
    const key = newKey();
    const body = payload(20_000);
    await putMediaObject({ key, body, contentType: "video/mp4" });

    const opened = await openMediaByteRange(key, { start: 100, end: 199 });
    expect(opened).not.toBeNull();
    if (!opened) return;
    // Reading through proves the descriptor outlived the function that opened
    // it — the whole reason ownership is transferred rather than closed.
    expect(await collect(opened.stream)).toEqual(body.subarray(100, 200));
  });

  it("does not leak a descriptor when the requested range is unsatisfiable", async () => {
    if (!SECURE_READ_PLATFORM.supportsProcSelfFd) {
      // Counting open descriptors portably is not possible; on Linux — where CI
      // and production run — it is a directory listing.
      expect(SECURE_READ_PLATFORM.platform).not.toBe("linux");
      return;
    }
    const key = newKey();
    await putMediaObject({ key, body: payload(512), contentType: "video/mp4" });

    const countFds = (): number => fsSync.readdirSync("/proc/self/fd").length;
    await statMediaObject(key); // warm-up
    const before = countFds();

    for (let index = 0; index < 40; index += 1) {
      await statMediaObject(key);
      await expect(openMediaByteRange(key, { start: 0, end: 512 })).rejects.toThrow(
        MediaStorageError,
      );
      const stream = await openMediaByteRange(key, { start: 0, end: 31 });
      if (stream) await collect(stream.stream);
    }

    expect(countFds()).toBeLessThanOrEqual(before);
  });
});
