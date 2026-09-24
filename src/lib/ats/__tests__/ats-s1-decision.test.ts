/**
 * ATS-S1 — the human decision gate and ordinary transitions, run against the
 * REAL module with a captured fake Prisma.
 *
 *   - a reason is mandatory; nothing is recorded without one;
 *   - only PENDING_HUMAN_APPROVAL accepts a gate decision;
 *   - ADVANCE → SCREENING, HOLD → stays, RETURN_FOR_REVIEW → AI_REVIEW_PENDING
 *     with the next cycle queued, REJECT → REJECTED;
 *   - the decision row carries every field the contract lists;
 *   - the status update is CONDITIONAL — a concurrent change is STALE;
 *   - another organization's application is NOT_FOUND;
 *   - an AI report from another application is refused;
 *   - ordinary transitions honour the table and refuse the gate states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { recordGateDecision, transitionApplication, HUMAN_TRANSITIONS } from "../decision";

interface AppRow { id: string; organizationId: string; status: string; aiReviewCycle: number; deletedAt: Date | null }
interface Write { model: string; data: Record<string, unknown> }

function makeDb(apps: AppRow[], opts?: { reviews?: { id: string; organizationId: string; applicationId: string }[]; staleUpdate?: boolean; failAudit?: boolean }) {
  const rows = apps.map((a) => ({ ...a }));
  const writes: Write[] = [];
  const committed: Write[] = [];
  const tx = {
    atsApplication: {
      findFirst: async (a: { where: { id: string; organizationId: string } }) =>
        rows.find((r) => r.id === a.where.id && r.organizationId === a.where.organizationId && r.deletedAt === null) ?? null,
      updateMany: async (a: { where: { id: string; organizationId: string; status: string }; data: Record<string, unknown> }) => {
        if (opts?.staleUpdate) return { count: 0 };
        const r = rows.find((x) => x.id === a.where.id && x.organizationId === a.where.organizationId && x.status === a.where.status);
        if (!r) return { count: 0 };
        Object.assign(r, a.data);
        writes.push({ model: "atsApplication.updateMany", data: a.data });
        return { count: 1 };
      },
    },
    atsAiReview: {
      findFirst: async (a: { where: { id: string; organizationId: string; applicationId: string } }) =>
        (opts?.reviews ?? []).find((r) => r.id === a.where.id && r.organizationId === a.where.organizationId && r.applicationId === a.where.applicationId) ?? null,
    },
    atsReviewDecision: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "atsReviewDecision", data: a.data }); return { id: "dec-1" }; } },
    atsPipelineEvent: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "atsPipelineEvent", data: a.data }); return {}; } },
    atsReviewOutbox: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "atsReviewOutbox", data: a.data }); return {}; } },
    auditLog: {
      create: async (a: { data: Record<string, unknown> }) => {
        if (opts?.failAudit) throw new Error("boom");
        writes.push({ model: "auditLog", data: a.data });
        return { id: "audit-1" };
      },
    },
  };
  const client = {
    ...tx,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      const mark = writes.length;
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        const out = await fn(tx);
        committed.push(...writes.slice(mark));
        return out;
      } catch (err) {
        writes.length = mark;
        rows.splice(0, rows.length, ...snapshot);
        throw err;
      }
    },
  };
  return { client, rows, committed };
}

const GATE: AppRow = { id: "app-1", organizationId: "org-A", status: "PENDING_HUMAN_APPROVAL", aiReviewCycle: 0, deletedAt: null };
const actor = { userId: "u-hr", role: "HR_MANAGER" };
const decide = (decision: "ADVANCE" | "HOLD" | "RETURN_FOR_REVIEW" | "REJECT", over: Record<string, unknown> = {}) =>
  recordGateDecision({ organizationId: "org-A", applicationId: "app-1", actor, decision, reason: "Meets the PLC and SCADA criteria with cited evidence.", correlationId: "corr-9", ...over });

beforeEach(() => {
  h.db = null;
});

describe("a reason is mandatory", () => {
  it("refuses an empty or too-short reason before touching the store", async () => {
    const store = makeDb([GATE]);
    h.db = store.client;
    expect(await decide("ADVANCE", { reason: "" })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await decide("ADVANCE", { reason: "ok" })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(store.committed).toHaveLength(0);
  });

  it("refuses an actor without identity", async () => {
    h.db = makeDb([GATE]).client;
    expect(await decide("ADVANCE", { actor: { userId: "", role: "HR_MANAGER" } })).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
});

describe("the four decisions", () => {
  it("ADVANCE → SCREENING with a complete decision record, event and audit — and NO outbox row", async () => {
    const store = makeDb([GATE], { reviews: [{ id: "rev-1", organizationId: "org-A", applicationId: "app-1" }] });
    h.db = store.client;
    const r = await decide("ADVANCE", { aiReviewId: "rev-1" });
    expect(r).toEqual({ ok: true, decisionId: "dec-1", fromStatus: "PENDING_HUMAN_APPROVAL", toStatus: "SCREENING", cycle: 0 });
    expect(store.rows[0].status).toBe("SCREENING");
    expect(store.committed.map((w) => w.model)).toEqual(["atsApplication.updateMany", "atsReviewDecision", "atsPipelineEvent", "auditLog"]);

    const d = store.committed.find((w) => w.model === "atsReviewDecision")!.data;
    expect(d).toEqual({
      organizationId: "org-A",
      applicationId: "app-1",
      actorUserId: "u-hr",
      actorMemberId: null,
      actorRole: "HR_MANAGER",
      fromStatus: "PENDING_HUMAN_APPROVAL",
      toStatus: "SCREENING",
      decision: "ADVANCE",
      reason: "Meets the PLC and SCADA criteria with cited evidence.",
      aiReviewId: "rev-1",
      correlationId: "corr-9",
    });
    const ev = store.committed.find((w) => w.model === "atsPipelineEvent")!.data;
    expect(ev).toMatchObject({ fromStatus: "PENDING_HUMAN_APPROVAL", toStatus: "SCREENING", changedById: "u-hr" });
    const audit = store.committed.find((w) => w.model === "auditLog")!.data;
    expect(audit).toMatchObject({ action: "recruitment.decision.recorded", userId: "u-hr", organizationId: "org-A", correlationId: "corr-9" });
    expect((audit.metadata as Record<string, unknown>).reason).toBe("Meets the PLC and SCADA criteria with cited evidence.");
  });

  it("HOLD records the decision and leaves the status where it is", async () => {
    const store = makeDb([GATE]);
    h.db = store.client;
    const r = await decide("HOLD");
    expect(r).toMatchObject({ ok: true, fromStatus: "PENDING_HUMAN_APPROVAL", toStatus: "PENDING_HUMAN_APPROVAL" });
    expect(store.rows[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.committed.some((w) => w.model === "atsReviewDecision")).toBe(true);
  });

  it("RETURN_FOR_REVIEW → AI_REVIEW_PENDING, increments the cycle and queues the next review", async () => {
    const store = makeDb([GATE]);
    h.db = store.client;
    const r = await decide("RETURN_FOR_REVIEW");
    expect(r).toMatchObject({ ok: true, toStatus: "AI_REVIEW_PENDING", cycle: 1 });
    expect(store.rows[0]).toMatchObject({ status: "AI_REVIEW_PENDING", aiReviewCycle: 1 });
    const outbox = store.committed.find((w) => w.model === "atsReviewOutbox")!.data;
    expect(outbox).toMatchObject({ organizationId: "org-A", applicationId: "app-1", kind: "AI_REVIEW", cycle: 1, status: "PENDING" });
  });

  it("REJECT → REJECTED, with the reason on record", async () => {
    const store = makeDb([GATE]);
    h.db = store.client;
    const r = await decide("REJECT", { reason: "Hard gate failed: 2 years against a 5-year minimum, confirmed by phone." });
    expect(r).toMatchObject({ ok: true, toStatus: "REJECTED" });
    expect(store.committed.find((w) => w.model === "atsReviewDecision")!.data.decision).toBe("REJECT");
  });
});

describe("guards", () => {
  it("only PENDING_HUMAN_APPROVAL accepts a gate decision", async () => {
    for (const status of ["APPLIED", "AI_REVIEW_PENDING", "SCREENING", "REJECTED", "HIRED"]) {
      const store = makeDb([{ ...GATE, status }]);
      h.db = store.client;
      expect(await decide("ADVANCE")).toEqual({ ok: false, code: "INVALID_STATE" });
      expect(store.committed).toHaveLength(0);
    }
  });

  it("another organization's application is NOT_FOUND — identical to a missing one", async () => {
    const store = makeDb([{ ...GATE, organizationId: "org-B" }]);
    h.db = store.client;
    expect(await decide("ADVANCE")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await decide("ADVANCE", { applicationId: "nope" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(store.committed).toHaveLength(0);
  });

  it("an AI report that belongs to another application or organization is refused", async () => {
    const store = makeDb([GATE], { reviews: [{ id: "rev-x", organizationId: "org-A", applicationId: "app-2" }] });
    h.db = store.client;
    expect(await decide("ADVANCE", { aiReviewId: "rev-x" })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(store.committed).toHaveLength(0);
  });

  it("a concurrent change makes the decision STALE and rolls it back", async () => {
    const store = makeDb([GATE], { staleUpdate: true });
    h.db = store.client;
    expect(await decide("ADVANCE")).toEqual({ ok: false, code: "STALE" });
    expect(store.committed).toHaveLength(0);
  });

  it("a failing audit write rolls back the status change", async () => {
    const store = makeDb([GATE], { failAudit: true });
    h.db = store.client;
    expect(await decide("ADVANCE")).toEqual({ ok: false, code: "WRITE_FAILED" });
    expect(store.rows[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.committed).toHaveLength(0);
  });

  it("store unavailable → STORE_UNAVAILABLE", async () => {
    h.db = null;
    expect(await decide("ADVANCE")).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
  });
});

describe("ordinary transitions — the same records, the table enforced live", () => {
  const move = (from: string, to: string, over: Record<string, unknown> = {}) => {
    const store = makeDb([{ ...GATE, status: from }]);
    h.db = store.client;
    return transitionApplication({ organizationId: "org-A", applicationId: "app-1", actor, toStatus: to as keyof typeof HUMAN_TRANSITIONS, reason: "Interview scheduled after screening call.", correlationId: "c", ...over }).then((r) => ({ r, store }));
  };

  it("the gate states are unreachable from the ordinary path in either direction", async () => {
    expect(HUMAN_TRANSITIONS.AI_REVIEW_PENDING).toEqual([]);
    expect(HUMAN_TRANSITIONS.PENDING_HUMAN_APPROVAL).toEqual([]);
    for (const [from, to] of [
      ["PENDING_HUMAN_APPROVAL", "SCREENING"],
      ["AI_REVIEW_PENDING", "SCREENING"],
      ["SCREENING", "PENDING_HUMAN_APPROVAL"],
      ["SCREENING", "AI_REVIEW_PENDING"],
    ]) {
      const { r, store } = await move(from, to);
      expect(r).toEqual({ ok: false, code: "INVALID_STATE" });
      expect(store.committed).toHaveLength(0);
    }
  });

  it("SCREENING → INTERVIEW is recorded as an ADVANCE decision with reason, event and audit", async () => {
    const { r, store } = await move("SCREENING", "INTERVIEW");
    expect(r).toMatchObject({ ok: true, fromStatus: "SCREENING", toStatus: "INTERVIEW" });
    expect(store.committed.find((w) => w.model === "atsReviewDecision")!.data).toMatchObject({ decision: "ADVANCE", reason: "Interview scheduled after screening call." });
    expect(store.committed.find((w) => w.model === "auditLog")!.data.action).toBe("recruitment.application.status_transition");
  });

  it("OFFER → REJECTED is a REJECT decision; SCREENING → HIRED is refused", async () => {
    const a = await move("OFFER", "REJECTED");
    expect(a.r).toMatchObject({ ok: true, toStatus: "REJECTED" });
    expect(a.store.committed.find((w) => w.model === "atsReviewDecision")!.data.decision).toBe("REJECT");
    const b = await move("SCREENING", "HIRED");
    expect(b.r).toEqual({ ok: false, code: "INVALID_STATE" });
  });

  it("a reason is mandatory here too", async () => {
    const { r, store } = await move("SCREENING", "INTERVIEW", { reason: " " });
    expect(r).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(store.committed).toHaveLength(0);
  });
});
