import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * F-2 FU-F2-R2-3 / FU-F2-R4-1 — POST /api/documents/storage-cleanup, the
 * scheduled retry trigger.
 *
 * The guard is the REAL `authorizeDocumentCleanupWorker` (its own worker bearer
 * token, or a platform-admin session); only the session lookup is mocked,
 * because it needs a request-scoped cookie context this environment lacks.
 */

const ENV_KEYS = [
  "DOCUMENT_CLEANUP_WORKER_TOKEN",
  "METERING_WORKER_TOKEN",
  "METRICS_TOKEN",
  "ATS_REVIEW_WORKER_TOKEN",
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
] as const;
let saved: Record<string, string | undefined>;
const TOKEN = "doc-cleanup-token-0123456789abcdef";
const OTHER = "other-worker-token-0123456789abcd"; // same length as TOKEN on purpose

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as unknown as { __hermesDocumentStorageCleanups?: unknown[] }).__hermesDocumentStorageCleanups = [];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/auth/session");
});

function mockUser(role: string | null) {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () => (role ? { id: "u1", email: "u@test.com", name: "U", role } : null),
  }));
}

function request(opts: { token?: string; query?: string } = {}) {
  const headers = new Headers();
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost/api/documents/storage-cleanup${opts.query ?? ""}`, { method: "POST", headers });
}

async function dueRow(documentId: string, organizationId = "org-a") {
  const { createSessionCleanupRow } = await import("@/lib/documents/storage-cleanup");
  const row = createSessionCleanupRow({ organizationId, documentId, objectKeys: [`documents/${documentId}/original.pdf`] });
  row.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
  return row;
}

describe("POST /api/documents/storage-cleanup — dedicated worker token", () => {
  it("401 without a token or a session", async () => {
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
    mockUser(null);
    const { POST } = await import("../route");
    expect((await POST(request())).status).toBe(401);
  });

  it("401 with a wrong token of the same length", async () => {
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
    mockUser(null);
    const { POST } = await import("../route");
    expect((await POST(request({ token: OTHER }))).status).toBe(401);
  });

  it.each(["METERING_WORKER_TOKEN", "METRICS_TOKEN", "ATS_REVIEW_WORKER_TOKEN"] as const)(
    "the %s — another worker's or the metrics scraper's secret — is NOT accepted",
    async (other) => {
      process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
      process.env[other] = OTHER;
      mockUser(null);
      await dueRow("gone-x");
      const { POST } = await import("../route");
      expect((await POST(request({ token: OTHER }))).status).toBe(401);
      // …and nothing was processed.
      const rows = (globalThis as unknown as { __hermesDocumentStorageCleanups: Array<{ status: string }> })
        .__hermesDocumentStorageCleanups;
      expect(rows[0].status).toBe("PENDING");
    }
  );

  it("an unset or empty token variable never falls open", async () => {
    mockUser(null);
    const { POST } = await import("../route");
    expect((await POST(request({ token: "anything-at-all-0123456789" }))).status).toBe(401);
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = "";
    vi.resetModules();
    mockUser(null);
    const again = await import("../route");
    expect((await again.POST(request({ token: "" }))).status).toBe(401);
  });

  it("403 for a signed-in user who is not a platform admin", async () => {
    mockUser("engineer");
    const { POST } = await import("../route");
    expect((await POST(request())).status).toBe(403);
  });
});

describe("POST /api/documents/storage-cleanup — pass", () => {
  it("with its token: runs a pass and returns counts only (no ids, keys or organizations)", async () => {
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
    mockUser(null);
    await dueRow("gone1");
    const { POST } = await import("../route");
    const res = await POST(request({ token: TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ claimed: 1, done: 1, retrying: 0 });
    expect(JSON.stringify(body)).not.toMatch(/gone1|org-a|documents\//);
  });

  it("a platform admin session may trigger it too", async () => {
    mockUser("admin");
    const { POST } = await import("../route");
    expect(await (await POST(request())).json()).toEqual({ claimed: 0, done: 0, retrying: 0 });
  });

  it("concurrent passes (two worker replicas) process every due row exactly once", async () => {
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
    mockUser(null);
    for (const id of ["r1", "r2", "r3"]) await dueRow(id);
    const { POST } = await import("../route");
    const bodies = await Promise.all([1, 2, 3, 4].map(async () => (await POST(request({ token: TOKEN }))).json()));
    expect(bodies.reduce((n, b) => n + b.claimed, 0)).toBe(3);
    expect(bodies.reduce((n, b) => n + b.done, 0)).toBe(3);
  });

  it.each(["?limit=0", "?limit=201", "?limit=abc", "?limit=1.5"])("rejects %s with 400", async (q) => {
    process.env.DOCUMENT_CLEANUP_WORKER_TOKEN = TOKEN;
    mockUser(null);
    const { POST } = await import("../route");
    const res = await POST(request({ token: TOKEN, query: q }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_LIMIT");
  });
});
