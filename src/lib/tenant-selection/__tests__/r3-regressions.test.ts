/**
 * PHASE 110-A1.0b R3 — the defects Codex found in R2, as failing tests written
 * BEFORE the fix.
 *
 * R3-1 is the one my own R2 "hard bound" claim was wrong about. The R2 handler
 * did `await req.text()` and THEN compared `Buffer.byteLength(raw)` against the
 * limit. That bounds what gets PARSED. It does not bound what gets READ: the
 * whole stream is pulled into memory first, so a 256 KB body is fully ingested
 * before the 4 KB refusal is written. Codex reproduced 256 pulls of 1024 bytes
 * — 262144 bytes consumed, `cancelled: false` — and the reproduction below is
 * the same measurement against the same handler.
 *
 * The request double here is deliberately NOT the string-returning double the
 * R2 file used. That double answered `text()` with a whole string in one shot,
 * which is precisely why an R2 test could assert "bounded" while the handler
 * ingested without limit: the double could not express streaming at all. These
 * cases drive a real `Request` over a real `ReadableStream` and count the pulls
 * the handler actually causes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  userId: string | null;
  rows: Row[] | null;
  membershipThrows?: boolean;
  db: boolean;
  organizations: Record<string, { id: string; slug: string } | null>;
  findManyCalls: number;
}

let h: Harness;
let trustedOrigin = true;

function reset(over: Partial<Harness> = {}): void {
  h = {
    userId: "user_1",
    rows: [],
    db: true,
    organizations: {
      org_a: { id: "org_a", slug: "alpha" },
      org_b: { id: "org_b", slug: "beta" },
    },
    findManyCalls: 0,
    ...over,
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.db
      ? {
          organizationMember: {
            findMany: async () => {
              h.findManyCalls += 1;
              if (h.membershipThrows) throw new Error("membership store down");
              return h.rows;
            },
          },
          organization: {
            findUnique: async (a: { where: { id: string } }) => h.organizations[a.where.id] ?? null,
          },
        }
      : null,
}));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("@/lib/org/context", () => ({ getUserIdFromRequest: async () => h.userId }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => (h.userId ? { id: h.userId } : null),
}));
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  /*
   * The REAL bounded reader, with only the origin check replaced.
   *
   * `readBoundedTextBody` / `readBoundedJson` are the repository's own body
   * primitives and are the subject of these tests — mocking them away would
   * leave the ingestion bound asserted against a double, which is the mistake
   * this file exists to correct. Only `requireTrustedOrigin` is substituted, so
   * a case can reach (or deliberately not reach) the body at all.
   */
  const actual = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return {
    ...actual,
    requireTrustedOrigin: () => ({ ok: trustedOrigin, reason: "allowed" }),
    resolveClientIp: () => "127.0.0.1",
  };
});

const { PUT } = await import("@/app/api/tenant/context/route");

const ACTIVE_A: Row = { organizationId: "org_a", role: "OWNER", status: "ACTIVE" };
const ACTIVE_B: Row = { organizationId: "org_b", role: "MEMBER", status: "ACTIVE" };

/* ── A request whose INGESTION is measurable ─────────────────────────────── */

interface StreamStats {
  /** How many chunks the handler actually caused to be produced. */
  pulls: number;
  /** How many bytes those chunks carried. */
  bytes: number;
  /** Whether the handler released the stream instead of draining it. */
  cancelled: boolean;
}

interface StreamOptions {
  chunks: Uint8Array[];
  /** Declare a Content-Length, truthfully or not. */
  contentLength?: string;
  /** Throw part-way through, modelling a transport interruption. */
  failAfter?: number;
  /** Make `cancel()` itself throw, modelling a reader that will not release. */
  cancelThrows?: boolean;
}

