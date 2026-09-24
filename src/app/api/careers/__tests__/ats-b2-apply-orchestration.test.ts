/**
 * ATS-B2 — POST /api/careers/apply WITH the owner gate hypothetically ON.
 *
 * `phase104b1-public-surface.test.ts` proves the route refuses while the
 * real flag is off. This file mocks the flag module to `true` and proves the
 * orchestrated path: 202 + opaque reference; identical shape on replay and on
 * a duplicate; generic 503 on a payload mismatch; the retention gate still
 * refuses with WRITE_COUNT=0; a disallowed Origin is refused; no PII and no
 * row id in any response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({ db: null as unknown, rateLimited: false }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));
vi.mock("@/lib/auth/rate-limiter", () => ({ checkRateLimit: async () => !h.rateLimited, retryAfter: () => 42 }));
vi.mock("@/lib/ats/acceptance-flag", () => ({
  APPLICATION_ACCEPTANCE_AUTHORIZED: true,
  APPLICATION_ORCHESTRATION_IMPLEMENTED: true,
  APPLY_JOURNEY_OPEN: true,
}));

import { POST as apply } from "../apply/route";

const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
const SECRET_ENV = "RECRUITMENT_IDEMPOTENCY_SECRET";

function makeDb(opts?: { retentionApproved?: boolean; eligible?: boolean; existingApplication?: { id: string; publicReference: string } }) {
  const writes: string[] = [];
  const idem: Record<string, { id: string; payloadHash: string; status: string; resultId: string | null; expiresAt: Date }> = {};
  const tx = {
    atsJob: { findFirst: async () => (opts?.eligible === false ? null : { id: "job-1", organizationId: "org-1" }) },
    retentionPolicy: { findFirst: async () => (opts?.retentionApproved === false ? null : { id: "rp-1", retentionDays: 90, retentionTrigger: "CREATION" }) },
    // A duplicate APPLICATION presupposes an existing CANDIDATE — the fixture says so.
    atsCandidate: {
      findUnique: async () => (opts?.existingApplication ? { id: "c-old" } : null),
      create: async () => { writes.push("candidate"); return { id: "c-1" }; },
    },
    atsApplication: {
      findFirst: async () => opts?.existingApplication ?? null,
      create: async () => { writes.push("application"); return { id: "a-1" }; },
      update: async () => { writes.push("application.update"); return {}; },
    },
    consentRecord: { create: async () => { writes.push("consent"); return {}; } },
    atsPipelineEvent: { create: async () => { writes.push("event"); return {}; } },
    atsReviewOutbox: { create: async () => { writes.push("outbox"); return {}; } },
    auditLog: { create: async () => { writes.push("audit"); return {}; } },
  };
  const recruitmentIdempotencyKey = {
    create: async (a: { data: { organizationId: string; jobId: string; keyHash: string; payloadHash: string; expiresAt: Date } }) => {
      const k = `${a.data.organizationId}|${a.data.jobId}|${a.data.keyHash}`;
      if (idem[k]) throw Object.assign(new Error("dup"), { code: "P2002" });
      idem[k] = { id: `i-${Object.keys(idem).length + 1}`, payloadHash: a.data.payloadHash, status: "CLAIMED", resultId: null, expiresAt: a.data.expiresAt };
      writes.push("idem");
      return { id: idem[k].id };
    },
    findUnique: async (a: { where: { organizationId_jobId_keyHash: { organizationId: string; jobId: string; keyHash: string } } }) => {
      const w = a.where.organizationId_jobId_keyHash;
      return idem[`${w.organizationId}|${w.jobId}|${w.keyHash}`] ?? null;
    },
    update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = Object.values(idem).find((r) => r.id === a.where.id);
      if (row) Object.assign(row, a.data);
      return row;
    },
    delete: async (a: { where: { id: string } }) => {
      for (const k of Object.keys(idem)) if (idem[k].id === a.where.id) delete idem[k];
      return {};
    },
  };
  const client = { ...tx, recruitmentIdempotencyKey, $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  return { client, writes };
}

const validBody = () => ({ jobId: "job-1", fullName: "Jane Doe", email: "jane@example.org", privacyNoticeAcknowledged: true, accuracyConfirmed: true });

function applyReq(body: unknown, headers: Record<string, string> = {}, url = "https://hermesnovin.com/api/careers/apply") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", "idempotency-key": KEY, ...headers },
    body: JSON.stringify(body),
  });
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = "test-secret-at-least-16-chars";
  h.db = null;
  h.rateLimited = false;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env[SECRET_ENV];
  else process.env[SECRET_ENV] = savedSecret;
});

describe("with acceptance ON — the orchestrated path", () => {
  it("accepts a valid application: 202, an opaque reference, no-store, nothing else", async () => {
    const store = makeDb();
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["received", "reference"]);
    expect(body.received).toBe(true);
    expect(body.reference).toMatch(/^ats_/);
    expect(JSON.stringify(body)).not.toMatch(/a-1|c-1|jane|Doe|applicationId/i);
    expect(store.writes).toEqual(["idem", "candidate", "application", "consent", "consent", "event", "application.update", "event", "outbox", "audit"]);
  });

  it("a replay of the same key + payload answers the same 202 shape and reference with no new write", async () => {
    const store = makeDb();
    h.db = store.client;
    const first = await (await apply(applyReq(validBody()))).json();
    const before = store.writes.length;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(first);
    expect(store.writes).toHaveLength(before);
  });

  it("the same key with a different payload is the generic 503, WRITE_COUNT=0 beyond the first", async () => {
    const store = makeDb();
    h.db = store.client;
    await apply(applyReq(validBody()));
    const before = store.writes.length;
    const res = await apply(applyReq({ ...validBody(), email: "someone-else@example.org" }));
    expect(res.status).toBe(503);
    expect(store.writes).toHaveLength(before);
  });

  it("a duplicate application by the same person is 202 with the EXISTING reference — indistinguishable from a first submission", async () => {
    const store = makeDb({ existingApplication: { id: "a-old", publicReference: "ats_already" } });
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["received", "reference"]);
    expect(body.reference).toBe("ats_already");
    expect(store.writes).toEqual(["idem", "audit"]);
  });

  it("the retention gate still refuses with WRITE_COUNT=0 when no APPROVED policy exists", async () => {
    const store = makeDb({ retentionApproved: false });
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(503);
    expect(store.writes).toHaveLength(0);
  });

  it("no fingerprint secret → generic 503, WRITE_COUNT=0", async () => {
    delete process.env[SECRET_ENV];
    const store = makeDb();
    h.db = store.client;
    expect((await apply(applyReq(validBody()))).status).toBe(503);
    expect(store.writes).toHaveLength(0);
  });

  it("an ineligible job is the same generic 503", async () => {
    const store = makeDb({ eligible: false });
    h.db = store.client;
    expect((await apply(applyReq(validBody()))).status).toBe(503);
    expect(store.writes).toHaveLength(0);
  });
});

describe("front-door guards remain", () => {
  it("a disallowed Origin is refused; an allowed local origin passes; absent Origin is permitted", async () => {
    const store = makeDb();
    h.db = store.client;
    expect((await apply(applyReq(validBody(), { origin: "https://evil.example" }))).status).toBe(403);
    expect(store.writes).toHaveLength(0);
    expect((await apply(applyReq(validBody(), { origin: "http://localhost:3000" }))).status).toBe(202);
  });

  it("rate limit, media type, idempotency key and strict schema are enforced before any store access", async () => {
    const store = makeDb();
    h.db = store.client;
    h.rateLimited = true;
    expect((await apply(applyReq(validBody()))).status).toBe(429);
    h.rateLimited = false;
    expect((await apply(applyReq(validBody(), { "content-type": "text/plain" }))).status).toBe(415);
    expect((await apply(applyReq(validBody(), { "idempotency-key": "" }))).status).toBe(400);
    expect((await apply(applyReq({ ...validBody(), workAuthorization: "citizen" }))).status).toBe(400);
    expect(store.writes).toHaveLength(0);
  });

  it("the locale query parameter is validated, never trusted", async () => {
    const store = makeDb();
    h.db = store.client;
    expect((await apply(applyReq(validBody(), {}, "https://hermesnovin.com/api/careers/apply?locale=fa"))).status).toBe(202);
    expect((await apply(applyReq(validBody(), { "idempotency-key": "another-valid-key-of-22chars" }, "https://hermesnovin.com/api/careers/apply?locale=zz"))).status).toBe(202);
  });

  it("the route source still logs nothing and imports no fixture", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/careers/apply/route.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(src).not.toMatch(/console\.|logger\./);
    expect(src).not.toMatch(/mock-data/);
  });
});
