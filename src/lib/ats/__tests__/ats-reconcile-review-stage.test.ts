// @vitest-environment node
/**
 * ATS review-visibility hotfix — the reconciliation pass, proven WITHOUT
 * running it against anything real.
 *
 * The contracts under test:
 *   - the default is a DRY RUN: it reports, and writes absolutely nothing;
 *   - a commit run refuses outright without an operator (the audited action is
 *     a human action);
 *   - only an audit row with outcome COMPLETED whose named AtsAiReview exists
 *     is an entry point; the review ROW, not the audit metadata, drives it;
 *   - only an application in AI_REVIEW_PENDING or APPLIED is touched, only in
 *     the review's own organization, only on a matching aiReviewCycle;
 *   - a second run writes nothing — eligibility is a property of the row;
 *   - a human decision between the scan and the write wins (RACE_LOST);
 *   - every write lands in one transaction with a pipeline event and an audit
 *     row, and the audit row carries no personal content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { reconcileReviewStage, RECONCILE_TO } from "../reconcile-review-stage";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const NOW = new Date("2026-10-06T08:00:00.000Z");

interface Row {
  [k: string]: unknown;
}

function audit(over: Row = {}): Row {
  return {
    id: "audit-1",
    action: "recruitment.review.completed",
    entityType: "AtsAiReview",
    entityId: "rev-1",
    organizationId: ORG,
    outcome: "COMPLETED",
    correlationId: "corr-1",
    createdAt: new Date("2026-10-05T09:16:26.000Z"),
    metadata: { after: { applicationId: "app-1", status: RECONCILE_TO } },
    ...over,
  };
}

function review(over: Row = {}): Row {
  return { id: "rev-1", organizationId: ORG, applicationId: "app-1", cycle: 0, ...over };
}

function application(over: Row = {}): Row {
  return {
    id: "app-1",
    organizationId: ORG,
    status: "AI_REVIEW_PENDING",
    aiReviewCycle: 0,
    deletedAt: null,
    anonymizedAt: null,
    ...over,
  };
}

function makeDb(opts: {
  audits?: Row[];
  reviews?: Row[];
  applications?: Row[];
  /** Flip the application out of its scanned status at write time. */
  raceAtWrite?: boolean;
  throwOnWrite?: boolean;
}) {
  const audits = (opts.audits ?? [audit()]).map((r) => ({ ...r }));
  const reviews = (opts.reviews ?? [review()]).map((r) => ({ ...r }));
  const apps = (opts.applications ?? [application()]).map((r) => ({ ...r }));
  const writes: Array<{ model: string; data: Row }> = [];
  const committed: Array<{ model: string; data: Row }> = [];
  const auditWheres: Row[] = [];

  const tx = {
    atsApplication: {
      updateMany: async (a: { where: Row; data: Row }) => {
        const w = a.where as { id: string; organizationId: string; status: string; aiReviewCycle: number };
        const r = apps.find(
          (x) =>
            x.id === w.id &&
            x.organizationId === w.organizationId &&
            x.status === (opts.raceAtWrite ? "__never__" : w.status) &&
            x.aiReviewCycle === w.aiReviewCycle,
        );
        if (!r) return { count: 0 };
        Object.assign(r, a.data);
        writes.push({ model: "atsApplication.updateMany", data: a.data });
        return { count: 1 };
      },
    },
    atsPipelineEvent: {
      create: async (a: { data: Row }) => {
        writes.push({ model: "atsPipelineEvent", data: a.data });
        return {};
      },
    },
    auditLog: {
      create: async (a: { data: Row }) => {
        if (opts.throwOnWrite) throw new Error("db down");
        writes.push({ model: "auditLog", data: a.data });
        return { id: "audit-new" };
      },
    },
  };

  const client = {
    auditLog: {
      ...tx.auditLog,
      findMany: async (a: { where: Row; take?: number }) => {
        auditWheres.push(a.where);
        const w = a.where as { action: string; outcome: string; entityType: string; organizationId?: string };
        return audits
          .filter(
            (r) =>
              r.action === w.action &&
              r.outcome === w.outcome &&
              r.entityType === w.entityType &&
              (w.organizationId === undefined || r.organizationId === w.organizationId),
          )
          .map((r) => ({ ...r })) as never;
      },
    },
    // Every read returns a COPY, as a real client does. Handing back the live
    // row would let a later `updateMany` mutate an object the caller is still
    // reading — aliasing Prisma cannot produce, and a fake that allows it hides
    // bugs instead of finding them.
    atsAiReview: {
      findFirst: async (a: { where: { id: string; organizationId: string } }) => {
        const r = reviews.find((x) => x.id === a.where.id && x.organizationId === a.where.organizationId);
        return (r ? { ...r } : null) as never;
      },
    },
    atsApplication: {
      ...tx.atsApplication,
      findFirst: async (a: { where: { id: string; organizationId: string } }) => {
        const r = apps.find((x) => x.id === a.where.id && x.organizationId === a.where.organizationId);
        return (r ? { ...r } : null) as never;
      },
    },
    atsPipelineEvent: tx.atsPipelineEvent,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      const mark = writes.length;
      const snap = apps.map((r) => ({ ...r }));
      try {
        const out = await fn(tx);
        committed.push(...writes.slice(mark));
        return out;
      } catch (err) {
        writes.length = mark;
        apps.splice(0, apps.length, ...snap);
        throw err;
      }
    },
  };

  return { client, apps, writes, committed, auditWheres };
}