function streamingRequest(opts: StreamOptions): { req: never; stats: () => StreamStats } {
  const stats: StreamStats = { pulls: 0, bytes: 0, cancelled: false };
  let index = 0;

  const source = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (opts.failAfter !== undefined && index === opts.failAfter) {
          controller.error(new Error("upstream connection reset: 10.4.2.19:5432 hermes_ci"));
          return;
        }
        if (index >= opts.chunks.length) {
          controller.close();
          return;
        }
        const chunk = opts.chunks[index] as Uint8Array;
        index += 1;
        stats.pulls += 1;
        stats.bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        stats.cancelled = true;
        if (opts.cancelThrows) throw new Error("reader would not release");
      },
    },
    /*
     * highWaterMark 0, and it is not a detail.
     *
     * A `ReadableStream` with the DEFAULT strategy pulls one chunk the moment
     * it is constructed, to fill its internal queue. Measured directly on this
     * runtime: default -> 1 pull with nothing ever read from it, highWaterMark
     * 0 -> 0 pulls. With the default, the three "reads NOTHING" cases below
     * failed at `pulls = 1` even for a cross-origin request the handler refuses
     * before touching the body — an artifact of the harness being reported as
     * handler behaviour. At 0, a pull happens only because something read.
     */
    { highWaterMark: 0 },
  );

  const headers = new Headers({
    origin: "https://www.hermesnovin.com",
    "content-type": "application/json",
  });
  if (opts.contentLength !== undefined) headers.set("content-length", opts.contentLength);

  const native = new Request("https://www.hermesnovin.com/api/tenant/context", {
    method: "PUT",
    body: source,
    headers,
    // Node requires this for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const req = {
    headers: native.headers,
    get body() {
      return native.body;
    },
    text: () => native.text(),
    json: () => native.json(),
    cookies: { get: () => undefined },
  };

  return { req: req as never, stats: () => stats };
}

const KB = 1024;
const filler = (n: number, byte = 0x61) => new Uint8Array(n).fill(byte);
const utf8 = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  reset({ rows: [ACTIVE_A, ACTIVE_B] });
  trustedOrigin = true;
});

/* ── R3-1 ────────────────────────────────────────────────────────────────── */

