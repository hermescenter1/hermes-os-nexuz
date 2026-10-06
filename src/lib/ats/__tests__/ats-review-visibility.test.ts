// @vitest-environment node
/**
 * ATS review-visibility hotfix — the whole chain against ONE in-memory store.
 *
 * The production incident this suite locks down: an application was received
 * at 09:16:04Z, `recruitment.review.completed` was audited at 09:16:26Z, the
 * candidate page showed one application and one AI review — and the surface
 * still said stage APPLIED, with "no audited actions yet" in the audit panel.
 *
 * Nothing was wrong with the writes. Three read-side defects were:
 *   D1 `stageOf` collapsed AI_REVIEW_PENDING and PENDING_HUMAN_APPROVAL into
 *      "applied", so every dashboard surface contradicted the database;
 *   D2 the candidate audit panel read only entityType "AtsCandidate", while
 *      intake and the review worker audit the APPLICATION and the REVIEW;
 *   D3 nothing in the product consumed the AI report at all.
 *
 * So this file runs the REAL intake, the REAL worker and the REAL aggregator
 * over one store and asserts what a recruiter would actually see, plus the
 * invariants that must survive it:
 *   §1 submit → AI pending → completed review → pending human → VISIBLE;
 *   §2 the stage gate: a failed transition makes `review.completed` impossible,
 *      and the worker writes no other status, ever;
 *   §3 replay, retry, dead-letter;
 *   §4 tenancy: another organization's read is indistinguishable from unknown;
 *   §5 no audit row carries a name, an e-mail, a phone number or résumé text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { submitApplication, AI_REVIEW_OUTBOX_KIND } from "../intake";
import { runAiReviewPass, MAX_REVIEW_ATTEMPTS } from "../review/worker";
import { ROLE_PROFILES, qualifiedCriterionCode } from "../review/catalog";
import { getAtsCandidates, getAtsOverview, getAtsPipeline, getCandidateDetail } from "../dashboard";
import type { Stage1Application } from "../stage1-schema";
import { settingsRow } from "./settings-fixture";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const JOB = "job-1";
const NOW = new Date("2026-10-05T09:16:04.000Z");
const LATER = new Date("2026-10-05T09:16:26.000Z");
const SECRET_ENV = "RECRUITMENT_IDEMPOTENCY_SECRET";
const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";

const CANDIDATE_NAME = "Jane Doe";
const CANDIDATE_EMAIL = "jane@example.org";
const CANDIDATE_PHONE = "+989120000000";
const RESUME =
  "Five years of TypeScript and Node.js on PostgreSQL with REST APIs, Docker, and CI. Deployed to production.";

const CRITERIA = ROLE_PROFILES.backend_engineer.criteria.map((c, i) => ({
  code: qualifiedCriterionCode("backend_engineer", c.code),
  label: c.label,
  kind: c.kind,
  dimension: c.dimension,
  weight: c.weight,
  keywords: [...c.keywords],
  minYears: c.minYears ?? null,
  hardGate: c.hardGate,
  sortOrder: i,
}));

interface Row {
  [k: string]: unknown;
}

/** Every `where` this suite's code under test sent, for the tenancy section. */
interface Capture {
  model: string;
  where: unknown;
}

/**
 * One in-memory store shared by the intake, the worker and the aggregator.
 *
 * It is deliberately NOT a general Prisma emulator: it honours exactly the
 * predicates these three modules send, and a predicate key it does not know
 * throws, so a silently-ignored tenant filter can never make a test pass.
 */