beforeEach(() => {
  h.db = null;
});

describe("the default is a dry run", () => {
  it("reports the eligible row and writes nothing at all", async () => {
    const store = makeDb({});
    h.db = store.client;

    const report = await reconcileReviewStage({ now: NOW });
    expect(report).toMatchObject({ committed: false, scanned: 1, eligible: 1, applied: 0, skipped: 0 });
    expect(report.items[0]).toMatchObject({
      organizationId: ORG,
      applicationId: "app-1",
      reviewId: "rev-1",
      fromStatus: "AI_REVIEW_PENDING",
      cycle: 0,
      eligible: true,
      applied: false,
      skipped: null,
    });
    expect(store.writes).toHaveLength(0);
    expect(store.apps[0].status).toBe("AI_REVIEW_PENDING");
  });

  it("returns storeUnavailable rather than claiming an empty estate", async () => {
    h.db = null;
    const report = await reconcileReviewStage({ now: NOW });
    expect(report).toMatchObject({ storeUnavailable: true, scanned: 0, applied: 0 });
  });

  it("an APPLIED application left behind the gate is also eligible", async () => {
    const store = makeDb({ applications: [application({ status: "APPLIED" })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ now: NOW });
    expect(report.items[0]).toMatchObject({ eligible: true, fromStatus: "APPLIED" });
    expect(store.writes).toHaveLength(0);
  });
});

describe("a commit run needs an operator", () => {
  it("refuses without actorUserId and touches nothing", async () => {
    const store = makeDb({});
    h.db = store.client;
    await expect(reconcileReviewStage({ commit: true, now: NOW })).rejects.toThrow(/actorUserId/);
    expect(store.writes).toHaveLength(0);
  });
});

describe("a commit run repairs exactly one row, once", () => {
  it("moves AI_REVIEW_PENDING → PENDING_HUMAN_APPROVAL with an event and an audit row", async () => {
    const store = makeDb({});
    h.db = store.client;

    const report = await reconcileReviewStage({
      commit: true,
      actorUserId: "user-7",
      actorRole: "ATS_ADMIN",
      reason: "incident 2026-10-05: review completed, stage not advanced",
      now: NOW,
    });

    expect(report).toMatchObject({ committed: true, scanned: 1, eligible: 1, applied: 1, skipped: 0 });
    expect(store.apps[0].status).toBe(RECONCILE_TO);

    const models = store.committed.map((w) => w.model);
    expect(models).toEqual(["atsApplication.updateMany", "atsPipelineEvent", "auditLog"]);

    const event = store.committed[1].data;
    expect(event).toMatchObject({
      organizationId: ORG,
      applicationId: "app-1",
      fromStatus: "AI_REVIEW_PENDING",
      toStatus: RECONCILE_TO,
      changedById: "user-7",
      changedByName: "OPERATOR_RECONCILIATION",
    });

    const row = store.committed[2].data;
    expect(row).toMatchObject({
      action: "recruitment.application.status_transition",
      entityType: "AtsApplication",
      entityId: "app-1",
      organizationId: ORG,
      userId: "user-7",
      outcome: "COMPLETED",
    });
    const metadata = row.metadata as { reason: string; before: Row; after: Row };
    expect(metadata.reason).toContain("incident 2026-10-05");
    expect(metadata.before).toMatchObject({ status: "AI_REVIEW_PENDING", cycle: 0 });
    expect(metadata.after).toMatchObject({ status: RECONCILE_TO, aiReviewId: "rev-1", sourceAuditLogId: "audit-1" });
  });

  it("a second run over the repaired row writes nothing (idempotent)", async () => {
    const store = makeDb({});
    h.db = store.client;
    const args = { commit: true, actorUserId: "user-7", now: NOW };

    const first = await reconcileReviewStage(args);
    expect(first.applied).toBe(1);
    const afterFirst = store.committed.length;

    const second = await reconcileReviewStage(args);
    expect(second).toMatchObject({ scanned: 1, eligible: 0, applied: 0, skipped: 1 });
    expect(second.items[0].skipped).toBe("ALREADY_AT_GATE");
    expect(store.committed).toHaveLength(afterFirst);
  });

  it("a human decision between the scan and the write wins", async () => {
    const store = makeDb({ raceAtWrite: true });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "user-7", now: NOW });
    expect(report).toMatchObject({ applied: 0, eligible: 0, skipped: 1 });
    expect(report.items[0].skipped).toBe("RACE_LOST");
    expect(store.committed).toHaveLength(0);
    expect(store.apps[0].status).toBe("AI_REVIEW_PENDING");
  });

  it("a failed write rolls the whole repair back and reports it", async () => {
    const store = makeDb({ throwOnWrite: true });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "user-7", now: NOW });
    expect(report.items[0].skipped).toBe("WRITE_FAILED");
    expect(report.applied).toBe(0);
    expect(store.committed).toHaveLength(0);
    expect(store.apps[0].status).toBe("AI_REVIEW_PENDING");
  });
});

