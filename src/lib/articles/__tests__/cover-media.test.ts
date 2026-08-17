import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sniffImageMime,
  isManagedCoverUrl,
  mintCoverFilename,
  coverUrlForFilename,
  ARTICLE_COVER_MAX_BYTES,
} from "../media";

/**
 * Article cover media — upload validation and storage-reference safety.
 *
 * The security claim being locked: an article's cover can only ever point at a
 * raster image this deployment wrote itself. Content decides the type (not the
 * declared MIME, not the filename), and the article write path accepts only a
 * URL the upload route minted.
 */

// ── Fixtures: real magic-byte prefixes ───────────────────────────────────────

const bytes = (...b: number[]) => new Uint8Array(b);
const pad   = (head: number[], len = 32) =>
  new Uint8Array([...head, ...new Array(Math.max(0, len - head.length)).fill(0)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG  = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

/** "<svg xmlns=" — the payload SVG rejection actually has to stop. */
const SVG  = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><script>alert(1)</script>");
const GIF  = new TextEncoder().encode("GIF89a");

describe("sniffImageMime — content decides the type", () => {
  it("accepts the three supported raster formats", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
  });

  it("rejects SVG — including when it is renamed and declared as a PNG", () => {
    expect(sniffImageMime(SVG)).toBeNull();
  });

  it.each([
    ["HTML document",  HTML],
    ["GIF",            GIF],
    ["empty buffer",   bytes()],
    ["truncated JPEG", bytes(0xff, 0xd8)],
    ["truncated PNG",  bytes(0x89, 0x50, 0x4e)],
  ])("rejects %s", (_label, buf) => {
    expect(sniffImageMime(buf)).toBeNull();
  });

  it("rejects a RIFF container that is not WebP (e.g. a WAV)", () => {
    const wav = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageMime(wav)).toBeNull();
  });
});

describe("mintCoverFilename / isManagedCoverUrl", () => {
  it("mints an opaque 32-hex name with an extension matching the sniffed type", () => {
    expect(mintCoverFilename("image/jpeg")).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(mintCoverFilename("image/png")).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(mintCoverFilename("image/webp")).toMatch(/^[0-9a-f]{32}\.webp$/);
  });

  it("never reuses a name", () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintCoverFilename("image/png")));
    expect(seen.size).toBe(200);
  });

  it("accepts a URL it minted", () => {
    const url = coverUrlForFilename(mintCoverFilename("image/webp"));
    expect(isManagedCoverUrl(url)).toBe(true);
  });

  it.each([
    ["remote http URL",        "http://evil.example/x.png"],
    ["remote https URL",       "https://evil.example/x.png"],
    ["protocol-relative",      "//evil.example/x.png"],
    ["data URL",               "data:image/png;base64,iVBORw0KGgo="],
    ["javascript URL",         "javascript:alert(1)"],
    ["author avatar path",     "/uploads/authors/" + "a".repeat(32) + ".jpg"],
    ["traversal",              "/uploads/articles/../../etc/passwd"],
    ["traversal in name",      "/uploads/articles/..%2F..%2Fetc"],
    ["wrong extension",        "/uploads/articles/" + "a".repeat(32) + ".svg"],
    ["double extension",       "/uploads/articles/" + "a".repeat(32) + ".png.svg"],
    ["short name",             "/uploads/articles/abc.png"],
    ["uppercase hex",          "/uploads/articles/" + "A".repeat(32) + ".png"],
    ["nested path",            "/uploads/articles/sub/" + "a".repeat(32) + ".png"],
    ["empty",                  ""],
  ])("rejects %s", (_label, url) => {
    expect(isManagedCoverUrl(url)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isManagedCoverUrl(null)).toBe(false);
    expect(isManagedCoverUrl(undefined)).toBe(false);
  });
});

// ── Upload route ─────────────────────────────────────────────────────────────

let currentUser: { id: string; role: string } | null = null;
let rateLimitOk = true;
const written: { name: string; size: number }[] = [];

async function loadRoute() {
  vi.resetModules();
  written.length = 0;
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => currentUser }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => rateLimitOk,
    retryAfter: () => 60,
  }));
  vi.doMock("fs/promises", () => ({
    writeFile: async (p: string, data: Uint8Array) => {
      written.push({ name: String(p), size: data.byteLength });
    },
    mkdir:  async () => undefined,
    unlink: async () => undefined,
  }));
  const mod = await import("@/app/api/articles/cover/route");
  return mod.POST;
}

function uploadReq(file: Blob, filename = "photo.png"): Request {
  const fd = new FormData();
  fd.append("cover", file, filename);
  return new Request("http://localhost/api/articles/cover", { method: "POST", body: fd });
}

const blob = (data: Uint8Array, type: string) => new Blob([data], { type });