describe("R3-1 — the body limit must bound INGESTION, not only parsing", () => {
  /*
   * R2 MEASURED (Codex, and reproduced here before the fix):
   *   {"status":422,"pulls":256,"bytes":262144,"cancelled":false}
   * All 256 chunks were consumed before the refusal was written. The status was
   * already correct; what was wrong was everything that happened before it.
   */
  it("stops reading a 256 KB chunked body instead of draining it", async () => {
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 256 }, () => filler(KB)),
    });

    const res = await PUT(req);
    const after = stats();

    expect(res.status).toBe(422);
    expect(
      after.bytes,
      "R2 ingested all 262144 bytes before refusing; the ceiling is 4096",
    ).toBeLessThanOrEqual(8 * KB);
    expect(after.pulls, "R2 pulled 256 chunks").toBeLessThanOrEqual(8);
    expect(after.cancelled, "R2 left the stream to drain; it must be released").toBe(true);
  });

  it("refuses a body with NO Content-Length at all — the bound cannot depend on a header", async () => {
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
    });
    // A streaming body sends no content-length, which is the point.
    expect(req["headers" as never]["get" as never]).toBeTypeOf("function");

    const res = await PUT(req);
    expect(res.status).toBe(422);
    expect(stats().bytes).toBeLessThanOrEqual(8 * KB);
  });

  it("refuses when Content-Length LIES and claims the body is small", async () => {
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
      contentLength: "12",
    });

    const res = await PUT(req);
    expect(res.status).toBe(422);
    expect(
      stats().bytes,
      "a declared length is a claim by the caller, never the bound",
    ).toBeLessThanOrEqual(8 * KB);
  });

  it("refuses a single first chunk that is already over the limit, without buffering it", async () => {
    const { req, stats } = streamingRequest({ chunks: [filler(200 * KB)] });

    const res = await PUT(req);
    const after = stats();

    expect(res.status).toBe(422);
    expect(after.pulls, "one chunk is enough to know").toBe(1);
    expect(after.cancelled).toBe(true);
  });

  it("accepts a body EXACTLY at the limit — the ceiling must not be off by one", async () => {
    const head = '{"organizationId":"org_a","pad":"';
    const tail = '"}';
    const pad = "a".repeat(4096 - head.length - tail.length);
    const body = utf8(`${head}${pad}${tail}`);
    expect(body.byteLength).toBe(4096);

    const { req } = streamingRequest({ chunks: [body] });
    const res = await PUT(req);

    expect(res.status, "4096 bytes is within a 4096-byte ceiling").toBe(200);
    await expect(res.json()).resolves.toMatchObject({ organizationId: "org_a" });
  });

  it("measures BYTES, not characters, for a multibyte body", async () => {
    /*
     * 2200 characters of `é` is 4400 bytes. A character-counted bound would
     * admit this; a byte-counted one refuses it. The R2 code happened to use
     * `Buffer.byteLength`, so this case guards the property rather than
     * reporting a defect — it must survive the move to the streaming reader.
     */
    const head = '{"organizationId":"org_a","pad":"';
    const body = utf8(`${head}${"é".repeat(2200)}"}`);
    expect(body.length).toBeGreaterThan(4096);

    const { req } = streamingRequest({ chunks: [body] });
    expect((await PUT(req)).status).toBe(422);
  });

  it("survives an interrupted stream without leaking the transport error", async () => {
    const { req } = streamingRequest({
      chunks: [filler(64), filler(64)],
      failAfter: 1,
    });

    const res = await PUT(req);
    expect(res.status).toBe(422);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("10.4.2.19");
    expect(text).not.toContain("hermes_ci");
    expect(text).not.toContain("connection reset");
  });

  it("survives a reader that refuses to release, and still refuses the request", async () => {
    const { req } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
      cancelThrows: true,
    });

    const res = await PUT(req);
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).not.toContain("would not release");
  });

  it("still reads NOTHING from an unauthenticated caller", async () => {
    reset({ userId: null });
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
    });

    const res = await PUT(req);
    expect(res.status).toBe(401);
    expect(stats().pulls, "identity is decided before the body exists").toBe(0);
  });

  it("still reads NOTHING from an untrusted origin", async () => {
    trustedOrigin = false;
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
    });

    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(stats().pulls).toBe(0);
    expect(h.findManyCalls, "no membership lookup for a cross-origin caller").toBe(0);
  });

  it("still reads NOTHING when the membership store is down", async () => {
    reset({ membershipThrows: true });
    const { req, stats } = streamingRequest({
      chunks: Array.from({ length: 64 }, () => filler(KB)),
    });

    const res = await PUT(req);
    expect(res.status).toBe(503);
    expect(stats().pulls).toBe(0);
  });

  it("a valid ordinary selection still works over a real stream", async () => {
    const { req } = streamingRequest({
      chunks: [utf8(JSON.stringify({ organizationId: "org_b" }))],
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      organizationId: "org_b",
      organizationSlug: "beta",
    });
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("resolves the caller exactly once even on the streaming path", async () => {
    const { req } = streamingRequest({
      chunks: [utf8(JSON.stringify({ organizationId: "org_a" }))],
    });

    await PUT(req);
    expect(h.findManyCalls, "two resolutions are two chances to disagree").toBe(1);
  });

  it("refuses a foreign candidate carried in a well-formed small body", async () => {
    const { req } = streamingRequest({
      chunks: [utf8(JSON.stringify({ organizationId: "org_zzz" }))],
    });

    const res = await PUT(req);
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      state: "REFUSED",
      code: "ORGANIZATION_SELECTION_INVALID",
    });
  });

  it("refuses malformed JSON that is within the byte ceiling", async () => {
    const { req } = streamingRequest({ chunks: [utf8('{"organizationId":')] });

    const res = await PUT(req);
    expect(res.status).toBe(422);
  });

  void ACTIVE_B;
});
