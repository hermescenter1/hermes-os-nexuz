/**
 * ATS-B2 — application intake orchestration, run against the REAL module
 * with a captured fake Prisma (the B1 harness pattern).
 *
 * The contracts under test:
 *   - no fingerprint secret → refuse before the store is touched;
 *   - no APPROVED retention policy → refuse, no claim, no write;
 *   - the retention expiry is the policy's own period, never a constant;
 *   - candidate + application + typed consents + TWO pipeline events + the
 *     review outbox row + the audit row land in ONE transaction;
 *   - the application ends at AI_REVIEW_PENDING and nowhere further;
 *   - same key + same payload → the same reference, WRITE_COUNT=0;
 *   - same key + other payload → refused, WRITE_COUNT=0;
 *   - an existing candidate (case-insensitive e-mail) is reused, not duplicated;
 *   - a duplicate application answers the existing reference, no new row;
 *   - the in-transaction eligibility re-check rolls everything back and
 *     releases the claim;
 *   - a failing later write rolls everything back and releases the claim;
 *   - the audit row carries identifiers only — never a name or an e-mail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { submitApplication, retentionExpiryFrom, normalizeEmail } from "../intake";
import type { Stage1Application } from "../application";
import type { SettingsRow } from "../settings/defaults";
import { settingsRow } from "./settings-fixture";

const NOW = new Date("2026-09-23T10:00:00.000Z");
const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
const SECRET_ENV = "RECRUITMENT_IDEMPOTENCY_SECRET";

interface Write {
  model: string;
  data: Record<string, unknown>;
}

function makeDb(opts?: {
  policy?: { retentionDays: number | null; trigger?: string } | null;
  jobEligibleCalls?: number; // after N eligibility reads the job becomes ineligible
  existingCandidate?: { id: string; email: string; deletedAt?: Date | null } | null;
  existingApplication?: { id: string; publicReference: string | null } | null;
  failOn?: "consent" | "outbox" | "audit";
  throwOnJob?: boolean;
  /** ATS-M1 — the organization's settings row; default: intake ENABLED, no selected policy. */
  settings?: SettingsRow | null;
  throwOnSettings?: boolean;
  /** Settings rows returned by successive reads (then the last one repeats). */
  settingsSequence?: (SettingsRow | null)[];
}) {
  const writes: Write[] = [];
  const committed: Write[] = [];
  const idem: { id: string; organizationId: string; jobId: string; keyHash: string; payloadHash: string; status: string; resultId: string | null; expiresAt: Date }[] = [];
  let jobReads = 0;
  const policy = opts?.policy === undefined ? { retentionDays: 180, trigger: "CREATION" } : opts.policy;

  const policyWheres: Record<string, unknown>[] = [];
  let settingsReads = 0;
  let transactions = 0;
  const settings = opts?.settings === undefined ? settingsRow({ applicationIntakeEnabled: true }) : opts.settings;
  const tx = {
    atsOrganizationSettings: {
      findUnique: async () => {
        if (opts?.throwOnSettings) throw new Error("db down");
        settingsReads++;
        if (opts?.settingsSequence) return opts.settingsSequence[Math.min(settingsReads, opts.settingsSequence.length) - 1];
        return settings;
      },
    },
    atsJob: {
      findFirst: async () => {
        if (opts?.throwOnJob) throw new Error("db down");
        jobReads++;
        if (opts?.jobEligibleCalls !== undefined && jobReads > opts.jobEligibleCalls) return null;
        return { id: "job-1", organizationId: "org-1" };
      },
    },
    retentionPolicy: {
      findFirst: async (a: { where: Record<string, unknown> }) => {
        policyWheres.push(a.where);
        return policy ? { id: "rp-1", retentionDays: policy.retentionDays, retentionTrigger: policy.trigger ?? "CREATION" } : null;
      },
    },
    atsCandidate: {
      // Mirrors Postgres: `email` is unique across live AND soft-deleted rows.
      findUnique: async (a: { where: { email: string; deletedAt?: unknown } }) => {
        const c = opts?.existingCandidate;
        if (!c || c.email !== a.where.email) return null;
        // A `deletedAt: null` filter hides an erased row — exactly the trap under test.
        if ("deletedAt" in a.where && a.where.deletedAt === null && c.deletedAt) return null;
        return { id: c.id, deletedAt: c.deletedAt ?? null };
      },
      create: async (a: { data: Record<string, unknown> }) => {
        writes.push({ model: "atsCandidate", data: a.data });
        return { id: "cand-new" };
      },
    },
    atsApplication: {
      findFirst: async () => opts?.existingApplication ?? null,
      create: async (a: { data: Record<string, unknown> }) => {
        writes.push({ model: "atsApplication", data: a.data });
        return { id: "app-new" };
      },
      update: async (a: { where: unknown; data: Record<string, unknown> }) => {
        writes.push({ model: "atsApplication.update", data: a.data });
        return {};
      },
    },
    consentRecord: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failOn === "consent") throw new Error("boom");
        writes.push({ model: "consentRecord", data: a.data });
        return {};
      },
    },
    atsPipelineEvent: {
      create: async (a: { data: Record<string, unknown> }) => {
        writes.push({ model: "atsPipelineEvent", data: a.data });
        return {};
      },
    },
    atsReviewOutbox: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failOn === "outbox") throw new Error("boom");
        writes.push({ model: "atsReviewOutbox", data: a.data });
        return {};
      },
    },
    auditLog: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failOn === "audit") throw new Error("boom");
        writes.push({ model: "auditLog", data: a.data });
        return {};
      },
    },
  };
  const recruitmentIdempotencyKey = {
    create: async (a: { data: Omit<(typeof idem)[number], "id" | "resultId"> }) => {
      const dup = idem.find((r) => r.organizationId === a.data.organizationId && r.jobId === a.data.jobId && r.keyHash === a.data.keyHash);
      if (dup) throw Object.assign(new Error("dup"), { code: "P2002" });
      const row = { id: `idem-${idem.length + 1}`, resultId: null, ...a.data };
      idem.push(row);
      return { id: row.id };
    },
    findUnique: async (a: { where: { organizationId_jobId_keyHash: { organizationId: string; jobId: string; keyHash: string } } }) => {
      const k = a.where.organizationId_jobId_keyHash;
      return idem.find((r) => r.organizationId === k.organizationId && r.jobId === k.jobId && r.keyHash === k.keyHash) ?? null;
    },
    update: async (a: { where: { id: string }; data: Partial<(typeof idem)[number]> }) => {
      const row = idem.find((r) => r.id === a.where.id);
      if (row) Object.assign(row, a.data);
      return row;
    },
    delete: async (a: { where: { id: string } }) => {
      const i = idem.findIndex((r) => r.id === a.where.id);
      if (i >= 0) idem.splice(i, 1);
      return {};
    },
  };
  const client = {
    ...tx,
    recruitmentIdempotencyKey,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      transactions++;
      const mark = writes.length;
      try {
        const out = await fn(tx);
        committed.push(...writes.slice(mark));
        return out;
      } catch (err) {
        writes.length = mark; // rolled back
        throw err;
      }
    },
  };
  return { client, writes, committed, idem, jobReads: () => jobReads, policyWheres, transactions: () => transactions };
}