function makeStore(opts?: { criteria?: typeof CRITERIA; staleTransition?: boolean }) {
  const criteria = opts?.criteria ?? CRITERIA;
  const captures: Capture[] = [];
  const candidates: Row[] = [];
  const applications: Row[] = [];
  const pipelineEvents: Row[] = [];
  const outbox: Row[] = [];
  const reviews: Row[] = [];
  const decisions: Row[] = [];
  const audits: Row[] = [];
  const consents: Row[] = [];
  const idem: Row[] = [];
  const leases: Row[] = [];
  const statusWrites: string[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const KNOWN_APP_KEYS = new Set([
    "id", "organizationId", "jobId", "candidateId", "status", "aiReviewCycle",
    "deletedAt", "anonymizedAt", "candidate",
  ]);

  function matchApp(row: Row, where: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (!KNOWN_APP_KEYS.has(k)) throw new Error(`unhandled AtsApplication predicate: ${k}`);
      if (k === "candidate") {
        const cand = candidates.find((c) => c.id === row.candidateId);
        const sub = v as { deletedAt?: null };
        if ("deletedAt" in sub && (cand?.deletedAt ?? null) !== null) return false;
        continue;
      }
      if (row[k] !== v) return false;
    }
    return true;
  }

  const candidateOf = (row: Row) => candidates.find((c) => c.id === row.candidateId) ?? null;
  const jobRow = { id: JOB, organizationId: ORG, title: "Backend Engineer", department: "Engineering", status: "OPEN" };

  /** The shape the dashboard's loadApplications and the worker both read. */
  const hydrate = (row: Row) => ({
    ...row,
    candidate: candidateOf(row),
    job: { ...jobRow, criteria },
    score: null,
  });

  const tx = {
    atsOrganizationSettings: {
      findUnique: async () => settingsRow({ applicationIntakeEnabled: true }),
    },
    atsJob: {
      findFirst: async () => ({ id: JOB, organizationId: ORG }),
      findMany: async (a: { where: unknown }) => {
        captures.push({ model: "atsJob.findMany", where: a.where });
        const w = a.where as { organizationId?: string };
        return w.organizationId === ORG ? [jobRow] : [];
      },
    },
    retentionPolicy: {
      findFirst: async () => ({ id: "ret-1", retentionDays: 180, retentionTrigger: "CREATION" }),
    },
    recruitmentIdempotencyKey: {
      create: async (a: { data: Row }) => {
        const dup = idem.find(
          (r) =>
            r.organizationId === a.data.organizationId &&
            r.jobId === a.data.jobId &&
            r.keyHash === a.data.keyHash,
        );
        if (dup) throw Object.assign(new Error("dup"), { code: "P2002" });
        const row = { id: id("idem"), ...a.data };
        idem.push(row);
        return { id: row.id as string };
      },
      findUnique: async (a: { where: { organizationId_jobId_keyHash: Row } }) => {
        const k = a.where.organizationId_jobId_keyHash;
        return (
          idem.find(
            (r) => r.organizationId === k.organizationId && r.jobId === k.jobId && r.keyHash === k.keyHash,
          ) ?? null
        );
      },
      update: async (a: { where: { id: string }; data: Row }) => {
        const r = idem.find((x) => x.id === a.where.id);
        if (r) Object.assign(r, a.data);
        return r ?? {};
      },
      delete: async (a: { where: { id: string } }) => {
        const i = idem.findIndex((x) => x.id === a.where.id);
        if (i >= 0) idem.splice(i, 1);
        return {};
      },
    },
    atsCandidate: {
      findUnique: async (a: { where: { id?: string; email?: string } }) => {
        captures.push({ model: "atsCandidate.findUnique", where: a.where });
        if (a.where.email !== undefined) return candidates.find((c) => c.email === a.where.email) ?? null;
        return candidates.find((c) => c.id === a.where.id) ?? null;
      },
      create: async (a: { data: Row }) => {
        const row = { id: id("cand"), deletedAt: null, ...a.data };
        candidates.push(row);
        return { id: row.id as string };
      },
    },
    atsApplication: {
      findFirst: async (a: { where: Record<string, unknown> }) => {
        captures.push({ model: "atsApplication.findFirst", where: a.where });
        const r = applications.find((x) => matchApp(x, a.where));
        return r ? hydrate(r) : null;
      },
      findMany: async (a: { where: Record<string, unknown>; take?: number }) => {
        captures.push({ model: "atsApplication.findMany", where: a.where });
        const rows = applications
          .filter((x) => matchApp(x, a.where))
          .sort((p, q) => (q.createdAt as Date).getTime() - (p.createdAt as Date).getTime())
          .map(hydrate);
        return a.take ? rows.slice(0, a.take) : rows;
      },
      create: async (a: { data: Row }) => {
        const row = { id: id("app"), deletedAt: null, anonymizedAt: null, createdAt: NOW, ...a.data };
        applications.push(row);
        return { id: row.id as string };
      },
      update: async (a: { where: { id: string }; data: Row }) => {
        const r = applications.find((x) => x.id === a.where.id);
        if (!r) throw new Error("no application");
        if (typeof a.data.status === "string") statusWrites.push(a.data.status);
        Object.assign(r, a.data);
        return r;
      },
      updateMany: async (a: { where: Record<string, unknown>; data: Row }) => {
        if (opts?.staleTransition) return { count: 0 };
        const hits = applications.filter((x) => matchApp(x, a.where));
        for (const r of hits) {
          if (typeof a.data.status === "string") statusWrites.push(a.data.status);
          Object.assign(r, a.data);
        }
        return { count: hits.length };
      },
    },
    consentRecord: { create: async (a: { data: Row }) => { consents.push(a.data); return {}; } },
    atsPipelineEvent: { create: async (a: { data: Row }) => { pipelineEvents.push(a.data); return {}; } },
    atsInterview: {
      count: async (a: { where: Record<string, unknown> }) => {
        captures.push({ model: "atsInterview.count", where: a.where });
        return 0;
      },
    },
    atsAiReview: {
      create: async (a: { data: Row }) => {
        const row = { id: id("rev"), createdAt: LATER, ...a.data };
        reviews.push(row);
        return { id: row.id as string };
      },
      count: async (a: { where: { organizationId?: string; applicationId?: { in: string[] } } }) => {
        captures.push({ model: "atsAiReview.count", where: a.where });
        return reviews.filter(
          (r) =>
            r.organizationId === a.where.organizationId &&
            (a.where.applicationId?.in ?? []).includes(r.applicationId as string),
        ).length;
      },
      findMany: async (a: { where: { organizationId?: string; applicationId?: { in: string[] } } }) => {
        captures.push({ model: "atsAiReview.findMany", where: a.where });
        return reviews
          .filter(
            (r) =>
              r.organizationId === a.where.organizationId &&
              (a.where.applicationId?.in ?? []).includes(r.applicationId as string),
          )
          .map((r) => ({ id: r.id as string }));
      },
      findFirst: async (a: { where: { organizationId?: string; applicationId?: string } }) => {
        captures.push({ model: "atsAiReview.findFirst", where: a.where });
        const hits = reviews
          .filter((r) => r.organizationId === a.where.organizationId && r.applicationId === a.where.applicationId)
          .sort((p, q) => (q.cycle as number) - (p.cycle as number));
        return hits[0] ? ({ ...hits[0] } as never) : null;
      },
    },
    atsReviewDecision: {
      findMany: async (a: { where: { organizationId?: string; applicationId?: { in: string[] } } }) => {
        captures.push({ model: "atsReviewDecision.findMany", where: a.where });
        return decisions
          .filter(
            (r) =>
              r.organizationId === a.where.organizationId &&
              (a.where.applicationId?.in ?? []).includes(r.applicationId as string),
          )
          .map((r) => ({ id: r.id as string }));
      },
    },
    atsReviewOutbox: {
      create: async (a: { data: Row }) => {
        outbox.push({ id: id("ob"), attempts: 0, nextAttemptAt: NOW, lastErrorCode: null, aiReviewId: null, ...a.data });
        return {};
      },
      // A COPY, like every Prisma read. Returning the live row would let the
      // conditional claim's `attempts: { increment: 1 }` be visible to the
      // caller's own `row.attempts + 1`, which is exactly the aliasing a real
      // client cannot produce — and the worker's retry budget would be read
      // one attempt ahead of the truth.
      findMany: async (a: { where: { kind: string; status: { in: string[] }; nextAttemptAt: { lte: Date } } }) =>
        outbox
          .filter(
            (r) =>
              r.kind === a.where.kind &&
              a.where.status.in.includes(r.status as string) &&
              (r.nextAttemptAt as Date).getTime() <= a.where.nextAttemptAt.lte.getTime(),
          )
          .map((r) => ({ ...r })),
      updateMany: async (a: { where: { id: string; status: string | { in: string[] } }; data: Row }) => {
        const r = outbox.find((x) => x.id === a.where.id);
        if (!r) return { count: 0 };
        const ok =
          typeof a.where.status === "string"
            ? r.status === a.where.status
            : a.where.status.in.includes(r.status as string);
        if (!ok) return { count: 0 };
        const { attempts, ...rest } = a.data as { attempts?: { increment: number } } & Row;
        Object.assign(r, rest);
        if (attempts?.increment) r.attempts = (r.attempts as number) + attempts.increment;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (a: { data: Row }) => {
        const row = { id: id("audit"), createdAt: LATER, ...a.data };
        audits.push(row);
        return { id: row.id as string };
      },
      findMany: async (a: { where: Record<string, unknown>; take?: number }) => {
        captures.push({ model: "auditLog.findMany", where: a.where });
        const w = a.where as { organizationId?: string; OR?: Array<Record<string, unknown>> };
        const branches = w.OR ?? [];
        const hit = audits.filter((r) => {
          if (r.organizationId !== w.organizationId) return false;
          return branches.some((b) => {
            if (r.entityType !== b.entityType) return false;
            const want = b.entityId as string | { in: string[] };
            return typeof want === "string" ? r.entityId === want : want.in.includes(r.entityId as string);
          });
        });
        const rows = hit
          .sort((p, q) => (q.createdAt as Date).getTime() - (p.createdAt as Date).getTime())
          .map((r) => ({ ...r }));
        return (a.take ? rows.slice(0, a.take) : rows) as never;
      },
    },
  };

  const workerLease = {
    findFirst: async (a: { where: { name: string } }) => leases.find((l) => l.name === a.where.name) ?? null,
    create: async (a: { data: Row }) => {
      if (leases.some((l) => l.name === a.data.name)) throw Object.assign(new Error("dup"), { code: "P2002" });
      leases.push({ ...a.data });
      return { ...a.data };
    },
    updateMany: async (a: { where: Row; data: Row }) => {
      const hit = leases.filter(
        (l) =>
          l.name === a.where.name &&
          (a.where.holder === undefined || l.holder === a.where.holder) &&
          (a.where.fencingToken === undefined || Number(l.fencingToken) === Number(a.where.fencingToken)) &&
          (a.where.expiresAt === undefined ||
            (l.expiresAt as Date).getTime() === new Date(a.where.expiresAt as Date).getTime()),
      );
      hit.forEach((l) => Object.assign(l, a.data));
      return { count: hit.length };
    },
  };

  const client = {
    ...tx,
    workerLease,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      const snap = {
        applications: applications.map((r) => ({ ...r })),
        reviews: reviews.length,
        audits: audits.length,
        events: pipelineEvents.length,
        consents: consents.length,
        outbox: outbox.map((r) => ({ ...r })),
        statusWrites: statusWrites.length,
      };
      try {
        return await fn(tx);
      } catch (err) {
        applications.splice(0, applications.length, ...snap.applications);
        outbox.splice(0, outbox.length, ...snap.outbox);
        reviews.length = snap.reviews;
        audits.length = snap.audits;
        pipelineEvents.length = snap.events;
        consents.length = snap.consents;
        statusWrites.length = snap.statusWrites;
        throw err;
      }
    },
  };

  return { client, candidates, applications, pipelineEvents, outbox, reviews, decisions, audits, captures, statusWrites };
}

