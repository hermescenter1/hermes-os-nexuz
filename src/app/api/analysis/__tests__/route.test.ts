import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 82D.3 — /api/analysis security regression suite.
 *
 * Locks the Phase 82C hardening:
 *  - POST requires the "authoring" capability (401 without a session,
 *    403 for a non-authoring role);
 *  - GET stays 200 for everyone — StorageIndicator reads only `storageMode`
 *    from it — but the analysis history itself is returned to authoring
 *    callers only; everyone else gets `records: []` in the same shape.
 *
 * Session-store mode only (no DATABASE_URL). Handlers are imported directly
 * after the auth mock is set — no Next server, no Postgres.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

const g = () => globalThis as Record<string, unknown>;
const analysisStore = () => g().__hermesAnalysisRows as unknown[];

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  g().__hermesAnalysisRows = [];
  g().__hermesAudit = [];
  vi.resetModules();
  // Default: an authoring engineer so setup/seed calls reach the repository.
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

function postReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Create one analysis record via the authoring POST handler (the default
 *  engineer mock is active in beforeEach). */
async function seedAnalysis(query = "VFD overcurrent trip on acceleration") {
  const { POST } = await import("../route");
  const res = await POST(
    postReq({ query, mode: "library", domains: ["drives"], confidence: 72, riskLevel: "medium" })
  );
  return (await res.json()).record;
}

// ── Public GET: analysis history never leaks ────────────────────────────────

describe("GET /api/analysis — public read returns an empty record list", () => {
  it("unauthenticated GET returns 200 with { storageMode, records }", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(Array.isArray(body.records)).toBe(true);
  });

  it("unauthenticated GET hides existing analysis records", async () => {
    await seedAnalysis();

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.records).toEqual([]);
  });

  it("viewer (non-authoring) GET hides existing analysis records", async () => {
    await seedAnalysis();

    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.records).toEqual([]);
  });

  it("authoring (engineer) GET returns the full analysis history", async () => {
    await seedAnalysis("Profinet comm loss after switch replacement");

    // Default engineer mock is still active.
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].query).toBe("Profinet comm loss after switch replacement");
  });
});

// ── POST protection ────────────────────────────────────────────────────────

describe("POST /api/analysis — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { POST } = await import("../route");
    const res = await POST(postReq({ query: "anon analysis" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
    expect(analysisStore()).toHaveLength(0);
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { POST } = await import("../route");
    const res = await POST(postReq({ query: "viewer analysis" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
    expect(analysisStore()).toHaveLength(0);
  });

  it("lets an authoring caller create an analysis record", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      postReq({ query: "Motor bearing vibration", mode: "library", riskLevel: "low" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body.record.id).toBeTruthy();
    expect(body.record.query).toBe("Motor bearing vibration");
    expect(analysisStore()).toHaveLength(1);
  });
});

// ── StorageIndicator compatibility ──────────────────────────────────────────

describe("GET /api/analysis — StorageIndicator compatibility", () => {
  it("stays 200 and reports storageMode to anonymous callers without exposing records", async () => {
    await seedAnalysis();

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    // The only field StorageIndicator consumes.
    expect(body.storageMode).toBe("session");
    // The response shape is unchanged — but carries no history.
    expect(body).toHaveProperty("records");
    expect(body.records).toEqual([]);
  });
});

// ── Regression invariant: a public caller is fully locked out ────────────────

describe("regression invariant — public caller cannot read or write analysis history", () => {
  it("cannot create analysis records or read history, while storageMode still works", async () => {
    await seedAnalysis();

    vi.resetModules();
    mockNoUser();
    const { GET, POST } = await import("../route");

    expect((await POST(postReq({ query: "nope" }))).status).toBe(401);
    // The seeded record is the only one; the anonymous POST created nothing.
    expect(analysisStore()).toHaveLength(1);

    const body = await (await GET()).json();
    expect(body.records).toEqual([]);
    expect(body).toHaveProperty("storageMode");
  });
});
