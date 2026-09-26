/**
 * ATS-B2 / ATS-STAGE1-FORM — POST /api/careers/apply with the REAL owner gate.
 *
 * ATS-B2 wrote this suite against a MOCKED `true` flag. The owner has now
 * authorized acceptance, so the mock is gone: every case below runs against
 * the real `APPLICATION_ACCEPTANCE_AUTHORIZED = true`, and one case restores a
 * `false` flag (vi.doMock) to prove the kill switch still refuses first.
 *
 * Proven: 202 + opaque reference; identical shape on replay and on a
 * duplicate; generic 503 on a payload mismatch; the retention gate, the
 * recruitment secret and the ORGANIZATION'S intake switch each refuse with
 * WRITE_COUNT=0; the application is written at AI_REVIEW_PENDING only, with
 * its consent records, a review outbox row and an audit row; the exact
 * payload the public form builds is accepted; a disallowed Origin is refused;
 * no PII and no row id in any response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settingsRow } from "../../../../lib/ats/__tests__/settings-fixture";

const h = vi.hoisted(() => ({ db: null as unknown, rateLimited: false }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));
vi.mock("@/lib/auth/rate-limiter", () => ({ checkRateLimit: async () => !h.rateLimited, retryAfter: () => 42 }));

import { POST as apply } from "../apply/route";
import { APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/acceptance-flag";
import { IDEMPOTENCY_HEADER } from "@/lib/ats/idempotency";
import {
  STAGE1_IDEMPOTENCY_HEADER,
  STAGE1_INITIAL_FORM,
  newIdempotencyKey,
  validateStage1Form,
} from "@/components/careers/stage1-contract";

const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
const SECRET_ENV = "RECRUITMENT_IDEMPOTENCY_SECRET";

function makeDb(opts?: {
  retentionApproved?: boolean;
  eligible?: boolean;
  existingApplication?: { id: string; publicReference: string };
  /** "on" (default), "off" (row with intake disabled) or "none" (no settings row). */
  intake?: "on" | "off" | "none";
}) {
  const writes: string[] = [];
  const data: {
    application: Record<string, unknown>[];
    applicationUpdates: Record<string, unknown>[];
    consent: Record<string, unknown>[];
    audit: unknown[];
  } = { application: [], applicationUpdates: [], consent: [], audit: [] };
  const intake = opts?.intake ?? "on";
  const idem: Record<string, { id: string; payloadHash: string; status: string; resultId: string | null; expiresAt: Date }> = {};
  const tx = {
    // ATS-M1 — the organization has switched its own intake ON (the global gate is separate).
    atsOrganizationSettings: {
      findUnique: async () => (intake === "none" ? null : settingsRow({ applicationIntakeEnabled: intake === "on" })),
    },
    atsJob: { findFirst: async () => (opts?.eligible === false ? null : { id: "job-1", organizationId: "org-1" }) },
    retentionPolicy: { findFirst: async () => (opts?.retentionApproved === false ? null : { id: "rp-1", retentionDays: 90, retentionTrigger: "CREATION" }) },
    // A duplicate APPLICATION presupposes an existing CANDIDATE — the fixture says so.
    atsCandidate: {
      findUnique: async () => (opts?.existingApplication ? { id: "c-old" } : null),
      create: async () => { writes.push("candidate"); return { id: "c-1" }; },
    },
    atsApplication: {
      findFirst: async () => opts?.existingApplication ?? null,
      create: async (a: { data: Record<string, unknown> }) => { writes.push("application"); data.application.push(a.data); return { id: "a-1" }; },
      update: async (a: { data: Record<string, unknown> }) => { writes.push("application.update"); data.applicationUpdates.push(a.data); return {}; },
    },
    consentRecord: { create: async (a: { data: Record<string, unknown> }) => { writes.push("consent"); data.consent.push(a.data); return {}; } },
    atsPipelineEvent: { create: async () => { writes.push("event"); return {}; } },
    atsReviewOutbox: { create: async () => { writes.push("outbox"); return {}; } },
    auditLog: { create: async (a: unknown) => { writes.push("audit"); data.audit.push(a); return {}; } },
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
  return { client, writes, data };
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

describe("the REAL owner gate", () => {
  it("is ON — this suite runs against the authorized flag, not a mock", () => {
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(true);
  });

  it("the kill switch: with the flag back to false, a fully valid application is refused FIRST, WRITE_COUNT=0", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ats/acceptance-flag", () => ({
      APPLICATION_ACCEPTANCE_AUTHORIZED: false,
      APPLICATION_ORCHESTRATION_IMPLEMENTED: true,
      APPLY_JOURNEY_OPEN: false,
    }));
    try {
      const { POST: closedApply } = await import("../apply/route");
      const store = makeDb();
      h.db = store.client;
      const res = await closedApply(applyReq(validBody()));
      expect(res.status).toBe(503);
      expect(store.writes).toHaveLength(0);
      expect(Object.keys(await res.json())).not.toContain("reference");
    } finally {
      vi.doUnmock("@/lib/ats/acceptance-flag");
      vi.resetModules();
    }
  });
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

  it.each(["off", "none"] as const)("the ORGANIZATION'S intake switch still decides: intake %s → the same generic 503, WRITE_COUNT=0", async (intake) => {
    const store = makeDb({ intake });
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(503);
    expect(store.writes).toHaveLength(0);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/intake|retention|secret|organization|settings/i);
  });

  it("every refusal is ONE indistinguishable body — no reason is disclosed", async () => {
    const bodies = new Set<string>();
    for (const opts of [{ intake: "off" as const }, { retentionApproved: false }, { eligible: false }]) {
      const store = makeDb(opts);
      h.db = store.client;
      const res = await apply(applyReq(validBody()));
      expect(res.status).toBe(503);
      bodies.add(JSON.stringify(await res.json()));
    }
    delete process.env[SECRET_ENV];
    h.db = makeDb().client;
    bodies.add(JSON.stringify(await (await apply(applyReq(validBody()))).json()));
    expect(bodies.size).toBe(1);
  });

  it("the application is written at AI_REVIEW_PENDING — never a later stage — with consent records and an audit row", async () => {
    const store = makeDb();
    h.db = store.client;
    const res = await apply(applyReq({ ...validBody(), futureOpeningsConsent: true }));
    expect(res.status).toBe(202);
    expect(store.data.application).toHaveLength(1);
    const app = store.data.application[0];
    // received as APPLIED, queued to AI_REVIEW_PENDING in the same transaction — and nothing later
    expect(app.status).toBe("APPLIED");
    expect(app.organizationId).toBe("org-1");
    expect(store.data.applicationUpdates.map((u) => u.status)).toEqual(["AI_REVIEW_PENDING"]);
    const writtenText = JSON.stringify([store.data.application, store.data.applicationUpdates]);
    for (const later of ["SCREENING", "PENDING_HUMAN_APPROVAL", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]) {
      expect(writtenText).not.toContain(later);
    }
    // acknowledgement + attestation + the optional consent, because it was given
    expect(store.data.consent.map((c) => c.consentType)).toEqual([
      "recruitment_privacy_notice",
      "recruitment_accuracy",
      "recruitment_future_openings",
    ]);
    expect(store.data.consent.map((c) => c.recordNature)).toEqual(["ACKNOWLEDGEMENT", "ATTESTATION", "CONSENT"]);
    expect(store.data.consent.every((c) => c.organizationId === "org-1")).toBe(true);
    expect(store.writes).toContain("outbox");
    expect(store.data.audit).toHaveLength(1);
    expect(JSON.stringify(store.data.audit[0])).toContain("recruitment.application.received");
  });

  it("the optional future-openings consent is recorded only when it is given", async () => {
    const without = makeDb();
    h.db = without.client;
    await apply(applyReq(validBody()));
    const withIt = makeDb();
    h.db = withIt.client;
    await apply(applyReq({ ...validBody(), futureOpeningsConsent: true }, { "idempotency-key": "another-valid-key-of-22chars" }));
    expect(without.data.consent.map((c) => c.consentType)).not.toContain("recruitment_future_openings");
    expect(withIt.data.consent.map((c) => c.consentType)).toContain("recruitment_future_openings");
  });
});