const application = (over: Partial<Stage1Application> = {}): Stage1Application => ({
  jobId: JOB,
  fullName: CANDIDATE_NAME,
  email: CANDIDATE_EMAIL,
  phone: CANDIDATE_PHONE,
  currentLocation: "Isfahan, Iran",
  keySkills: ["TypeScript", "PostgreSQL"],
  yearsExperience: 5,
  resumeText: RESUME,
  privacyNoticeAcknowledged: true,
  accuracyConfirmed: true,
  ...over,
});

const submit = (store: ReturnType<typeof makeStore>, key = KEY) => {
  h.db = store.client;
  return submitApplication({
    app: application(),
    rawIdempotencyKey: key,
    locale: "en",
    correlationId: "corr-1",
    now: NOW,
  });
};

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

/* ───────────────────────── §1 the whole chain ──────────────────────────── */

describe("§1 submit → pending AI → completed review → pending human → visible", () => {
  it("ends at PENDING_HUMAN_APPROVAL and the candidate page shows the real result", async () => {
    const store = makeStore();

    const intake = await submit(store);
    expect(intake.ok).toBe(true);
    // The intake ends at the gate — never further, never at APPLIED.
    expect(store.applications[0].status).toBe("AI_REVIEW_PENDING");
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]).toMatchObject({ kind: AI_REVIEW_OUTBOX_KIND, status: "PENDING", cycle: 0 });
    expect(store.audits.map((a) => a.action)).toContain("recruitment.application.received");

    const pass = await runAiReviewPass({ now: LATER });
    expect(pass).toMatchObject({ acquired: true, claimed: 1, delivered: 1, retrying: 0, deadLettered: 0 });
    expect(store.applications[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.reviews).toHaveLength(1);
    expect(store.outbox[0].status).toBe("DELIVERED");
    expect(store.audits.map((a) => a.action)).toContain("recruitment.review.completed");

    const candidateId = store.candidates[0].id as string;
    const detail = await getCandidateDetail(ORG, candidateId);
    expect(detail).not.toBeNull();

    // D1 — the stage is the state the row actually holds, not "applied".
    expect(detail!.stage).toBe("pending-approval");
    expect(detail!.latestApplication).toMatchObject({
      status: "PENDING_HUMAN_APPROVAL",
      stage: "pending-approval",
      awaitingHumanDecision: true,
    });

    // D3 — the review result is on the page: score, confidence, dimensions,
    // evidence, versions, completion time and the human-decision requirement.
    const review = detail!.latestReview!;
    expect(review).not.toBeNull();
    expect(review.id).toBe(store.reviews[0].id);
    expect(review.confidence).toBeTypeOf("number");
    expect(review.recommendation).toBeTruthy();
    expect(review.dimensionScores.length).toBeGreaterThan(0);
    expect(review.hardGateResults.length).toBeGreaterThan(0);
    expect(review.evidence.length).toBeGreaterThan(0);
    expect(review.evidence[0].quote).toBeTruthy();
    expect(review.versions.extractor).toBeTruthy();
    expect(review.versions.rubric).toBeTruthy();
    expect(review.versions.prompt).toBeTruthy();
    expect(review.versions.policy).toBeTruthy();
    expect(review.completedAt).toBe(LATER.toISOString());
    expect(review.requiresHumanDecision).toBe(true);
    expect(detail!.counts).toMatchObject({ applications: 1, reviews: 1 });

    // D2 — the audit panel aggregates the application and review trails.
    const actions = detail!.audit.map((a) => a.action);
    expect(actions).toContain("recruitment.application.received");
    expect(actions).toContain("recruitment.review.completed");
    expect(detail!.audit.map((a) => a.entityType)).toEqual(
      expect.arrayContaining(["AtsApplication", "AtsAiReview"]),
    );
  });

  it("the candidate list, the pipeline and the overview all report the real status", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    const rows = await getAtsCandidates(ORG);
    expect(rows!.map((r) => r.stage)).toEqual(["pending-approval"]);

    // The stage filter must accept the new vocabulary, not fall back to "all".
    expect(await getAtsCandidates(ORG, { stage: "pending-approval" })).toHaveLength(1);
    expect(await getAtsCandidates(ORG, { stage: "applied" })).toHaveLength(0);

    const pipeline = await getAtsPipeline(ORG);
    const byStage = new Map(pipeline!.map((c) => [c.stage, c.count]));
    expect(byStage.get("pending-approval")).toBe(1);
    // The regression itself: this used to be 1.
    expect(byStage.get("applied")).toBe(0);
    expect(pipeline!.map((c) => c.stage)).toEqual([
      "applied", "ai-review", "pending-approval", "screening", "technical-review",
      "interview", "offer", "hired", "rejected",
    ]);

    const overview = await getAtsOverview(ORG);
    expect(overview!.byStage["pending-approval"]).toBe(1);
    expect(overview!.byStage.applied).toBe(0);
  });

  it("an application still waiting for the worker reports ai-review, not applied", async () => {
    const store = makeStore();
    await submit(store);

    const candidateId = store.candidates[0].id as string;
    const detail = await getCandidateDetail(ORG, candidateId);
    expect(detail!.stage).toBe("ai-review");
    expect(detail!.latestApplication!.status).toBe("AI_REVIEW_PENDING");
    expect(detail!.latestApplication!.awaitingHumanDecision).toBe(false);
    // No review has completed, so the panel says so rather than inventing one.
    expect(detail!.latestReview).toBeNull();
  });
});