const app = (over: Partial<Stage1Application> = {}): Stage1Application => ({
  jobId: "job-1",
  fullName: "Jane Doe",
  email: "Jane@Example.org",
  keySkills: ["PLC", "SCADA"],
  yearsExperience: 6,
  resumeText: "Six years of Siemens S7-1500 and WinCC work.",
  privacyNoticeAcknowledged: true,
  accuracyConfirmed: true,
  ...over,
});

const submit = (a: Stage1Application, key = KEY) =>
  submitApplication({ app: a, rawIdempotencyKey: key, locale: "en", correlationId: "corr-1", now: NOW });

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = "test-secret-at-least-16-chars";
  h.db = null;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env[SECRET_ENV];
  else process.env[SECRET_ENV] = savedSecret;
});

describe("gates before any write", () => {
  it("refuses without a fingerprint secret and never touches the store", async () => {
    delete process.env[SECRET_ENV];
    const store = makeDb();
    h.db = store.client;
    const r = await submit(app());
    expect(r).toEqual({ ok: false, code: "SECRET_MISSING" });
    expect(store.jobReads()).toBe(0);
    expect(store.writes).toHaveLength(0);
  });

  it("refuses when the store is unavailable", async () => {
    h.db = null;
    expect(await submit(app())).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
  });

  it("refuses an ineligible job with no claim and no write", async () => {
    const store = makeDb({ jobEligibleCalls: 0 });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "NOT_ACCEPTING" });
    expect(store.idem).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it("refuses without an APPROVED retention policy — no invented period", async () => {
    const store = makeDb({ policy: null });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "RETENTION_NOT_APPROVED" });
    expect(store.idem).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it("a policy without a real retention period is not a policy", async () => {
    const store = makeDb({ policy: { retentionDays: null } });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "RETENTION_NOT_APPROVED" });
    expect(retentionExpiryFrom({ id: "x", retentionDays: 0, retentionTrigger: "CREATION" }, NOW)).toBeNull();
  });

  it("a store fault is STORE_UNAVAILABLE, never a success", async () => {
    const store = makeDb({ throwOnJob: true });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
  });
});

