/**
 * Phase 86C4B2B1D-SECURITY-7 — public-demo abuse protection + Brain origin.
 *
 * Proves, without real Redis or network, that:
 *   - GET/POST /api/copilot/demo are IP-keyed rate limited (separate buckets,
 *     POST stricter), returning 429 + Retry-After + no-store, and a limited
 *     request never runs the deterministic pipeline;
 *   - POST /api/copilot/demo enforces Content-Type / body-size / JSON /
 *     question-length with stable no-store errors;
 *   - POST /api/brain validates same-origin AFTER auth+authz and BEFORE any
 *     body parse / pipeline / write, rejecting foreign, null, missing, and
 *     substring-spoof origins while accepting the production and dev origins.
 *
 * The rate limiter is the existing `@/lib/auth/rate-limiter`; with no
 * REDIS_URL it uses the in-process fixed/sliding-window fallback, which is
 * fully deterministic within a test (all calls land in one window). Each test
 * resets modules so the in-process counters start clean.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";
import { isAllowedOrigin, readBoundedTextBody } from "@/lib/security/request-guards";

const MAX_BODY_BYTES = 16 * 1024;

const DEMO = "@/app/api/copilot/demo/route";
const BRAIN = "@/app/api/brain/route";

// A known (non-unknown) drives/vendor question — reaches a full 200 analysis.
const KNOWN_QUESTION = "ABB ACS580 fault 2310 during acceleration";
const PROD_ORIGIN = "https://hermesnovin.com";

const ENV_KEYS = ["REDIS_URL", "HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesAnalysisRows = [];
  (globalThis as Record<string, unknown>).__hermesUnknownRows = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
  vi.restoreAllMocks();
});

function demoGet(ip: string): Request {
  return new Request("http://localhost/api/copilot/demo?n=5", {
    headers: { "x-real-ip": ip },
  });
}

function demoPost(
  ip: string,
  body: unknown,
  opts: { contentType?: string | null; contentLength?: string } = {},
): Request {
  const headers: Record<string, string> = { "x-real-ip": ip };
  if (opts.contentType !== null) headers["content-type"] = opts.contentType ?? "application/json";
  if (opts.contentLength) headers["content-length"] = opts.contentLength;
  return new Request("http://localhost/api/copilot/demo", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface StreamTrack {
  pulls: number;
  cancelled: boolean;
}

/**
 * A demo POST whose body is a real ReadableStream (undici does not auto-set
 * Content-Length for a stream body), so the route must read it through the
 * bounded reader. `track` records how many chunks were pulled and whether the
 * stream was cancelled, proving the reader stops early.
 */