/* ──────────────────────── §2 the stage-gate contract ──────────────────────── */

describe("§2 the atomic contract", () => {
  it("recruitment.review.completed is impossible when the transition matches zero rows", async () => {
    const store = makeStore({ staleTransition: true });
    await submit(store);
    store.audits.length = 0;

    const pass = await runAiReviewPass({ now: LATER });
    expect(pass).toMatchObject({ claimed: 1, delivered: 0, retrying: 1 });

    // Nothing from inside the transaction survived.
    expect(store.reviews).toHaveLength(0);
    expect(store.audits.map((a) => a.action)).not.toContain("recruitment.review.completed");
    // The failure IS recorded, and the application is left in a visible state.
    const failed = store.audits.find((a) => a.action === "recruitment.review.failed")!;
    expect(failed).toBeDefined();
    expect(JSON.stringify(failed.metadata)).toContain("STALE_STATE");
    expect(store.applications[0].status).toBe("AI_REVIEW_PENDING");
    expect(store.outbox[0]).toMatchObject({ status: "RETRYING", lastErrorCode: "STALE_STATE" });
  });

  it("the worker writes PENDING_HUMAN_APPROVAL and no other status, ever", async () => {
    const store = makeStore();
    await submit(store);
    // statusWrites records every status UPDATE (not the APPLIED on insert), so
    // the intake contributes exactly one: the move onto the gate.
    expect(store.statusWrites).toEqual(["AI_REVIEW_PENDING"]);

    await runAiReviewPass({ now: LATER });
    expect(store.statusWrites).toEqual(["AI_REVIEW_PENDING", "PENDING_HUMAN_APPROVAL"]);
  });

  it("no accept or reject decision is taken automatically", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    // A recommendation is produced; a DECISION is not.
    expect(store.reviews[0].recommendation).toBeTruthy();
    expect(store.decisions).toHaveLength(0);
    expect(store.applications[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.audits.map((a) => a.action)).not.toContain("recruitment.decision.recorded");
  });
});