describe("the public form's own submission is what the route accepts", () => {
  const filled = {
    ...STAGE1_INITIAL_FORM,
    fullName: "  Jane Doe ",
    email: " jane@example.org ",
    phone: "+49 30 1234567",
    currentLocation: "Berlin",
    yearsExperience: "7",
    keySkills: "IFRS, financial reporting, ",
    resumeText: "Seven years in group accounting.",
    fitStatement: "I want to build the finance function.",
    linkedinUrl: "https://www.linkedin.com/in/jane-doe",
    privacyNoticeAcknowledged: true,
    accuracyConfirmed: true,
  };

  it("the client header name IS the server's header name", () => {
    expect(STAGE1_IDEMPOTENCY_HEADER).toBe(IDEMPOTENCY_HEADER);
  });

  it("the exact payload + key the form sends → 202 with an opaque reference", async () => {
    const { payload, errors } = validateStage1Form("job-1", filled);
    expect(errors).toEqual({});
    expect(payload).not.toBeNull();
    const store = makeDb();
    h.db = store.client;
    const res = await apply(applyReq(payload, { [STAGE1_IDEMPOTENCY_HEADER]: newIdempotencyKey() }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.reference).toMatch(/^ats_[A-Za-z0-9_-]{22}$/);
    expect(store.data.applicationUpdates.map((u) => u.status)).toEqual(["AI_REVIEW_PENDING"]);
  });

  it("a form whose confirmations are unticked never produces a payload — and the route would refuse one anyway", async () => {
    expect(validateStage1Form("job-1", { ...filled, privacyNoticeAcknowledged: false }).payload).toBeNull();
    expect(validateStage1Form("job-1", { ...filled, accuracyConfirmed: false }).payload).toBeNull();
    const store = makeDb();
    h.db = store.client;
    const forged = { ...validateStage1Form("job-1", filled).payload!, accuracyConfirmed: false };
    expect((await apply(applyReq(forged))).status).toBe(400);
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