describe("the write, all or nothing", () => {
  it("persists candidate, application, consents, two events, the outbox row and the audit row in one transaction", async () => {
    const store = makeDb();
    h.db = store.client;
    const r = await submit(app({ futureOpeningsConsent: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reference).toMatch(/^ats_[A-Za-z0-9_-]{20,}$/);
    expect(r.replay).toBe(false);
    expect(r.duplicate).toBe(false);
    expect(r.applicationId).toBe("app-new");

    const models = store.committed.map((w) => w.model);
    expect(models).toEqual([
      "atsCandidate",
      "atsApplication",
      "consentRecord",
      "consentRecord",
      "consentRecord",
      "atsPipelineEvent",
      "atsApplication.update",
      "atsPipelineEvent",
      "atsReviewOutbox",
      "auditLog",
    ]);

    const application = store.committed.find((w) => w.model === "atsApplication")!.data;
    expect(application.status).toBe("APPLIED");
    expect(application.organizationId).toBe("org-1");
    expect(application.retentionPolicyId).toBe("rp-1");
    // 180 days is the POLICY's period, read from the row — not a constant here.
    expect((application.retentionExpiresAt as Date).toISOString()).toBe(new Date(NOW.getTime() + 180 * 86_400_000).toISOString());
    expect(application.publicReference).toBe(r.reference);
    expect(typeof application.consentVersion).toBe("string");
    expect(application.intakeCorrelationId).toBe("corr-1");
    expect(application.aiReviewCycle).toBe(0);

    const candidate = store.committed.find((w) => w.model === "atsCandidate")!.data;
    expect(candidate.email).toBe("jane@example.org");
    expect(candidate.workAuthorization).toBeNull();

    const consents = store.committed.filter((w) => w.model === "consentRecord").map((w) => w.data);
    expect(consents.map((c) => c.recordNature)).toEqual(["ACKNOWLEDGEMENT", "ATTESTATION", "CONSENT"]);
    expect(consents.every((c) => c.granted === true && c.candidateId === "cand-new" && c.organizationId === "org-1")).toBe(true);

    const events = store.committed.filter((w) => w.model === "atsPipelineEvent").map((w) => w.data);
    expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      [null, "APPLIED"],
      ["APPLIED", "AI_REVIEW_PENDING"],
    ]);
    expect(store.committed.find((w) => w.model === "atsApplication.update")!.data).toEqual({ status: "AI_REVIEW_PENDING" });

    const outbox = store.committed.find((w) => w.model === "atsReviewOutbox")!.data;
    expect(outbox).toMatchObject({ organizationId: "org-1", applicationId: "app-new", kind: "AI_REVIEW", cycle: 0, status: "PENDING", correlationId: "corr-1" });

    const audit = store.committed.find((w) => w.model === "auditLog")!.data;
    expect(audit.action).toBe("recruitment.application.received");
    expect(audit.userId).toBeNull();
    expect(audit.organizationId).toBe("org-1");
    expect(audit.correlationId).toBe("corr-1");
    expect((audit.metadata as { actor: string }).actor).toBe("SYSTEM_PUBLIC_INTAKE");

    // The claim is completed with the PUBLIC reference, so a replay can answer without a second lookup.
    expect(store.idem).toHaveLength(1);
    expect(store.idem[0]).toMatchObject({ status: "COMPLETED", resultId: r.reference });
  });

  it("the optional future-openings consent is stored ONLY when actually given", async () => {
    const store = makeDb();
    h.db = store.client;
    await submit(app({ futureOpeningsConsent: false }));
    expect(store.committed.filter((w) => w.model === "consentRecord")).toHaveLength(2);
  });

  it("never writes any status beyond AI_REVIEW_PENDING — no auto-advance", async () => {
    const store = makeDb();
    h.db = store.client;
    await submit(app());
    const statuses = new Set<string>();
    for (const w of store.committed) {
      for (const k of ["status", "toStatus"]) {
        const v = (w.data as Record<string, unknown>)[k];
        if (typeof v === "string") statuses.add(v);
      }
    }
    expect([...statuses].sort()).toEqual(["AI_REVIEW_PENDING", "APPLIED", "PENDING"]);
  });

  it("the audit row carries no PII", async () => {
    const store = makeDb();
    h.db = store.client;
    await submit(app());
    const audit = JSON.stringify(store.committed.find((w) => w.model === "auditLog")!.data);
    expect(audit).not.toMatch(/jane|example\.org|Doe|S7-1500/i);
  });
});