/* ─────────────────── §3 replay, retry and dead-letter ───────────────────── */

describe("§3 failure, retry, dead-letter and idempotent replay", () => {
  it("a second pass over a delivered row delivers nothing", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    const again = await runAiReviewPass({ now: new Date(LATER.getTime() + 60_000) });
    expect(again).toMatchObject({ claimed: 0, delivered: 0, retrying: 0, deadLettered: 0 });
    expect(store.reviews).toHaveLength(1);
    expect(store.audits.filter((a) => a.action === "recruitment.review.completed")).toHaveLength(1);
    expect(store.applications[0].status).toBe("PENDING_HUMAN_APPROVAL");
  });

  it("a repeated intake with the same key and payload writes no second application", async () => {
    const store = makeStore();
    const first = await submit(store);
    const second = await submit(store);

    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.replay).toBe(true);
    expect(second.ok && second.reference).toBe(first.ok ? first.reference : "");
    expect(store.applications).toHaveLength(1);
    expect(store.outbox).toHaveLength(1);
  });

  it("a review that cannot be produced retries with backoff, then dead-letters, leaving AI_REVIEW_PENDING", async () => {
    // No criteria on the job → the engine refuses; the application is untouched.
    const store = makeStore({ criteria: [] });
    await submit(store);

    for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt++) {
      // Each pass must run at or after the row's own nextAttemptAt.
      const at = new Date(Math.max(LATER.getTime(), (store.outbox[0].nextAttemptAt as Date).getTime()));
      const pass = await runAiReviewPass({ now: at });
      expect(pass.claimed).toBe(1);
      expect(pass.delivered).toBe(0);
      expect(store.outbox[0].attempts).toBe(attempt);
      expect(store.outbox[0].status).toBe(attempt >= MAX_REVIEW_ATTEMPTS ? "DEAD_LETTER" : "RETRYING");
      expect(store.applications[0].status).toBe("AI_REVIEW_PENDING");
      expect(store.reviews).toHaveLength(0);
    }

    // A dead-lettered row is never picked up again.
    const after = await runAiReviewPass({ now: new Date(LATER.getTime() + 86_400_000) });
    expect(after).toMatchObject({ claimed: 0, delivered: 0, deadLettered: 0 });
    expect(store.audits.filter((a) => a.action === "recruitment.review.failed")).toHaveLength(MAX_REVIEW_ATTEMPTS);
  });
});