describe("what it refuses to touch", () => {
  it("skips an audit row whose AtsAiReview does not exist", async () => {
    const store = makeDb({ reviews: [] });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
    expect(report.items[0].skipped).toBe("REVIEW_MISSING");
    expect(store.writes).toHaveLength(0);
  });

  it("never reads a review or an application outside the audit row's organization", async () => {
    // The review row lives in another tenant: the scoped findFirst misses it.
    const store = makeDb({ reviews: [review({ organizationId: OTHER_ORG })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
    expect(report.items[0].skipped).toBe("REVIEW_MISSING");
    expect(store.writes).toHaveLength(0);
  });

  it("skips when the audit metadata and the review row name different applications", async () => {
    const store = makeDb({ audits: [audit({ metadata: { after: { applicationId: "app-999" } } })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
    expect(report.items[0].skipped).toBe("APPLICATION_ID_MISMATCH");
    expect(store.writes).toHaveLength(0);
  });

  it("skips a stale review whose cycle no longer matches the application", async () => {
    const store = makeDb({ applications: [application({ aiReviewCycle: 1 })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
    expect(report.items[0].skipped).toBe("CYCLE_MISMATCH");
    expect(store.apps[0].status).toBe("AI_REVIEW_PENDING");
  });

  it("skips any application a human already moved past the gate", async () => {
    for (const status of ["SCREENING", "INTERVIEW", "REJECTED", "HIRED"]) {
      const store = makeDb({ applications: [application({ status })] });
      h.db = store.client;
      const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
      expect(report.items[0].skipped, status).toBe("NOT_ELIGIBLE");
      expect(store.apps[0].status, status).toBe(status);
    }
  });

  it("skips an erased or anonymised application", async () => {
    for (const over of [{ deletedAt: NOW }, { anonymizedAt: NOW }]) {
      const store = makeDb({ applications: [application(over)] });
      h.db = store.client;
      const report = await reconcileReviewStage({ commit: true, actorUserId: "u", now: NOW });
      expect(report.items[0].skipped).toBe("APPLICATION_ERASED");
      expect(store.writes).toHaveLength(0);
    }
  });

  it("scans only the requested organization when one is given", async () => {
    const store = makeDb({ audits: [audit(), audit({ id: "audit-2", organizationId: OTHER_ORG })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ organizationId: ORG, now: NOW });
    expect((store.auditWheres[0] as { organizationId?: string }).organizationId).toBe(ORG);
    expect(report.scanned).toBe(1);
    expect(report.items.every((i) => i.organizationId === ORG)).toBe(true);
  });

  it("scans only the requested application when one is given", async () => {
    const store = makeDb({});
    h.db = store.client;
    const report = await reconcileReviewStage({ applicationId: "app-other", now: NOW });
    expect(report).toMatchObject({ scanned: 0, eligible: 0, applied: 0 });
  });

  it("only an outcome COMPLETED review audit is ever an entry point", async () => {
    const store = makeDb({ audits: [audit({ outcome: "ATTEMPTED" })] });
    h.db = store.client;
    const report = await reconcileReviewStage({ now: NOW });
    expect(report.scanned).toBe(0);
    expect((store.auditWheres[0] as { outcome?: string }).outcome).toBe("COMPLETED");
  });
});