function demoStreamPost(
  ip: string,
  chunks: Uint8Array[],
  track: StreamTrack,
  opts: { contentType?: string | null; contentLength?: string } = {},
): Request {
  const headers: Record<string, string> = { "x-real-ip": ip };
  if (opts.contentType !== null) headers["content-type"] = opts.contentType ?? "application/json";
  if (opts.contentLength) headers["content-length"] = opts.contentLength;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        track.pulls += 1;
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
      cancel() {
        track.cancelled = true;
      },
    },
    // highWaterMark 0 → no eager pull on construction; `pull` fires ONLY when
    // the route actually reads the body, so `pulls === 0` proves it did not.
    { highWaterMark: 0 },
  );
  return new Request("http://localhost/api/copilot/demo", {
    method: "POST",
    headers,
    body: stream,
    // Required by undici/Node for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function bytes(n: number, fill = 0x41): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function brainPost(origin: string | null, contentType: string | null = "application/json"): Request {
  const headers: Record<string, string> = {};
  if (origin !== null) headers["origin"] = origin;
  if (contentType !== null) headers["content-type"] = contentType;
  return new Request("http://localhost/api/brain", {
    method: "POST",
    headers,
    body: JSON.stringify({ question: KNOWN_QUESTION, locale: "en" }),
  });
}

// Minimal unknown-path PipelineResult — lets the demo POST return early
// (unknown branch) without needing reasoning/retrieval mocks.
const UNKNOWN_PIPE = {
  unknown: true,
  confidence: 0.1,
  safety: "general",
  vendors: [] as string[],
  steps: [] as unknown[],
  domains: [] as unknown[],
  libraries: [] as string[],
  caseMatches: [] as unknown[],
  evidenceScore: 0,
  riskLevel: "unknown",
};

// ── A. Demo GET rate limiting ────────────────────────────────────────────────

describe("SECURITY-7 A — GET /api/copilot/demo rate limiting", () => {
  it("allows up to the limit (60/min) then returns 429 with Retry-After + no-store", async () => {
    const { GET } = await import(DEMO);
    for (let i = 0; i < 60; i++) {
      const res = await GET(demoGet("10.0.0.1"));
      expect(res.status, `call ${i + 1}`).toBe(200);
    }
    const blocked = await GET(demoGet("10.0.0.1"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(0);
    const body = await blocked.json();
    expect(body).toEqual({ error: "rate limited" });
  });

  it("keys per client IP — a different IP is a fresh bucket", async () => {
    const { GET } = await import(DEMO);
    for (let i = 0; i < 60; i++) await GET(demoGet("10.0.0.2"));
    expect((await GET(demoGet("10.0.0.2"))).status).toBe(429);
    expect((await GET(demoGet("10.0.0.3"))).status).toBe(200);
  });

  it("does NOT trust a client-forged CF-Connecting-IP (no per-request bucket rotation)", async () => {
    const { GET } = await import(DEMO);
    // Same real proxy IP, but a rotating spoofed CF header — must NOT escape
    // the bucket (CF-Connecting-IP is untrusted in this nginx-only topology).
    for (let i = 0; i < 60; i++) {
      const req = new Request("http://localhost/api/copilot/demo", {
        headers: { "x-real-ip": "10.0.0.9", "cf-connecting-ip": `1.2.3.${i}` },
      });
      expect((await GET(req)).status).toBe(200);
    }
    const spoofed = new Request("http://localhost/api/copilot/demo", {
      headers: { "x-real-ip": "10.0.0.9", "cf-connecting-ip": "9.9.9.9" },
    });
    expect((await GET(spoofed)).status).toBe(429);
  });
});

// ── B. Demo POST rate limiting ───────────────────────────────────────────────

describe("SECURITY-7 B — POST /api/copilot/demo rate limiting", () => {
  it("allows up to the limit (12/min) then 429; the limited request never runs the pipeline", async () => {
    const runPipeline = vi.fn(() => UNKNOWN_PIPE);
    vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
    const { POST } = await import(DEMO);

    for (let i = 0; i < 12; i++) {
      const res = await POST(demoPost("10.1.0.1", { question: KNOWN_QUESTION }));
      expect(res.status, `call ${i + 1}`).toBe(200);
    }
    const blocked = await POST(demoPost("10.1.0.1", { question: KNOWN_QUESTION }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(runPipeline).toHaveBeenCalledTimes(12); // the 13th never reached it
    vi.doUnmock("@/lib/industrial/pipeline");
  });

  it("malformed JSON is still counted by the limiter", async () => {
    const { POST } = await import(DEMO);
    for (let i = 0; i < 12; i++) {
      const res = await POST(demoPost("10.1.0.2", "{ not json"));
      expect(res.status).toBe(400); // malformed, but consumed a token
    }
    expect((await POST(demoPost("10.1.0.2", "{ not json"))).status).toBe(429);
  });

  it("uses a separate bucket from GET (POST exhaustion leaves GET usable)", async () => {
    const { GET, POST } = await import(DEMO);
    for (let i = 0; i < 12; i++) await POST(demoPost("10.1.0.3", { question: KNOWN_QUESTION }));
    expect((await POST(demoPost("10.1.0.3", { question: KNOWN_QUESTION }))).status).toBe(429);
    expect((await GET(demoGet("10.1.0.3"))).status).toBe(200);
  });
});

// ── C. Demo POST request validation ──────────────────────────────────────────

describe("SECURITY-7 C — POST /api/copilot/demo request validation", () => {
  it("rejects a non-JSON Content-Type with 415 + no-store", async () => {
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.2.0.1", "x=1", { contentType: "text/plain" }));
    expect(res.status).toBe(415);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a missing Content-Type with 415", async () => {
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.2.0.2", "{}", { contentType: null }));
    expect(res.status).toBe(415);
  });

  it("returns 400 for invalid JSON and for a too-short question, both no-store", async () => {
    const { POST } = await import(DEMO);
    const bad = await POST(demoPost("10.2.0.4", "{ nope"));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    const short = await POST(demoPost("10.2.0.5", { question: "x" }));
    expect(short.status).toBe(400);
    expect(short.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts a maximum-length question (200 within limit)", async () => {
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.2.0.6", { question: "A".repeat(2000) }));
    expect(res.status).toBe(200);
  });
});

// ── D. Brain authorization order (denials skip body/pipeline/writes) ─────────

describe("SECURITY-7 D — POST /api/brain authorization precedes everything", () => {
  it("anonymous → 401 with no pipeline, no repository write", async () => {
    const runPipeline = vi.fn();
    const createSpy = vi.fn(async () => ({}));
    process.env.HERMES_STORAGE_MODE = "database";
    vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
    vi.doMock("@/lib/storage/analysis-repository", () => ({
      analysisRepository: () => ({ list: vi.fn(async () => []), create: createSpy }),
    }));
    mockNoUser();
    const { POST } = await import(BRAIN);
    const res = await POST(brainPost(PROD_ORIGIN));
    expect(res.status).toBe(401);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/industrial/pipeline");
    vi.doUnmock("@/lib/storage/analysis-repository");
  });

  it("authenticated non-authoring → 403 with no pipeline, no write", async () => {
    const runPipeline = vi.fn();
    vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
    mockViewer();
    const { POST } = await import(BRAIN);
    const res = await POST(brainPost(PROD_ORIGIN));
    expect(res.status).toBe(403);
    expect(runPipeline).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/industrial/pipeline");
  });
});

// ── E. Brain Origin validation ───────────────────────────────────────────────

describe("SECURITY-7 E — POST /api/brain same-origin validation", () => {
  it("authoring + valid production origin reaches execution (200)", async () => {
    mockEngineer();
    const { POST } = await import(BRAIN);
    const res = await POST(brainPost(PROD_ORIGIN));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("authoring + www and localhost dev origins are accepted", async () => {
    for (const origin of ["https://www.hermesnovin.com", "http://localhost:3000"]) {
      vi.resetModules();
      mockEngineer();
      const { POST } = await import(BRAIN);
      const res = await POST(brainPost(origin));
      expect(res.status, origin).toBe(200);
    }
  });

  it("authoring + foreign / null / missing / spoof origins → 403 without body parse, pipeline, or write", async () => {
    const foreignOrigins: (string | null)[] = [
      "https://attacker.example",
      "https://www.hermesnovin.com.attacker.example",
      "https://attacker.example/?www.hermesnovin.com",
      "http://www.hermesnovin.com", // http downgrade rejected (prod is https)
      "null",
      null, // missing Origin header
    ];
    for (const origin of foreignOrigins) {
      vi.resetModules();
      const runPipeline = vi.fn();
      const createSpy = vi.fn(async () => ({}));
      process.env.HERMES_STORAGE_MODE = "database";
      vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
      vi.doMock("@/lib/storage/analysis-repository", () => ({
        analysisRepository: () => ({ list: vi.fn(async () => []), create: createSpy }),
      }));
      mockEngineer();
      const { POST } = await import(BRAIN);
      const res = await POST(brainPost(origin));
      expect(res.status, String(origin)).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(runPipeline, String(origin)).not.toHaveBeenCalled();
      expect(createSpy, String(origin)).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/industrial/pipeline");
      vi.doUnmock("@/lib/storage/analysis-repository");
    }
  });

  it("authoring + non-JSON Content-Type (valid origin) → 415 before body/pipeline", async () => {
    const runPipeline = vi.fn();
    vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
    mockEngineer();
    const { POST } = await import(BRAIN);
    const res = await POST(brainPost(PROD_ORIGIN, "text/plain"));
    expect(res.status).toBe(415);
    expect(runPipeline).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/industrial/pipeline");
  });
});

// ── F. Regression: SECURITY-6 boundary + public demo stay intact ─────────────

describe("SECURITY-7 F — prior boundaries remain intact", () => {
  it("GET /api/brain stays authoring-only (401 anonymous)", async () => {
    mockNoUser();
    const { GET } = await import(BRAIN);
    const res = await GET(new Request("http://localhost/api/brain?n=5"));
    expect(res.status).toBe(401);
  });

  it("public GET /api/copilot/demo stays anonymous (200 within limit)", async () => {
    mockNoUser();
    const { GET } = await import(DEMO);
    const res = await GET(demoGet("10.9.0.1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("stats");
  });

  it("public POST /api/copilot/demo stays anonymous (200 within limit)", async () => {
    mockNoUser();
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.9.0.2", { question: KNOWN_QUESTION }));
    expect(res.status).toBe(200);
    expect((await res.json()).demo).toBe(true);
  });
});

// ── G. Bounded body reader (SECURITY-7 amendment) ────────────────────────────

describe("SECURITY-7 G — POST /api/copilot/demo bounded body reader", () => {
  it("rejects a declared Content-Length over the limit WITHOUT reading the stream", async () => {
    const { POST } = await import(DEMO);
    const track: StreamTrack = { pulls: 0, cancelled: false };
    const res = await POST(
      demoStreamPost("10.3.0.1", [bytes(1024)], track, { contentLength: String(1_000_000) }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(track.pulls).toBe(0); // stream never touched
  });

  it("rejects a streamed oversized body with NO Content-Length — stops early and cancels", async () => {
    const { POST } = await import(DEMO);
    const track: StreamTrack = { pulls: 0, cancelled: false };
    // 24 x 1 KB = 24 KB streamed, no Content-Length header.
    const chunks = Array.from({ length: 24 }, () => bytes(1024));
    const res = await POST(demoStreamPost("10.3.0.2", chunks, track));
    expect(res.status).toBe(413);
    expect(track.cancelled).toBe(true);
    // Read stopped once past 16 KB — well before all 24 chunks were pulled.
    expect(track.pulls).toBeLessThan(chunks.length);
  });

  it("rejects a streamed oversized body that falsifies a small Content-Length", async () => {
    const { POST } = await import(DEMO);
    const track: StreamTrack = { pulls: 0, cancelled: false };
    const chunks = Array.from({ length: 24 }, () => bytes(1024));
    const res = await POST(
      demoStreamPost("10.3.0.3", chunks, track, { contentLength: "100" }),
    );
    expect(res.status).toBe(413);
    expect(track.cancelled).toBe(true);
  });

  it("measures multibyte UTF-8 in BYTES, not JS characters", async () => {
    // "€" is 1 JS char but 3 UTF-8 bytes. 6000 chars = 18000 bytes > 16384.
    const euros = "€".repeat(6000);
    const asBytes = new TextEncoder().encode(euros);
    expect(euros.length).toBeLessThan(MAX_BODY_BYTES); // char length would pass
    expect(asBytes.byteLength).toBeGreaterThan(MAX_BODY_BYTES); // byte length must fail
    const result = await readBoundedTextBody(
      new Request("http://localhost/x", { method: "POST", body: asBytes }),
      MAX_BODY_BYTES,
    );
    expect(result.status).toBe("too_large");
  });

  it("accepts exactly the limit and rejects one byte over (JSON-structured)", async () => {
    const { POST } = await import(DEMO);
    // Build a valid JSON object whose serialization is exactly MAX_BODY_BYTES.
    const wrapper = JSON.stringify({ question: "", locale: "en" });
    const pad = MAX_BODY_BYTES - wrapper.length; // ASCII → 1 byte each
    const atLimit = JSON.stringify({ question: "A".repeat(pad), locale: "en" });
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(MAX_BODY_BYTES);

    const okRead = await readBoundedTextBody(
      new Request("http://localhost/x", { method: "POST", body: atLimit }),
      MAX_BODY_BYTES,
    );
    expect(okRead.status).toBe("ok");

    const over = atLimit.slice(0, -2) + "AA" + '"}'; // one byte larger, still parseable shape
    const overRead = await readBoundedTextBody(
      new Request("http://localhost/x", { method: "POST", body: over }),
      MAX_BODY_BYTES,
    );
    expect(overRead.status).toBe("too_large");
  });

  it("an oversized streamed body never invokes the pipeline/reasoning/retrieval", async () => {
    const runPipeline = vi.fn();
    const runReasoning = vi.fn();
    const runRetrieval = vi.fn();
    vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
    vi.doMock("@/lib/industrial/reasoning", () => ({ runReasoning, summarizeEvidence: vi.fn() }));
    vi.doMock("@/lib/retrieval/retrieval-engine", () => ({ runRetrieval }));
    const { POST } = await import(DEMO);
    const track: StreamTrack = { pulls: 0, cancelled: false };
    const chunks = Array.from({ length: 24 }, () => bytes(1024));
    const res = await POST(demoStreamPost("10.3.0.4", chunks, track));
    expect(res.status).toBe(413);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(runReasoning).not.toHaveBeenCalled();
    expect(runRetrieval).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/industrial/pipeline");
    vi.doUnmock("@/lib/industrial/reasoning");
    vi.doUnmock("@/lib/retrieval/retrieval-engine");
  });

  it("a rate-limited request never accesses Request.body", async () => {
    const { POST } = await import(DEMO);
    // Exhaust the 12/min POST bucket for this IP.
    for (let i = 0; i < 12; i++) {
      await POST(demoPost("10.3.0.5", { question: KNOWN_QUESTION }));
    }
    const track: StreamTrack = { pulls: 0, cancelled: false };
    const res = await POST(demoStreamPost("10.3.0.5", [bytes(1024)], track));
    expect(res.status).toBe(429);
    expect(track.pulls).toBe(0); // limiter returned before touching the body
    expect(track.cancelled).toBe(false);
  });

  it("valid JSON within the limit follows the normal deterministic path (200)", async () => {
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.3.0.6", { question: KNOWN_QUESTION }));
    expect(res.status).toBe(200);
    expect((await res.json()).demo).toBe(true);
  });

  it("invalid JSON within the limit returns 400 (no-store)", async () => {
    const { POST } = await import(DEMO);
    const res = await POST(demoPost("10.3.0.7", "{ not valid"));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

// ── H. Origin config fail-closed (SECURITY-7 amendment, Part 5) ───────────────

describe("SECURITY-7 H — isAllowedOrigin fails closed on bad config", () => {
  const env = process.env as Record<string, string | undefined>;
  const NODE_ENV = env.NODE_ENV;
  afterEach(() => {
    if (NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = NODE_ENV;
    vi.doUnmock("@/lib/seo/config");
    vi.resetModules();
  });

  async function withConfig(baseUrl: unknown, nodeEnv: string) {
    vi.resetModules();
    env.NODE_ENV = nodeEnv;
    vi.doMock("@/lib/seo/config", () => ({ BASE_URL: baseUrl }));
    const mod = await import("@/lib/security/request-guards");
    return mod.isAllowedOrigin;
  }

  it("malformed BASE_URL in production rejects every origin (fail closed)", async () => {
    const allow = await withConfig("not-a-valid-url", "production");
    expect(allow("https://hermesnovin.com")).toBe(false);
    expect(allow("http://localhost:3000")).toBe(false);
    vi.doUnmock("@/lib/seo/config");
  });

  it("empty BASE_URL in production rejects every origin (fail closed)", async () => {
    const allow = await withConfig("", "production");
    expect(allow("https://hermesnovin.com")).toBe(false);
    vi.doUnmock("@/lib/seo/config");
  });

  it("does NOT accept any localhost origin in production", async () => {
    const allow = await withConfig("https://hermesnovin.com", "production");
    expect(allow("http://localhost:3000")).toBe(false);
    expect(allow("http://127.0.0.1:3000")).toBe(false);
    // The exact production HTTPS origin is accepted; the http downgrade is not.
    expect(allow("https://hermesnovin.com")).toBe(true);
    expect(allow("http://hermesnovin.com")).toBe(false);
    vi.doUnmock("@/lib/seo/config");
  });

  it("accepts localhost only outside production", async () => {
    const allow = await withConfig("https://hermesnovin.com", "development");
    expect(allow("http://localhost:3000")).toBe(true);
    vi.doUnmock("@/lib/seo/config");
  });
});