beforeEach(() => { currentUser = { id: "u-1", role: "customer" }; rateLimitOk = true; vi.resetModules(); });
afterEach(() => {
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/auth/rate-limiter");
  vi.doUnmock("fs/promises");
});

describe("POST /api/articles/cover", () => {
  it("rejects an unauthenticated upload with 401 and writes nothing", async () => {
    currentUser = null;
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(PNG, "image/png")));
    expect(res.status).toBe(401);
    expect(written).toHaveLength(0);
  });

  it("accepts a valid PNG from an authenticated author and returns a managed URL", async () => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(PNG, "image/png")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(isManagedCoverUrl(body.url)).toBe(true);
    expect(written).toHaveLength(1);
  });

  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
  ])("accepts a valid %s", async (_l, data, type) => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(data, type)));
    expect(res.status).toBe(200);
  });

  it("rejects an SVG even when it is named .png and declared as image/png", async () => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(SVG, "image/png"), "innocent.png"));
    expect(res.status).toBe(415);
    expect(written).toHaveLength(0);
  });

  it("rejects an HTML payload declared as an image", async () => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(HTML, "image/jpeg"), "x.jpg"));
    expect(res.status).toBe(415);
    expect(written).toHaveLength(0);
  });

  it("rejects an oversized file with 413 before writing", async () => {
    const POST = await loadRoute();
    const big = new Uint8Array(ARTICLE_COVER_MAX_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await POST(uploadReq(blob(big, "image/png")));
    expect(res.status).toBe(413);
    expect(written).toHaveLength(0);
  });

  it("rejects an empty file", async () => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(new Uint8Array(0), "image/png")));
    expect(res.status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("rejects a request with no file part", async () => {
    const POST = await loadRoute();
    const res = await POST(new Request("http://localhost/api/articles/cover", {
      method: "POST", body: new FormData(),
    }));
    expect(res.status).toBe(400);
  });

  it("applies the rate limit", async () => {
    rateLimitOk = false;
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(PNG, "image/png")));
    expect(res.status).toBe(429);
    expect(written).toHaveLength(0);
  });

  it("neutralises a hostile filename — the stored name is minted, never the uploader's", async () => {
    const POST = await loadRoute();
    const res = await POST(uploadReq(blob(PNG, "image/png"), "../../../etc/passwd.png"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(isManagedCoverUrl(url)).toBe(true);
    expect(url).not.toContain("passwd");
    expect(written[0].name).not.toContain("passwd");
    expect(written[0].name).not.toContain("..");
  });
});

// ── Article write path ───────────────────────────────────────────────────────

describe("POST /api/articles/submit — cover reference validation", () => {
  const store: Record<string, unknown>[] = [];

  async function loadSubmit() {
    vi.resetModules();
    store.length = 0;
    vi.doMock("@/lib/auth/session", () => ({
      getCurrentUser: async () => ({ id: "u-1", name: "A", email: "a@t.io", role: "customer" }),
    }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        articleAuthorProfile: {
          findUnique: async () => ({ id: "prof-1" }),
          create: async () => ({ id: "prof-1" }),
        },
        article: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            store.push(data);
            return { id: "art-1", slug: String(data.slug), status: data.status };
          },
        },
      }),
    }));
    const mod = await import("@/app/api/articles/submit/route");
    return mod.POST;
  }

  const submitReq = (body: Record<string, unknown>) =>
    new Request("http://localhost/api/articles/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  afterEach(() => { vi.doUnmock("@/lib/auth/session"); vi.doUnmock("@/lib/db/prisma"); });

  it("persists a cover URL that the upload route minted", async () => {
    const POST = await loadSubmit();
    const url = coverUrlForFilename(mintCoverFilename("image/jpeg"));
    const res = await POST(submitReq({ title: "T", content: "C", coverImageUrl: url }));
    expect(res.status).toBe(200);
    expect(store[0].coverImageUrl).toBe(url);
  });

  it("stores null when no cover was supplied", async () => {
    const POST = await loadSubmit();
    const res = await POST(submitReq({ title: "T", content: "C" }));
    expect(res.status).toBe(200);
    expect(store[0].coverImageUrl).toBeNull();
  });

  it.each([
    ["remote image",      "https://evil.example/tracker.png"],
    ["protocol-relative", "//evil.example/x.png"],
    ["data URL",          "data:image/png;base64,iVBORw0KGgo="],
    ["javascript URL",    "javascript:alert(1)"],
    ["traversal",         "/uploads/articles/../../../etc/passwd"],
    ["avatar path",       "/uploads/authors/" + "a".repeat(32) + ".jpg"],
    ["svg extension",     "/uploads/articles/" + "a".repeat(32) + ".svg"],
  ])("refuses %s with 422 and writes no article", async (_l, url) => {
    const POST = await loadSubmit();
    const res = await POST(submitReq({ title: "T", content: "C", coverImageUrl: url }));
    expect(res.status).toBe(422);
    expect(store).toHaveLength(0);
  });
});