/* ───────────────────────────── §4 tenancy ───────────────────────────────── */

describe("§4 tenant isolation", () => {
  it("another organization's read of the same candidate is null — the route's 404", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    const candidateId = store.candidates[0].id as string;
    expect(await getCandidateDetail(OTHER_ORG, candidateId)).toBeNull();
    expect(await getAtsCandidates(OTHER_ORG)).toEqual([]);
    expect((await getAtsPipeline(OTHER_ORG))!.every((c) => c.count === 0)).toBe(true);
  });

  it("an unknown candidate id is the same null as a cross-tenant one", async () => {
    const store = makeStore();
    await submit(store);
    expect(await getCandidateDetail(ORG, "cand-does-not-exist")).toBeNull();
  });

  it("every candidate-detail query carries organizationId", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });
    const candidateId = store.candidates[0].id as string;

    store.captures.length = 0;
    await getCandidateDetail(ORG, candidateId);

    const scoped = store.captures.filter((c) => c.model !== "atsCandidate.findUnique");
    expect(scoped.length).toBeGreaterThan(0);
    for (const c of scoped) {
      expect((c.where as { organizationId?: string }).organizationId, c.model).toBe(ORG);
    }
    // The candidate itself carries no organization of its own, so it is reached
    // only AFTER an application in this organization has been found.
    const byId = store.captures.filter((c) => c.model === "atsCandidate.findUnique");
    expect(byId).toHaveLength(1);
  });
});