describe("idempotency and deduplication", () => {
  it("same key + same payload → the same reference and WRITE_COUNT=0 on the replay", async () => {
    const store = makeDb();
    h.db = store.client;
    const first = await submit(app());
    const before = store.committed.length;
    const second = await submit(app());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.replay).toBe(true);
    expect(second.reference).toBe(first.reference);
    expect(store.committed).toHaveLength(before);
  });

  it("same key + different payload → refused generically, WRITE_COUNT=0", async () => {
    const store = makeDb();
    h.db = store.client;
    await submit(app());
    const before = store.committed.length;
    const r = await submit(app({ email: "other@example.org" }));
    expect(r).toEqual({ ok: false, code: "PAYLOAD_MISMATCH" });
    expect(store.committed).toHaveLength(before);
  });

  it("reuses an existing candidate matched by NORMALISED e-mail — no second person row", async () => {
    const store = makeDb({ existingCandidate: { id: "cand-old", email: "jane@example.org" } });
    h.db = store.client;
    const r = await submit(app({ email: "JANE@example.org" }));
    expect(r.ok).toBe(true);
    expect(store.committed.some((w) => w.model === "atsCandidate")).toBe(false);
    expect(store.committed.find((w) => w.model === "atsApplication")!.data.candidateId).toBe("cand-old");
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("an ERASED candidate's e-mail is refused by name — never a silent unique-violation, never a resurrection", async () => {
    const store = makeDb({ existingCandidate: { id: "cand-erased", email: "jane@example.org", deletedAt: new Date("2026-01-01") } });
    h.db = store.client;
    const r = await submit(app());
    expect(r).toEqual({ ok: false, code: "CANDIDATE_ERASED" });
    expect(store.committed).toHaveLength(0);
    expect(store.idem).toHaveLength(0); // claim released, a retry is possible once resolved
  });

  it("a duplicate application for the same job answers the EXISTING reference and writes no new row", async () => {
    const store = makeDb({
      existingCandidate: { id: "cand-old", email: "jane@example.org" },
      existingApplication: { id: "app-old", publicReference: "ats_existing" },
    });
    h.db = store.client;
    const r = await submit(app(), "another-valid-key-of-22chars");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.duplicate).toBe(true);
    expect(r.reference).toBe("ats_existing");
    expect(r.applicationId).toBeNull();
    expect(store.committed.map((w) => w.model)).toEqual(["auditLog"]);
    expect(store.committed[0].data.action).toBe("recruitment.application.duplicate_replayed");
  });
});

