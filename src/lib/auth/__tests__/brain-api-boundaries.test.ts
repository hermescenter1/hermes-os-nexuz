/**
 * Phase 86C4B2B1D-SECURITY-6 — Brain / public-Copilot security boundaries.
 *
 * Middleware excludes /api/**, so /api/brain must enforce its own boundary.
 * Before this phase both methods were anonymous: GET returned the global
 * analysis history (raw user questions, cross-user in database mode) and POST
 * ran the reasoning pipeline and persisted analysis/unknown records. The fix:
 *
 *   PRIVATE  /api/brain (GET, POST) → require the "authoring" capability
 *            (superadmin/admin/engineer). The AnalysisRecord model has no
 *            ownership field, so the global history cannot be user/org-scoped
 *            without a Prisma migration; Option C (engineering/authoring) is
 *            the narrowest existing policy. Authentication AND authorization
 *            are the FIRST operation — before body parse, repository read,
 *            pipeline execution, LLM/RAG, or any write. Anonymous -> 401,
 *            non-authoring -> 403.
 *   PUBLIC   /api/copilot/demo (GET, POST) → anonymous-safe deterministic
 *            analysis with no database, no history, no LLM/RAG, no writes.
 *
 * These tests invoke the real handlers (session-store mode, no DATABASE_URL)
 * and spy on the private repositories / memory to prove the demo never
 * touches them and the private route never runs work before authenticating.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mockNoUser,
  mockViewer,
  mockEngineer,
  mockAdmin,
  mockAuthUser,
  buildUser,
  unmockAuth,
} from "@/test/mock-auth";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
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
});

const BRAIN = "../../../app/api/brain/route";
const DEMO = "../../../app/api/copilot/demo/route";

const KNOWN_QUESTION = "ABB ACS580 fault 2310 during acceleration";

function postReq(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    // SECURITY-7: a valid same-origin header so authorized brain POSTs reach
    // the pipeline; the demo POST ignores Origin. Origin rejection is proven
    // in the SECURITY-7 boundary suite.
    headers: { "content-type": "application/json", origin: "https://hermesnovin.com" },
    body: JSON.stringify(body),
  });
}

function getReq(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const SENSITIVE_FIELD = /(?:"(?:userId|organizationId|orgId|tenantId|siteId|departmentId|membershipId|email|phone|ipAddress|accessToken|refreshToken|sessionToken|apiKey|secret|password|passwordHash)"\s*:)/i;
const INTERNAL_LEAK = /(?:\/home\/|[A-Z]:\\\\|node_modules|at Object\.|Error: |"stack")/;

// A well-formed unsigned token exercises the sync decode path used elsewhere.
function fakeToken(payload: Record<string, unknown>): string {
  const enc = (o: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

// ── PRIVATE /api/brain — GET ─────────────────────────────────────────────────

describe("PRIVATE /api/brain GET — history requires the authoring capability", () => {
  it("anonymous → 401 with no history and no-store", async () => {
    mockNoUser();
    const { GET } = await import(BRAIN);
    const res = await GET(getReq("/api/brain?n=5"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).not.toHaveProperty("recent");
    expect(body).toEqual({ ok: false, error: "Authentication required." });
  });

  it("authenticated non-authoring roles → 403 with no history and no-store", async () => {
    for (const mock of [
      () => mockViewer(),
      () => mockAuthUser(buildUser("customer")),
      () => mockAuthUser(buildUser("vendor")),
      () => mockAuthUser(buildUser("candidate")),
    ]) {
      vi.resetModules();
      mock();
      const { GET } = await import(BRAIN);
      const res = await GET(getReq("/api/brain?n=5"));
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = await res.json();
      expect(body).not.toHaveProperty("recent");
      expect(body).toEqual({ ok: false, error: "Insufficient permissions." });
    }
  });

  it("does not read the analysis repository for anonymous or non-authoring callers (db mode)", async () => {
    for (const mock of [() => mockNoUser(), () => mockViewer(), () => mockAuthUser(buildUser("customer"))]) {
      vi.resetModules();
      process.env.HERMES_STORAGE_MODE = "database";
      const listSpy = vi.fn(async () => []);
      vi.doMock("@/lib/storage/analysis-repository", () => ({
        analysisRepository: () => ({ list: listSpy, create: vi.fn() }),
      }));
      mock();
      const { GET } = await import(BRAIN);
      const res = await GET(getReq("/api/brain?n=5"));
      expect([401, 403]).toContain(res.status);
      expect(listSpy).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/storage/analysis-repository");
    }
  });

  it("authoring roles (engineer, admin, superadmin) reach the history with no-store", async () => {
    for (const mock of [() => mockEngineer(), () => mockAdmin(), () => mockAuthUser(buildUser("superadmin"))]) {
      vi.resetModules();
      mock();
      const { GET } = await import(BRAIN);
      const res = await GET(getReq("/api/brain?n=5"));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toHaveProperty("recent");
    }
  });
});

// ── PRIVATE /api/brain — POST ────────────────────────────────────────────────

describe("PRIVATE /api/brain POST — execution and writes require the authoring capability", () => {
  it("anonymous → 401 with no-store, before any body parse", async () => {
    mockNoUser();
    const { POST } = await import(BRAIN);
    const res = await POST(postReq("/api/brain", { question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("authenticated non-authoring role → 403 with no-store", async () => {
    for (const mock of [
      () => mockViewer(),
      () => mockAuthUser(buildUser("customer")),
      () => mockAuthUser(buildUser("vendor")),
      () => mockAuthUser(buildUser("candidate")),
    ]) {
      vi.resetModules();
      mock();
      const { POST } = await import(BRAIN);
      const res = await POST(postReq("/api/brain", { question: KNOWN_QUESTION, locale: "en" }));
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
    }
  });

  it("denied requests (401/403) never reach the reasoning pipeline", async () => {
    for (const mock of [() => mockNoUser(), () => mockViewer()]) {
      vi.resetModules();
      const runPipeline = vi.fn();
      vi.doMock("@/lib/industrial/pipeline", () => ({ runPipeline }));
      mock();
      const { POST } = await import(BRAIN);
      const res = await POST(postReq("/api/brain", { question: KNOWN_QUESTION, locale: "en" }));
      expect([401, 403]).toContain(res.status);
      expect(runPipeline).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/industrial/pipeline");
    }
  });

  it("denied requests (401/403) never persist an analysis record (db mode)", async () => {
    for (const mock of [() => mockNoUser(), () => mockAuthUser(buildUser("customer"))]) {
      vi.resetModules();
      process.env.HERMES_STORAGE_MODE = "database";
      const createSpy = vi.fn(async () => ({}));
      vi.doMock("@/lib/storage/analysis-repository", () => ({
        analysisRepository: () => ({ list: vi.fn(async () => []), create: createSpy }),
      }));
      mock();
      const { POST } = await import(BRAIN);
      const res = await POST(postReq("/api/brain", { question: KNOWN_QUESTION, locale: "en" }));
      expect([401, 403]).toContain(res.status);
      expect(createSpy).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/storage/analysis-repository");
    }
  });

  it("authoring caller reaches analysis (200) and validates payload only after authorization (400)", async () => {
    vi.resetModules();
    mockEngineer();
    const { POST } = await import(BRAIN);
    const ok = await POST(postReq("/api/brain", { question: KNOWN_QUESTION, locale: "en" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");

    vi.resetModules();
    mockEngineer();
    const { POST: POST2 } = await import(BRAIN);
    const short = await POST2(postReq("/api/brain", { question: "x", locale: "en" }));
    expect(short.status).toBe(400);
  });
});

// ── PUBLIC /api/copilot/demo — anonymous-safe ────────────────────────────────

describe("PUBLIC /api/copilot/demo — anonymous deterministic analysis", () => {
  it("GET succeeds anonymously with demo marker and no history", async () => {
    mockNoUser();
    const { GET } = await import(DEMO);
    const res = await GET(getReq("/api/copilot/demo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.storageMode).toBe("demo");
    expect(body.recent).toEqual([]);
    expect(body).toHaveProperty("stats");
  });

  it("POST analyzes anonymously, marks demo, and returns bounded deterministic output", async () => {
    mockNoUser();
    const { POST } = await import(DEMO);
    const res = await POST(postReq("/api/copilot/demo", { question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body).toHaveProperty("domains");
    expect(body).toHaveProperty("confidenceReport");
    // Echoes only the caller's own question context — never a `recent` history.
    expect(body).not.toHaveProperty("recent");
  });

  it("POST does NOT touch the analysis repository, unknown repository, or memory ring", async () => {
    const analysisCreate = vi.fn();
    const unknownCreate = vi.fn();
    const memoryRecord = vi.fn();
    vi.doMock("@/lib/storage/analysis-repository", () => ({
      analysisRepository: () => ({ list: vi.fn(async () => []), create: analysisCreate }),
    }));
    vi.doMock("@/lib/storage/unknown-repository", () => ({
      unknownRepository: () => ({ create: unknownCreate }),
    }));
    vi.doMock("@/lib/industrial/memory", async (orig) => {
      const actual = (await orig()) as Record<string, unknown>;
      return { ...actual, analysisMemory: { record: memoryRecord, recent: () => [], stats: () => ({}) } };
    });
    mockNoUser();
    const { POST } = await import(DEMO);
    // Force database mode too — the demo must ignore it entirely.
    process.env.HERMES_STORAGE_MODE = "database";
    const res = await POST(postReq("/api/copilot/demo", { question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    expect(analysisCreate).not.toHaveBeenCalled();
    expect(unknownCreate).not.toHaveBeenCalled();
    expect(memoryRecord).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/storage/analysis-repository");
    vi.doUnmock("@/lib/storage/unknown-repository");
    vi.doUnmock("@/lib/industrial/memory");
  });

  it("POST never invokes an LLM/RAG provider", async () => {
    const completeTask = vi.fn();
    vi.doMock("@/lib/llm/gateway", () => ({
      completeTask,
      gatewayAvailable: () => true,
    }));
    const runRagPipeline = vi.fn();
    vi.doMock("@/lib/rag/rag-pipeline", () => ({ runRagPipeline }));
    mockNoUser();
    const { POST } = await import(DEMO);
    const res = await POST(postReq("/api/copilot/demo", { question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    expect(completeTask).not.toHaveBeenCalled();
    expect(runRagPipeline).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/llm/gateway");
    vi.doUnmock("@/lib/rag/rag-pipeline");
  });

  it("bounds input and sanitizes errors", async () => {
    mockNoUser();
    const { POST } = await import(DEMO);
    // Too-short question → 400.
    const short = await POST(postReq("/api/copilot/demo", { question: "x", locale: "en" }));
    expect(short.status).toBe(400);
    // Invalid JSON → sanitized 400, no stack/internal path.
    const bad = await POST(
      new Request("http://localhost/api/copilot/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(bad.status).toBe(400);
    expect(INTERNAL_LEAK.test(JSON.stringify(await bad.json()))).toBe(false);
  });

  it("responses expose no sensitive fields and are cookie-independent (fa and en equivalent)", async () => {
    for (const locale of ["fa", "en"] as const) {
      vi.resetModules();
      mockNoUser();
      const { GET, POST } = await import(DEMO);
      const getText = JSON.stringify(await (await GET(getReq("/api/copilot/demo"))).json());
      expect(getText).not.toMatch(SENSITIVE_FIELD);
      expect(getText).not.toMatch(INTERNAL_LEAK);
      const postBody = await (
        await POST(postReq("/api/copilot/demo", { question: KNOWN_QUESTION, locale }))
      ).json();
      const postText = JSON.stringify(postBody);
      expect(postText).not.toMatch(SENSITIVE_FIELD);
      expect(postText).not.toMatch(INTERNAL_LEAK);
      expect(postBody.demo).toBe(true);
    }
  });

  it("exports only GET and POST (no other write methods)", async () => {
    const mod = (await import(DEMO)) as Record<string, unknown>;
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    for (const m of ["PUT", "PATCH", "DELETE"] as const) {
      expect(mod[m]).toBeUndefined();
    }
  });
});

// ── GLOBAL regressions: SECURITY-4/5 remain intact ───────────────────────────

describe("SECURITY-4/5 regressions remain intact", () => {
  it("dashboard intelligence APIs stay 401 for anonymous callers", async () => {
    for (const path of [
      "../../../app/api/dashboard/route",
      "../../../app/api/intelligence/route",
      "../../../app/api/intelligence/agents/route",
    ]) {
      vi.resetModules();
      mockNoUser();
      const { GET } = await import(path);
      const res = await GET();
      expect(res.status).toBe(401);
    }
  });

  it("public operations API keeps its anonymous contract", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../../../app/api/operations/overview/route");
    const res = await GET();
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
