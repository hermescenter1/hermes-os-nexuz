/**
 * ATS-S1 — the review worker against a captured fake Prisma.
 *
 *   - a due row is claimed by a CONDITIONAL update; a lost race is skipped;
 *   - a delivered review moves the application AI_REVIEW_PENDING →
 *     PENDING_HUMAN_APPROVAL and nowhere else, ever;
 *   - review row, transition, event, outbox DELIVERED and audit share one
 *     transaction; a stale application rolls the review back;
 *   - failures leave the application untouched and the outbox RETRYING with a
 *     code, then DEAD_LETTER after MAX_REVIEW_ATTEMPTS;
 *   - a row for an application a human already moved is dead-lettered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { runAiReviewPass, MAX_REVIEW_ATTEMPTS } from "../worker";
import { ROLE_PROFILES, qualifiedCriterionCode } from "../catalog";

const NOW = new Date("2026-09-23T13:00:00.000Z");

interface Outbox { id: string; organizationId: string; applicationId: string; kind: string; cycle: number; status: string; attempts: number; nextAttemptAt: Date; lastErrorCode: string | null; aiReviewId: string | null; correlationId: string | null }
interface App { id: string; organizationId: string; status: string; jobId: string; aiReviewCycle: number; resumeText: string | null; coverLetter: string | null; totalYearsExp: number | null; deletedAt: Date | null }
interface Write { model: string; data: Record<string, unknown> }

const criteria = ROLE_PROFILES.backend_engineer.criteria.map((c) => ({
  code: qualifiedCriterionCode("backend_engineer", c.code),
  label: c.label,
  kind: c.kind,
  dimension: c.dimension,
  weight: c.weight,
  keywords: [...c.keywords],
  minYears: c.minYears ?? null,
  hardGate: c.hardGate,
}));

function makeDb(outbox: Outbox[], apps: App[], opts?: { noCriteria?: boolean; claimRace?: boolean; staleApp?: boolean }) {
  const rows = outbox.map((o) => ({ ...o }));
  const appRows = apps.map((a) => ({ ...a }));
  const writes: Write[] = [];
  const committed: Write[] = [];
  const tx = {
    atsAiReview: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "atsAiReview", data: a.data }); return { id: "rev-1" }; } },
    atsApplication: {
      findFirst: async (a: { where: { id: string; organizationId: string } }) => {
        const r = appRows.find((x) => x.id === a.where.id && x.organizationId === a.where.organizationId && x.deletedAt === null);
        if (!r) return null;
        return {
          ...r,
          candidate: { skills: ["TypeScript", "PostgreSQL"], location: "Tehran", linkedinUrl: null },
          job: { title: "Backend Engineer", criteria: opts?.noCriteria ? [] : criteria },
        };
      },
      updateMany: async (a: { where: { id: string; organizationId: string; status: string; aiReviewCycle: number }; data: Record<string, unknown> }) => {
        if (opts?.staleApp) return { count: 0 };
        const r = appRows.find((x) => x.id === a.where.id && x.organizationId === a.where.organizationId && x.status === a.where.status && x.aiReviewCycle === a.where.aiReviewCycle);
        if (!r) return { count: 0 };
        Object.assign(r, a.data);
        writes.push({ model: "atsApplication.updateMany", data: a.data });
        return { count: 1 };
      },
    },
    atsPipelineEvent: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "atsPipelineEvent", data: a.data }); return {}; } },
    atsReviewOutbox: {
      findMany: async () => rows.filter((r) => ["PENDING", "RETRYING"].includes(r.status) && r.nextAttemptAt.getTime() <= NOW.getTime()),
      updateMany: async (a: { where: { id: string; status: string | { in: string[] } }; data: Record<string, unknown> }) => {
        if (opts?.claimRace && (a.data.status as string) === "CLAIMED") return { count: 0 };
        const r = rows.find((x) => x.id === a.where.id);
        if (!r) return { count: 0 };
        const ok = typeof a.where.status === "string" ? r.status === a.where.status : a.where.status.in.includes(r.status);
        if (!ok) return { count: 0 };
        const { attempts, ...rest } = a.data as { attempts?: { increment: number } } & Record<string, unknown>;
        Object.assign(r, rest);
        if (attempts?.increment) r.attempts += attempts.increment;
        writes.push({ model: "atsReviewOutbox.updateMany", data: a.data });
        return { count: 1 };
      },
    },
    auditLog: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "auditLog", data: a.data }); return { id: "audit-1" }; } },
  };
  const client = {
    ...tx,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      const mark = writes.length;
      const snapApps = appRows.map((r) => ({ ...r }));
      const snapRows = rows.map((r) => ({ ...r }));
      try {
        const out = await fn(tx);
        committed.push(...writes.slice(mark));
        return out;
      } catch (err) {
        writes.length = mark;
        appRows.splice(0, appRows.length, ...snapApps);
        rows.splice(0, rows.length, ...snapRows);
        throw err;
      }
    },
  };
  return { client, rows, appRows, writes, committed };
}

const OUT: Outbox = { id: "ob-1", organizationId: "org-A", applicationId: "app-1", kind: "AI_REVIEW", cycle: 0, status: "PENDING", attempts: 0, nextAttemptAt: NOW, lastErrorCode: null, aiReviewId: null, correlationId: "corr-1" };
const APP: App = { id: "app-1", organizationId: "org-A", status: "AI_REVIEW_PENDING", jobId: "job-1", aiReviewCycle: 0, resumeText: "Five years of TypeScript and Node.js on PostgreSQL with REST APIs, Docker, and CI. Deployed to production.", coverLetter: null, totalYearsExp: 5, deletedAt: null };

beforeEach(() => {
  h.db = null;
});

describe("delivery", () => {
  it("claims, reviews, moves to PENDING_HUMAN_APPROVAL and records everything in one transaction", async () => {
    const store = makeDb([OUT], [APP]);
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toEqual({ claimed: 1, delivered: 1, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false });

    expect(store.appRows[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.rows[0]).toMatchObject({ status: "DELIVERED", attempts: 1, aiReviewId: "rev-1", lastErrorCode: null });

    const review = store.committed.find((w) => w.model === "atsAiReview")!.data;
    expect(review).toMatchObject({ organizationId: "org-A", applicationId: "app-1", jobId: "job-1", cycle: 0, provider: "deterministic", correlationId: "corr-1" });
    for (const k of ["extractorVersion", "rubricVersion", "promptVersion", "policyVersion"]) expect(typeof review[k]).toBe("string");
    expect(typeof (review.report as Record<string, unknown>).recommendation).toBe("string");

    const ev = store.committed.find((w) => w.model === "atsPipelineEvent")!.data;
    expect(ev).toMatchObject({ fromStatus: "AI_REVIEW_PENDING", toStatus: "PENDING_HUMAN_APPROVAL", changedByName: "SYSTEM_REVIEW_WORKER" });
    const audit = store.committed.find((w) => w.model === "auditLog")!.data;
    expect(audit).toMatchObject({ action: "recruitment.review.completed", userId: null, organizationId: "org-A" });
    expect(JSON.stringify(audit)).not.toMatch(/TypeScript|Tehran/);
  });

  it("never writes any status other than PENDING_HUMAN_APPROVAL to an application", async () => {
    const store = makeDb([OUT], [APP]);
    h.db = store.client;
    await runAiReviewPass({ now: NOW });
    const appStatuses = store.committed.filter((w) => w.model === "atsApplication.updateMany").map((w) => w.data.status);
    expect(appStatuses).toEqual(["PENDING_HUMAN_APPROVAL"]);
  });

  it("a lost claim race is skipped, not processed twice", async () => {
    const store = makeDb([OUT], [APP], { claimRace: true });
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ claimed: 0, skipped: 1, delivered: 0 });
    expect(store.appRows[0].status).toBe("AI_REVIEW_PENDING");
  });

  it("store unavailable is reported, not swallowed", async () => {
    h.db = null;
    expect((await runAiReviewPass({ now: NOW })).storeUnavailable).toBe(true);
  });
});

describe("failure leaves the application exactly where it was", () => {
  it("a job without criteria → RETRYING with a code and a later nextAttemptAt; the application stays AI_REVIEW_PENDING", async () => {
    const store = makeDb([OUT], [APP], { noCriteria: true });
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ claimed: 1, retrying: 1, delivered: 0 });
    expect(store.rows[0]).toMatchObject({ status: "RETRYING", lastErrorCode: "NO_CRITERIA", attempts: 1 });
    expect(store.rows[0].nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(store.appRows[0].status).toBe("AI_REVIEW_PENDING");
    expect(store.writes.some((w) => w.model === "atsAiReview")).toBe(false);
    const audit = store.writes.find((w) => w.model === "auditLog")!.data;
    expect(audit).toMatchObject({ action: "recruitment.review.failed", userId: null });
  });

  it("after MAX_REVIEW_ATTEMPTS the row is DEAD_LETTER — visible, never silent", async () => {
    const store = makeDb([{ ...OUT, status: "RETRYING", attempts: MAX_REVIEW_ATTEMPTS - 1 }], [APP], { noCriteria: true });
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ deadLettered: 1, retrying: 0 });
    expect(store.rows[0]).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "NO_CRITERIA" });
    expect(store.appRows[0].status).toBe("AI_REVIEW_PENDING");
  });

  it("an application a human already moved is dead-lettered without a review", async () => {
    const store = makeDb([OUT], [{ ...APP, status: "REJECTED" }]);
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ deadLettered: 1 });
    expect(store.rows[0]).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "APPLICATION_NOT_PENDING" });
    expect(store.writes.some((w) => w.model === "atsAiReview")).toBe(false);
    expect(store.appRows[0].status).toBe("REJECTED");
  });

  it("an outbox row from an older cycle is dead-lettered", async () => {
    const store = makeDb([OUT], [{ ...APP, aiReviewCycle: 1 }]);
    h.db = store.client;
    await runAiReviewPass({ now: NOW });
    expect(store.rows[0]).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "APPLICATION_NOT_PENDING" });
  });

  it("a stale application inside the transaction rolls the review back and retries", async () => {
    const store = makeDb([OUT], [APP], { staleApp: true });
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ retrying: 1, delivered: 0 });
    expect(store.committed.some((w) => w.model === "atsAiReview")).toBe(false);
    expect(store.rows[0]).toMatchObject({ status: "RETRYING", lastErrorCode: "STALE_STATE" });
  });

  it("a row from another organization's outbox never reads a foreign application", async () => {
    const store = makeDb([{ ...OUT, organizationId: "org-B" }], [APP]);
    h.db = store.client;
    const report = await runAiReviewPass({ now: NOW });
    expect(report).toMatchObject({ retrying: 1 });
    expect(store.rows[0].lastErrorCode).toBe("APPLICATION_NOT_FOUND");
    expect(store.appRows[0].status).toBe("AI_REVIEW_PENDING");
  });
});