describe("rollback and claim release", () => {
  it("the in-transaction eligibility re-check refuses, rolls back and releases the claim", async () => {
    // 1 pre-check read succeeds; the in-transaction read finds the job closed.
    const store = makeDb({ jobEligibleCalls: 1 });
    h.db = store.client;
    const r = await submit(app());
    expect(r).toEqual({ ok: false, code: "NOT_ACCEPTING" });
    expect(store.committed).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
    expect(store.idem).toHaveLength(0);
  });

  for (const failOn of ["consent", "outbox", "audit"] as const) {
    it(`a failing ${failOn} write rolls back EVERYTHING and releases the claim`, async () => {
      const store = makeDb({ failOn });
      h.db = store.client;
      const r = await submit(app());
      expect(r).toEqual({ ok: false, code: "WRITE_FAILED" });
      expect(store.committed).toHaveLength(0);
      expect(store.idem).toHaveLength(0);
    });
  }
});

describe("ATS-M1 — the organization's own intake switch and retention selection", () => {
  it("no settings row → intake CLOSED for that organization (fail-closed), nothing claimed or written", async () => {
    const store = makeDb({ settings: null });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "NOT_ACCEPTING" });
    expect(store.idem).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it("intake switched off → NOT_ACCEPTING, the same answer as an unavailable job — refused BEFORE any transaction or claim", async () => {
    const store = makeDb({ settings: settingsRow({ applicationIntakeEnabled: false }) });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "NOT_ACCEPTING" });
    expect(store.writes).toHaveLength(0);
    expect(store.idem).toHaveLength(0);
    expect(store.transactions()).toBe(0);
  });

  it("intake switched off BETWEEN the pre-check and the write is caught inside the transaction and rolled back", async () => {
    const on = settingsRow({ applicationIntakeEnabled: true });
    const off = settingsRow({ applicationIntakeEnabled: false });
    const store = makeDb({ settingsSequence: [on, off] });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "NOT_ACCEPTING" });
    expect(store.transactions()).toBeGreaterThan(0);
    expect(store.committed).toHaveLength(0);
  });

  it("a settings store failure is STORE_UNAVAILABLE, never an open door", async () => {
    const store = makeDb({ throwOnSettings: true });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
    expect(store.writes).toHaveLength(0);
  });

  it("the policy must be EFFECTIVE, and when one is selected it must be THAT policy", async () => {
    const store = makeDb({ settings: settingsRow({ applicationIntakeEnabled: true, retentionPolicyId: "rp-1" }) });
    h.db = store.client;
    const r = await submit(app());
    expect(r.ok).toBe(true);
    expect(store.policyWheres.length).toBeGreaterThanOrEqual(2);
    for (const w of store.policyWheres) {
      expect(w).toMatchObject({ approvalState: "APPROVED", enabled: true, id: "rp-1" });
      expect(w.OR).toEqual([{ effectiveFrom: null }, { effectiveFrom: { lte: NOW } }]);
    }
  });

  it("a selection that changed between the pre-check and the write is refused and rolled back", async () => {
    const store = makeDb({ settings: settingsRow({ applicationIntakeEnabled: true, retentionPolicyId: "rp-OTHER" }) });
    h.db = store.client;
    expect(await submit(app())).toEqual({ ok: false, code: "RETENTION_NOT_APPROVED" });
    expect(store.committed).toHaveLength(0);
  });
});
