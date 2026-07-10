import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 82D.3 — /api/unknown security regression suite.
 *
 * Locks the Phase 82C hardening:
 *  - writes (POST/PATCH) require the "authoring" capability
 *    (401 without a session, 403 for a non-authoring role);
 *  - GET stays 200 but returns an empty `unknowns` list to anonymous /
 *    non-authoring callers;
 *  - CRITICAL: the PATCH `convert` and `library` actions were a public side
 *    door into the case/knowledge corpora hardened in 82A/82B. Anonymous and
 *    viewer callers must never create an EngineeringCase or KnowledgeArticle
 *    through this route — asserted against the real record stores, not just
 *    the status code.
 *
 * Session-store mode only (no DATABASE_URL). Handlers are imported directly
 * after the auth mock is set — no Next server, no Postgres.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

const g = () => globalThis as Record<string, unknown>;
const caseStore = () => g().__hermesCaseDrafts as unknown[];
const articleStore = () => g().__hermesArticleDrafts as unknown[];

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  g().__hermesUnknownRows = [];
  g().__hermesCaseDrafts = [];
  g().__hermesArticleDrafts = [];
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
  return new Request("http://localhost/api/unknown", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/unknown", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Create one unknown record via the authoring POST handler (the default
 *  engineer mock is active in beforeEach). Returns its id. */
async function seedUnknown(query = "Unclassified VFD fault code F0002"): Promise<string> {
  const { POST } = await import("../route");
  const res = await POST(
    postReq({ query, suggestedDomains: ["drives"], suggestedVendors: ["siemens"] })
  );
  const body = await res.json();
  return body.unknown.id as string;
}

// ── Public GET: unknown triage records never leak ───────────────────────────

describe("GET /api/unknown — public read returns an empty list", () => {
  it("unauthenticated GET returns 200 with { storageMode, unknowns }", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(Array.isArray(body.unknowns)).toBe(true);
  });

  it("unauthenticated GET hides existing unknown records", async () => {
    await seedUnknown();

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.unknowns).toEqual([]);
  });

  it("viewer (non-authoring) GET hides existing unknown records", async () => {
    await seedUnknown();

    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.unknowns).toEqual([]);
  });

  it("authoring (engineer) GET returns the full unknown list", async () => {
    await seedUnknown("Profinet dropout after switch swap");

    // Default engineer mock is still active.
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.unknowns).toHaveLength(1);
    expect(body.unknowns[0].query).toBe("Profinet dropout after switch swap");
  });
});

// ── POST protection ────────────────────────────────────────────────────────

describe("POST /api/unknown — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { POST } = await import("../route");
    const res = await POST(postReq({ query: "anon unknown" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { POST } = await import("../route");
    const res = await POST(postReq({ query: "viewer unknown" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller create an unknown record", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq({ query: "Servo drive overtemp" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body.unknown.id).toBeTruthy();
    expect(body.unknown.query).toBe("Servo drive overtemp");
    expect(body.unknown.status).toBe("open");
  });
});

// ── PATCH protection (plain status update) ──────────────────────────────────

describe("PATCH /api/unknown — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "unknown-x", status: "resolved" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "unknown-x", status: "resolved" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller update the status of an existing unknown", async () => {
    const id = await seedUnknown();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, status: "resolved" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unknown.status).toBe("resolved");
  });
});

// ── Side door #1: PATCH action "convert" → EngineeringCase ──────────────────

describe('PATCH /api/unknown action "convert" — case side door is closed', () => {
  it("returns 401 and creates no EngineeringCase for an unauthenticated caller", async () => {
    const id = await seedUnknown(); // a real, convertible unknown exists

    vi.resetModules();
    mockNoUser();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "convert" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
    // The invariant that matters: no case record was created.
    expect(caseStore()).toHaveLength(0);
  });

  it("returns 403 and creates no EngineeringCase for a viewer caller", async () => {
    const id = await seedUnknown();

    vi.resetModules();
    mockViewer();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "convert" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
    expect(caseStore()).toHaveLength(0);
  });

  it("lets an authoring caller convert an unknown into a draft case", async () => {
    const id = await seedUnknown();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "convert" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual({ kind: "case", id: expect.any(String) });
    expect(body.unknown.status).toBe("converted");
    expect(caseStore()).toHaveLength(1);
  });
});

// ── Side door #2: PATCH action "library" → KnowledgeArticle ─────────────────

describe('PATCH /api/unknown action "library" — knowledge side door is closed', () => {
  it("returns 401 and creates no KnowledgeArticle for an unauthenticated caller", async () => {
    const id = await seedUnknown();

    vi.resetModules();
    mockNoUser();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "library" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
    expect(articleStore()).toHaveLength(0);
  });

  it("returns 403 and creates no KnowledgeArticle for a viewer caller", async () => {
    const id = await seedUnknown();

    vi.resetModules();
    mockViewer();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "library" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
    expect(articleStore()).toHaveLength(0);
  });

  it("lets an authoring caller add an unknown to the knowledge library", async () => {
    const id = await seedUnknown();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id, action: "library" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual({ kind: "knowledge", id: expect.any(String) });
    expect(body.unknown.status).toBe("library");
    expect(articleStore()).toHaveLength(1);
  });
});

// ── Regression invariant: a public caller is fully locked out ────────────────

describe("regression invariant — public caller cannot read or mutate unknowns", () => {
  it("cannot create, update, convert, add-to-library, or read unknown records", async () => {
    const id = await seedUnknown();

    vi.resetModules();
    mockNoUser();
    const { GET, POST, PATCH } = await import("../route");

    expect((await POST(postReq({ query: "nope" }))).status).toBe(401);
    expect((await PATCH(patchReq({ id, status: "resolved" }))).status).toBe(401);
    expect((await PATCH(patchReq({ id, action: "convert" }))).status).toBe(401);
    expect((await PATCH(patchReq({ id, action: "library" }))).status).toBe(401);

    // No corpus was touched through the side doors.
    expect(caseStore()).toHaveLength(0);
    expect(articleStore()).toHaveLength(0);

    // And the triage queue itself stays hidden.
    const body = await (await GET()).json();
    expect(body.unknowns).toEqual([]);
    expect(body).toHaveProperty("storageMode");
  });
});
