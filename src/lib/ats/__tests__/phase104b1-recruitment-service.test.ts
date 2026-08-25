/**
 * PHASE 104-B1 — createJobDraft() runs the REAL implementation against a
 * captured fake Prisma. The contracts:
 *
 *   - persists through the transaction (not an in-memory object);
 *   - ALWAYS DRAFT / private / unpublished — no input can change that;
 *   - requisitionKey required; owner-gated and publish fields REJECTED;
 *   - EN+DE+FA translations and the typed audit row in the SAME transaction;
 *   - the actor must hold an ACTIVE membership of the TARGET organization;
 *   - all-or-nothing: a failing later write rolls the whole thing back;
 *   - a requisitionKey collision surfaces as CONFLICT, not a duplicate row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: null as unknown,
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { createJobDraft } from "../recruitment";

interface Calls {
  memberWhere: unknown[];
  jobCreates: Record<string, unknown>[];
  translationCreates: Record<string, unknown>[];
  auditCreates: Record<string, unknown>[];
}

function makeDb(opts?: {
  member?: boolean;
  failOn?: "translation" | "audit";
  jobCreateError?: { code: string };
}): { client: unknown; calls: Calls } {
  const calls: Calls = { memberWhere: [], jobCreates: [], translationCreates: [], auditCreates: [] };
  const tx = {
    organizationMember: {
      findFirst: async (a: { where: unknown }) => {
        calls.memberWhere.push(a.where);
        return opts?.member === false ? null : { id: "m-1" };
      },
    },
    atsJob: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.jobCreateError) throw Object.assign(new Error("unique"), opts.jobCreateError);
        calls.jobCreates.push(a.data);
        return { id: "job-1" };
      },
    },
    atsJobTranslation: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failOn === "translation") throw new Error("boom");
        calls.translationCreates.push(a.data);
        return {};
      },
    },
    auditLog: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failOn === "audit") throw new Error("boom");
        calls.auditCreates.push(a.data);
        return {};
      },
    },
  };
  const client = {
    ...tx,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      // A thrown error aborts the transaction — nothing before it survives.
      try {
        return await fn(tx);
      } catch (err) {
        calls.jobCreates.length = 0;
        calls.translationCreates.length = 0;
        calls.auditCreates.length = 0;
        throw err;
      }
    },
  };
  return { client, calls };
}

const translation = (suffix: string) => ({
  title: `Automation Engineer ${suffix}`,
  shortSummary: `Short ${suffix}`,
  description: `Body ${suffix}`,
  departmentLabel: `Dept ${suffix}`,
  responsibilities: ["r1"],
  requirements: ["q1"],
  preferredExperience: ["p1"],
  localizedSkills: { "plc-programming": `PLC ${suffix}` },
  seoTitle: `SEO ${suffix}`,
  seoDescription: `SEO d ${suffix}`,
});

const validInput = () => ({
  organizationId: "org-1",
  requisitionKey: "HNM-2026-001",
  department: "automation",
  location: "Isfahan, Iran",
  addressLocality: "Isfahan",
  addressRegion: "Isfahan Province",
  addressCountry: "IR",
  skillCodes: ["plc-programming"],
  translations: { en: translation("en"), de: translation("de"), fa: translation("fa") },
});

const actor = { userId: "u-1" };

beforeEach(() => {
  h.db = null;
});

describe("createJobDraft — the real writer", () => {
  it("persists a DRAFT/private/unpublished job with all three translations and a typed audit row", async () => {
    const { client, calls } = makeDb();
    h.db = client;
    const res = await createJobDraft(validInput(), actor);
    expect(res).toEqual({ ok: true, jobId: "job-1" });

    expect(calls.jobCreates).toHaveLength(1);
    const job = calls.jobCreates[0] as Record<string, unknown>;
    expect(job.status).toBe("DRAFT");
    expect(job.isPublic).toBe(false);
    expect(job.publishedAt).toBeNull();
    expect(job.requisitionKey).toBe("HNM-2026-001");
    // no invented values
    expect(job.locationType).toBeNull();
    expect(job.salaryCurrency).toBeNull();

    expect(calls.translationCreates.map((t) => t.language)).toEqual(["EN", "DE", "FA"]);
    expect(calls.auditCreates).toHaveLength(1);
    const audit = calls.auditCreates[0] as { metadata: Record<string, unknown>; action: string; organizationId: string; userId: string };
    expect(audit.action).toBe("recruitment.job.draft_created");
    expect(audit.organizationId).toBe("org-1");
    expect(audit.userId).toBe("u-1");
    expect(audit.metadata.reason).toBeTruthy();
    expect(audit.metadata).toHaveProperty("before", null);
    expect(audit.metadata).toHaveProperty("after");
  });

  it("refuses an actor without ACTIVE membership of the target organization — and writes nothing", async () => {
    const { client, calls } = makeDb({ member: false });
    h.db = client;
    const res = await createJobDraft(validInput(), actor);
    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(calls.jobCreates).toHaveLength(0);
    expect(calls.memberWhere[0]).toMatchObject({ organizationId: "org-1", userId: "u-1", status: "ACTIVE" });
  });

  it("rejects publish/owner-gated fields at the schema boundary", async () => {
    const { client, calls } = makeDb();
    h.db = client;
    for (const extra of [
      { isPublic: true },
      { status: "OPEN" },
      { publishedAt: new Date().toISOString() },
      { salaryCurrency: "USD" },
      { employmentType: "FULL_TIME" },
      { numberOfOpenings: 3 },
    ]) {
      const res = await createJobDraft({ ...validInput(), ...extra }, actor);
      expect(res, JSON.stringify(extra)).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect(calls.jobCreates).toHaveLength(0);
  });

  it("requires requisitionKey and all three complete translations", async () => {
    const { client } = makeDb();
    h.db = client;
    const noKey = { ...validInput() } as Record<string, unknown>;
    delete noKey.requisitionKey;
    expect(await createJobDraft(noKey, actor)).toEqual({ ok: false, code: "INVALID_INPUT" });

    const noFa = validInput() as unknown as { translations: Record<string, unknown> };
    delete noFa.translations.fa;
    expect(await createJobDraft(noFa, actor)).toEqual({ ok: false, code: "INVALID_INPUT" });

    const emptyDeTitle = validInput();
    emptyDeTitle.translations.de.title = "  ";
    expect(await createJobDraft(emptyDeTitle, actor)).toEqual({ ok: false, code: "INVALID_INPUT" });
  });

  it("is all-or-nothing: a failing translation write rolls back the job row", async () => {
    const { client, calls } = makeDb({ failOn: "translation" });
    h.db = client;
    const res = await createJobDraft(validInput(), actor);
    expect(res).toEqual({ ok: false, code: "WRITE_FAILED" });
    expect(calls.jobCreates).toHaveLength(0);
    expect(calls.translationCreates).toHaveLength(0);
  });

  it("is all-or-nothing: a failing AUDIT write rolls back everything — no unaudited job", async () => {
    const { client, calls } = makeDb({ failOn: "audit" });
    h.db = client;
    const res = await createJobDraft(validInput(), actor);
    expect(res).toEqual({ ok: false, code: "WRITE_FAILED" });
    expect(calls.jobCreates).toHaveLength(0);
  });

  it("maps a requisitionKey unique violation to CONFLICT", async () => {
    const { client } = makeDb({ jobCreateError: { code: "P2002" } });
    h.db = client;
    expect(await createJobDraft(validInput(), actor)).toEqual({ ok: false, code: "CONFLICT" });
  });

  it("refuses when the store is unavailable — never a fabricated success", async () => {
    h.db = null;
    expect(await createJobDraft(validInput(), actor)).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
  });
});