/* ───────────────────────── §5 no PII in the audit ───────────────────────── */

describe("§5 the audit trail carries identifiers, never personal content", () => {
  it("no recruitment audit row contains the name, e-mail, phone or résumé text", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    expect(store.audits.length).toBeGreaterThan(1);
    for (const row of store.audits) {
      const blob = JSON.stringify(row);
      expect(blob, String(row.action)).not.toContain(CANDIDATE_EMAIL);
      expect(blob, String(row.action)).not.toContain(CANDIDATE_NAME);
      expect(blob, String(row.action)).not.toContain(CANDIDATE_PHONE);
      expect(blob, String(row.action)).not.toContain(RESUME.slice(0, 30));
    }
  });

  it("the review audit records the outcome and the versions, not the evidence", async () => {
    const store = makeStore();
    await submit(store);
    await runAiReviewPass({ now: LATER });

    const completed = store.audits.find((a) => a.action === "recruitment.review.completed")!;
    const after = (completed.metadata as { after: Record<string, unknown> }).after;
    expect(after.status).toBe("PENDING_HUMAN_APPROVAL");
    expect(after.versions).toBeTruthy();
    // The quotes live in AtsAiReview.report, which the audit never copies.
    expect(JSON.stringify(completed.metadata)).not.toContain("quote");
  });
});
