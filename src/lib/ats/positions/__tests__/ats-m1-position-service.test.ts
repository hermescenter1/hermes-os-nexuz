/**
 * ATS-M1 — the position service against an in-memory store that rolls back
 * failed transactions and enforces the unique constraints (./fake-store.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLE_PROFILES, qualifiedCriterionCode } from "@/lib/ats/review/catalog";
import { makeStore } from "./fake-store";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import {
  createInitialDrafts,
  createPosition,
  getPositionDetail,
  listPositionAudit,
  listPositions,
  softDeletePosition,
  transitionPosition,
  updatePosition,
  type MutationContext,
} from "../service";
import { applyRoleProfileToJob } from "@/lib/ats/criteria";

const MEMBERS = [
  { id: "m-hr", organizationId: "org-A", userId: "u-hr", role: "HR_MANAGER", status: "ACTIVE", name: "HR" },
  { id: "m-rec", organizationId: "org-A", userId: "u-rec", role: "RECRUITER", status: "ACTIVE", name: "Rec" },
  { id: "m-int", organizationId: "org-A", userId: "u-int", role: "INTERVIEWER", status: "ACTIVE", name: "Int" },
  { id: "m-hm", organizationId: "org-A", userId: "u-hm", role: "HIRING_MANAGER", status: "ACTIVE", name: "Hiring Manager" },
  { id: "m-gone", organizationId: "org-A", userId: "u-gone", role: "HIRING_MANAGER", status: "SUSPENDED", name: "Gone" },
  { id: "m-b", organizationId: "org-B", userId: "u-b", role: "OWNER", status: "ACTIVE", name: "Other org" },
];

let store: ReturnType<typeof makeStore>;
let keySeq = 0;
beforeEach(() => {
  store = makeStore({ members: MEMBERS });
  h.db = store.client;
});

function ctx(userId: string, role: string, org = "org-A", key?: string): MutationContext {
  return { organizationId: org, actor: { userId, role }, correlationId: `corr-${userId}`, idempotencyKey: key ?? `key-${++keySeq}-abcdef` };
}
const HR = () => ctx("u-hr", "HR_MANAGER");
const REC = () => ctx("u-rec", "RECRUITER");

const profile = ROLE_PROFILES.backend_engineer;
const criterion = (kind: string) =>
  profile.criteria
    .filter((c) => c.kind === kind)
    .map((c) => ({ code: qualifiedCriterionCode(profile.code, c.code), label: c.label, dimension: c.dimension, weight: c.weight, keywords: [...c.keywords], minYears: c.minYears ?? null, hardGate: c.hardGate }));

const minimal = () => ({
  internalTitle: "Backend (internal)",
  publicTitle: "Backend Developer",
  department: "Engineering",
  location: "Tehran",
  copy: { en: { title: "Backend Developer" }, fa: { title: "توسعه‌دهندهٔ بک‌اند" } },
});

const complete = () => ({
  ...minimal(),
  employmentType: "FULL_TIME",
  workMode: "hybrid",
  copy: {
    en: { title: "Backend Developer", summary: "Build APIs.", description: "Design and run backend services." },
    fa: { title: "توسعه‌دهندهٔ بک‌اند", summary: "ساخت رابط‌های برنامه‌نویسی.", description: "طراحی و اجرای سرویس‌های سمت سرور." },
  },
  criteria: { mustHave: criterion("MUST_HAVE"), niceToHave: criterion("NICE_TO_HAVE"), disqualifiers: criterion("DISQUALIFIER") },
  scoringRubric: { weights: { ...profile.weights } },
  interviewKit: profile.interviewKit.map((s) => ({ ...s, questions: [...s.questions], rubric: s.rubric.map((r) => ({ ...r, anchors: { ...r.anchors } })) })),
  hiringOwnerMemberId: "m-hm",
  approvalOwnerRole: "HR_MANAGER",
  decisionSlaDays: 5,
});

async function created(body: unknown = complete(), c = HR()) {
  const r = await createPosition(body, c);
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r.result;
}

const auditActions = () => store.state.audit.map((a) => a.action);

describe("create — a private DRAFT, audited, authorized, idempotent", () => {
  it("an ATS admin creates a DRAFT that is private, unpublished and in the ACTOR's organization", async () => {
    const r = await createPosition(minimal(), HR());
    expect(r.ok).toBe(true);
    const job = store.state.jobs[0];
    expect(job).toMatchObject({ organizationId: "org-A", status: "DRAFT", isPublic: false, publishedAt: null, deletedAt: null, version: 0 });
    expect(store.state.translations.map((t) => t.language).sort()).toEqual(["EN", "FA"]);
    expect(store.state.audit).toHaveLength(1);
    expect(store.state.audit[0]).toMatchObject({
      action: "recruitment.position.created",
      entityType: "AtsJob",
      entityId: job.id,
      userId: "u-hr",
      organizationId: "org-A",
      correlationId: "corr-u-hr",
      outcome: "COMPLETED",
    });
    expect((store.state.audit[0].metadata as { stage: string }).stage).toBe("M1");
  });

  it("a role without ATS_MANAGE cannot create — nothing is written, no claim survives", async () => {
    const r = await createPosition(minimal(), ctx("u-int", "INTERVIEWER"));
    expect(r).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(store.state.jobs).toHaveLength(0);
    expect(store.state.audit).toHaveLength(0);
    expect(store.state.idempotency).toHaveLength(0);
  });

  it("a role claimed by a NON-member is refused: membership is re-proven inside the transaction", async () => {
    expect(await createPosition(minimal(), ctx("u-b", "OWNER", "org-A"))).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(store.state.jobs).toHaveLength(0);
  });

  it("protected characteristics in criteria are refused before any write", async () => {
    const body = { ...minimal(), criteria: { mustHave: [{ label: "Candidates under 30 years of age", dimension: "experience" }], niceToHave: [], disqualifiers: [] } };
    const r = await createPosition(body, HR());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PROTECTED_TERM");
      expect(r.detail?.protectedTerms).toContain("age");
    }
    expect(store.state.jobs).toHaveLength(0);
  });

  it("idempotency: the same key + body replays the first result; no second position, no second audit", async () => {
    const c = HR();
    const first = await createPosition(minimal(), c);
    const again = await createPosition(minimal(), c);
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.replayed).toBe(true);
    expect(again.result).toEqual(first.result);
    expect(store.state.jobs).toHaveLength(1);
    expect(store.state.audit).toHaveLength(1);
  });

  it("idempotency: the same key with a DIFFERENT body is refused, never applied", async () => {
    const c = HR();
    await createPosition(minimal(), c);
    const r = await createPosition({ ...minimal(), publicTitle: "Something else" }, c);
    expect(r).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(store.state.jobs).toHaveLength(1);
  });

  it("a duplicate requisition key under a NEW idempotency key is a CONFLICT, rolled back", async () => {
    await created({ ...minimal(), requisitionKey: "REQ-1" });
    const r = await createPosition({ ...minimal(), requisitionKey: "REQ-1" }, HR());
    expect(r).toEqual({ ok: false, code: "CONFLICT" });
    expect(store.state.jobs).toHaveLength(1);
    expect(store.state.idempotency).toHaveLength(1);
  });

  it("a hiring owner must be an ACTIVE member of the same organization", async () => {
    for (const hiringOwnerMemberId of ["m-gone", "m-b", "nope"]) {
      expect(await createPosition({ ...minimal(), hiringOwnerMemberId }, HR())).toEqual({ ok: false, code: "HIRING_OWNER_INVALID" });
    }
    expect(store.state.jobs).toHaveLength(0);
  });
});

describe("edit — ATS_MANAGE, versioned, audited", () => {
  it("a RECRUITER (ATS_MANAGE) edits a draft; the version advances and the change is audited with before/after", async () => {
    const { jobId } = await created(minimal());
    const r = await updatePosition(jobId, { expectedVersion: 0, department: "Platform", decisionSlaDays: 7 }, REC());
    expect(r.ok).toBe(true);
    expect(store.state.jobs[0]).toMatchObject({ department: "Platform", decisionSlaDays: 7, version: 1, status: "DRAFT" });
    const audit = store.state.audit.at(-1)!;
    expect(audit).toMatchObject({ action: "recruitment.position.updated", userId: "u-rec" });
    const meta = audit.metadata as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(meta.before).toMatchObject({ department: "Engineering", decisionSlaDays: null });
    expect(meta.after).toMatchObject({ department: "Platform", decisionSlaDays: 7 });
  });

  it("a stale form is refused (409 STALE), never merged", async () => {
    const { jobId } = await created(minimal());
    await updatePosition(jobId, { expectedVersion: 0, department: "A" }, REC());
    expect(await updatePosition(jobId, { expectedVersion: 0, department: "B" }, REC())).toEqual({ ok: false, code: "STALE" });
    expect(store.state.jobs[0].department).toBe("A");
  });

  it("an INTERVIEWER cannot edit", async () => {
    const { jobId } = await created(minimal());
    expect(await updatePosition(jobId, { expectedVersion: 0, department: "X" }, ctx("u-int", "INTERVIEWER"))).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("an OPEN position cannot be edited into an unpublishable state — the whole edit rolls back", async () => {
    const { jobId } = await created();
    expect((await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR())).ok).toBe(true);
    const r = await updatePosition(jobId, { expectedVersion: 1, criteria: { mustHave: [], niceToHave: [], disqualifiers: [] } }, REC());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_READY");
    expect(store.state.criteria.length).toBeGreaterThan(0);
    expect(store.state.jobs[0].version).toBe(1);
  });
});

describe("tenant isolation", () => {
  it("another organization cannot list, read, edit, transition, delete or read the audit of a position", async () => {
    const { jobId } = await created(minimal());
    const B = ctx("u-b", "OWNER", "org-B");
    expect((await listPositions("org-B", "OWNER"))!.items).toEqual([]);
    expect(await getPositionDetail("org-B", "OWNER", jobId)).toBe("NOT_FOUND");
    expect(await listPositionAudit("org-B", jobId)).toBe("NOT_FOUND");
    expect(await updatePosition(jobId, { expectedVersion: 0, department: "X" }, B)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, B)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await softDeletePosition(jobId, { expectedVersion: 0, reason: "cleanup of test data", confirmLinkedApplications: 0 }, B)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(store.state.jobs[0]).toMatchObject({ organizationId: "org-A", department: "Engineering", status: "DRAFT", deletedAt: null });
  });
});

describe("the publish gate and the lifecycle", () => {
  it("an incomplete draft cannot be published: NOT_READY lists what is missing, nothing changes, no publish audit", async () => {
    const { jobId } = await created(minimal());
    const r = await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("NOT_READY");
      expect(r.detail?.missing).toEqual(
        expect.arrayContaining(["DESCRIPTION_EN_MISSING", "MUST_HAVE_MISSING", "DISQUALIFIER_MISSING", "RUBRIC_MISSING", "HIRING_OWNER_MISSING", "APPROVAL_OWNER_MISSING", "SLA_MISSING"]),
      );
    }
    expect(store.state.jobs[0]).toMatchObject({ status: "DRAFT", isPublic: false, publishedAt: null });
    expect(auditActions()).toEqual(["recruitment.position.created"]);
  });

  it("a complete draft publishes; pause, resume and close follow the table; every move is audited", async () => {
    const { jobId } = await created();
    const pub = await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, REC());
    expect(pub.ok).toBe(true);
    expect(store.state.jobs[0]).toMatchObject({ status: "OPEN", isPublic: true });
    expect(store.state.jobs[0].publishedAt).toBeInstanceOf(Date);
    expect((await transitionPosition(jobId, { action: "PAUSE", expectedVersion: 1 }, REC())).ok).toBe(true);
    expect(store.state.jobs[0].status).toBe("PAUSED");
    expect((await transitionPosition(jobId, { action: "RESUME", expectedVersion: 2 }, REC())).ok).toBe(true);
    expect(await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 3 }, REC())).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect((await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 3, reason: "Position filled" }, REC())).ok).toBe(true);
    expect(store.state.jobs[0].status).toBe("CLOSED");
    expect(auditActions()).toEqual([
      "recruitment.position.created",
      "recruitment.position.published",
      "recruitment.position.paused",
      "recruitment.position.resumed",
      "recruitment.position.closed",
    ]);
    const close = store.state.audit.at(-1)!.metadata as { reason: string; before: { status: string }; after: { status: string; applicationsTransitioned: number } };
    expect(close.reason).toBe("Position filled");
    expect(close.before.status).toBe("OPEN");
    expect(close.after).toMatchObject({ status: "CLOSED", applicationsTransitioned: 0 });
  });

  it("a hiring owner who stopped being ACTIVE blocks publishing", async () => {
    const { jobId } = await created();
    (store.state.members.find((m) => m.id === "m-hm")!).status = "SUSPENDED";
    const r = await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail?.missing).toContain("HIRING_OWNER_MISSING");
  });

  it("closing never moves an application — no candidate is rejected by it", async () => {
    const { jobId } = await created();
    store.state.applications.push({ id: "app-1", organizationId: "org-A", jobId, candidateId: "c-1", status: "PENDING_HUMAN_APPROVAL" });
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 1, reason: "Budget freeze" }, HR());
    expect(store.state.applications[0].status).toBe("PENDING_HUMAN_APPROVAL");
    expect(store.log.some((l) => l.model === "atsApplication")).toBe(false);
  });

  it("archive and reopen are ATS_ADMIN only", async () => {
    const { jobId } = await created();
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 1, reason: "Hiring paused" }, HR());
    expect(await transitionPosition(jobId, { action: "ARCHIVE", expectedVersion: 2, reason: "Year-end cleanup" }, REC())).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await transitionPosition(jobId, { action: "REOPEN", expectedVersion: 2, reason: "Budget approved" }, REC())).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await transitionPosition(jobId, { action: "REOPEN", expectedVersion: 2, reason: "Budget approved" }, HR())).ok).toBe(true);
    expect(store.state.jobs[0].status).toBe("OPEN");
  });
});

describe("safe delete — soft only, ATS_ADMIN, reason, confirmed linked count", () => {
  async function closedWithApplications(n: number) {
    const { jobId } = await created();
    for (let i = 0; i < n; i++) store.state.applications.push({ id: `app-${i}`, organizationId: "org-A", jobId, candidateId: `c-${i}`, status: "SCREENING" });
    store.state.interviews.push({ id: "iv-1", organizationId: "org-A", applicationId: "app-0" });
    store.state.aiReviews.push({ id: "rv-1", organizationId: "org-A", applicationId: "app-0" });
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 1, reason: "Position filled" }, HR());
    return jobId;
  }

  it("ATS_MANAGE alone cannot delete", async () => {
    const jobId = await closedWithApplications(2);
    expect(await softDeletePosition(jobId, { expectedVersion: 2, reason: "Duplicate posting", confirmLinkedApplications: 2 }, REC())).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("every destructive action requires a reason", async () => {
    const jobId = await closedWithApplications(2);
    expect(await softDeletePosition(jobId, { expectedVersion: 2, confirmLinkedApplications: 2 }, HR())).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(await softDeletePosition(jobId, { expectedVersion: 2, reason: "", confirmLinkedApplications: 2 }, HR())).toEqual({ ok: false, code: "REASON_REQUIRED" });
  });

  it("a confirmation given against a stale linked-application count is refused and reports the real count", async () => {
    const jobId = await closedWithApplications(2);
    const r = await softDeletePosition(jobId, { expectedVersion: 2, reason: "Duplicate posting", confirmLinkedApplications: 1 }, HR());
    expect(r).toEqual({ ok: false, code: "LINKED_COUNT_CHANGED", detail: { linkedApplications: 2 } });
    expect(store.state.jobs[0].deletedAt).toBeNull();
  });

  it("with linked applications the delete is SOFT: the row, every application, candidate link, review and interview stay", async () => {
    const jobId = await closedWithApplications(2);
    const r = await softDeletePosition(jobId, { expectedVersion: 2, reason: "Duplicate posting", confirmLinkedApplications: 2 }, HR());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toMatchObject({ softDeleted: true, hardDeleted: false, status: "ARCHIVED", linked: { applications: 2, interviews: 1, aiReviews: 1 } });
    expect(store.state.jobs).toHaveLength(1);
    expect(store.state.jobs[0]).toMatchObject({ status: "ARCHIVED", isPublic: false });
    expect(store.state.jobs[0].deletedAt).toBeInstanceOf(Date);
    expect(store.state.applications.map((a) => a.status)).toEqual(["SCREENING", "SCREENING"]);
    expect(store.state.interviews).toHaveLength(1);
    expect(store.state.aiReviews).toHaveLength(1);
    const audit = store.state.audit.at(-1)!;
    expect(audit).toMatchObject({ action: "recruitment.position.soft_deleted", userId: "u-hr", organizationId: "org-A", correlationId: "corr-u-hr" });
    const meta = audit.metadata as { reason: string; before: { status: string }; after: Record<string, unknown>; affectedCounts: Record<string, number> };
    expect(meta.reason).toBe("Duplicate posting");
    expect(meta.before.status).toBe("CLOSED");
    expect(meta.after).toMatchObject({ status: "ARCHIVED", deleted: true, hardDeleted: false, applicationsTouched: 0, candidatesTouched: 0 });
    expect(meta.affectedCounts).toMatchObject({ applications: 2, interviews: 1, aiReviews: 1 });
    expect(meta.affectedCounts.auditRecords).toBeGreaterThanOrEqual(3);
    // A deleted position leaves every management list.
    expect((await listPositions("org-A", "HR_MANAGER"))!.items).toEqual([]);
    // Its audit history stays readable to its own organization.
    expect(Array.isArray(await listPositionAudit("org-A", jobId))).toBe(true);
  });

  it("an OPEN position cannot be deleted — close or pause it first", async () => {
    const { jobId } = await created();
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    expect(await softDeletePosition(jobId, { expectedVersion: 1, reason: "Mistake", confirmLinkedApplications: 0 }, HR())).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("no code path issues a hard delete, and audit rows are only ever created", async () => {
    const jobId = await closedWithApplications(1);
    await softDeletePosition(jobId, { expectedVersion: 2, reason: "Duplicate posting", confirmLinkedApplications: 1 }, HR());
    expect(store.log.filter((l) => l.op === "delete")).toEqual([]);
    expect(new Set(store.log.filter((l) => l.model === "auditLog").map((l) => l.op))).toEqual(new Set(["create"]));
  });
});

describe("every successful mutation writes exactly one audit row", () => {
  it("create, edit, publish, pause, close, archive → six rows, all attributable", async () => {
    const { jobId } = await created();
    await updatePosition(jobId, { expectedVersion: 0, location: "Isfahan" }, REC());
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 1 }, HR());
    await transitionPosition(jobId, { action: "PAUSE", expectedVersion: 2 }, HR());
    await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 3, reason: "Filled internally" }, HR());
    await transitionPosition(jobId, { action: "ARCHIVE", expectedVersion: 4, reason: "Year-end cleanup" }, HR());
    expect(store.state.audit).toHaveLength(6);
    for (const a of store.state.audit) {
      expect(a.userId).toBeTruthy();
      expect(a.organizationId).toBe("org-A");
      expect(a.correlationId).toBeTruthy();
      expect(a.createdAt).toBeInstanceOf(Date);
      expect((a.metadata as { reason: string }).reason.length).toBeGreaterThan(0);
    }
    const history = await listPositionAudit("org-A", jobId);
    expect(Array.isArray(history) && history.map((e) => e.action)[0]).toBe("recruitment.position.archived");
  });
});

describe("the five initial positions", () => {
  it("an ATS admin creates them as private, unpublishable DRAFTs; a second run skips them", async () => {
    const r = await createInitialDrafts({ reason: "Initial recruitment catalogue" }, HR());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.created).toHaveLength(5);
    expect(store.state.jobs).toHaveLength(5);
    for (const j of store.state.jobs) {
      expect(j).toMatchObject({ status: "DRAFT", isPublic: false, publishedAt: null, organizationId: "org-A", hiringManagerId: null });
      const detail = await getPositionDetail("org-A", "HR_MANAGER", j.id as string);
      expect(detail !== null && detail !== "NOT_FOUND" && detail.readiness.ready).toBe(false);
      if (detail && detail !== "NOT_FOUND") {
        expect(detail.readiness.missing).toEqual(expect.arrayContaining(["HIRING_OWNER_MISSING", "DESCRIPTION_EN_MISSING", "LOCATION_MISSING"]));
        expect(detail.criteria.length).toBeGreaterThan(3);
      }
    }
    expect(store.state.audit.filter((a) => a.action === "recruitment.position.created")).toHaveLength(5);

    const again = await createInitialDrafts({ reason: "Initial recruitment catalogue" }, HR());
    expect(again.ok && again.result.created.length === 0 && again.result.skipped.length === 5).toBe(true);
    expect(store.state.jobs).toHaveLength(5);
  });

  it("requires ATS_ADMIN and a reason", async () => {
    expect(await createInitialDrafts({ reason: "Initial recruitment catalogue" }, REC())).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await createInitialDrafts({}, HR())).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(store.state.jobs).toHaveLength(0);
  });

  it("none of them can be published until completed", async () => {
    await createInitialDrafts({ reason: "Initial recruitment catalogue" }, HR());
    for (const j of store.state.jobs) {
      const r = await transitionPosition(j.id as string, { action: "PUBLISH", expectedVersion: 0 }, HR());
      expect(r.ok).toBe(false);
    }
    expect(store.state.jobs.every((j) => j.status === "DRAFT")).toBe(true);
  });
});

describe("listing reflects the actor's capabilities", () => {
  it("a RECRUITER sees edit but not archive/delete on a CLOSED position; HR sees all three", async () => {
    const { jobId } = await created();
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    await transitionPosition(jobId, { action: "CLOSE", expectedVersion: 1, reason: "Position filled" }, HR());
    const rec = (await listPositions("org-A", "RECRUITER"))!.items[0].actions;
    expect(rec).toEqual({ transitions: [], canEdit: true, canDelete: false });
    const hr = (await listPositions("org-A", "HR_MANAGER"))!.items[0].actions;
    expect(hr.canDelete).toBe(true);
    expect(hr.transitions.sort()).toEqual(["ARCHIVE", "REOPEN"]);
  });
});

describe("review fixes", () => {
  it("an Idempotency-Key is per USER: a colleague reusing it with the same body gets a conflict, never the other's result", async () => {
    const shared = "shared-key-123456";
    const a = await createPosition(minimal(), ctx("u-hr", "HR_MANAGER", "org-A", shared));
    expect(a.ok).toBe(true);
    const b = await createPosition(minimal(), ctx("u-rec", "RECRUITER", "org-A", shared));
    expect(b).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(store.state.jobs).toHaveLength(1);
  });

  it("a closing date is accepted only when a position opens (PUBLISH / REOPEN)", async () => {
    const { jobId } = await created();
    await transitionPosition(jobId, { action: "PUBLISH", expectedVersion: 0 }, HR());
    const r = await transitionPosition(jobId, { action: "PAUSE", expectedVersion: 1, closingDate: "2020-01-01T00:00:00.000Z" }, HR());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_INPUT");
    expect(store.state.jobs[0].closingDate).toBeNull();
  });

  it("switching the rubric or assessment OFF in an edit clears it (SQL NULL), and the publish gate then says so", async () => {
    const { jobId } = await created({ ...complete(), assessment: { ...ROLE_PROFILES.backend_engineer.assessment, evaluates: [...ROLE_PROFILES.backend_engineer.assessment.evaluates] } });
    const r = await updatePosition(jobId, { expectedVersion: 0, scoringRubric: null, assessment: null }, REC());
    expect(r.ok).toBe(true);
    const detail = await getPositionDetail("org-A", "HR_MANAGER", jobId);
    expect(detail !== null && detail !== "NOT_FOUND" && detail.readiness.missing).toContain("RUBRIC_MISSING");
    const { Prisma } = (await import("@prisma/client")) as unknown as { Prisma: { DbNull: unknown } };
    expect(store.state.jobs[0].scoringRubric).toBe(Prisma.DbNull);
    expect(store.state.jobs[0].assessmentConfig).toBe(Prisma.DbNull);
  });

  it("the S1 criteria writer refuses an ARCHIVED position and bumps the version, so a stale editor save is STALE", async () => {
    const { jobId } = await created();
    const applied = await applyRoleProfileToJob({ organizationId: "org-A", jobId, roleCode: "backend_engineer", actor: { userId: "u-rec", role: "RECRUITER" }, correlationId: "c-1" });
    expect(applied.ok).toBe(true);
    expect(store.state.jobs[0].version).toBe(1);
    expect(await updatePosition(jobId, { expectedVersion: 0, location: "Shiraz" }, REC())).toEqual({ ok: false, code: "STALE" });

    const archived = await created({ ...minimal(), requisitionKey: "ARCH-1" });
    await transitionPosition(archived.jobId, { action: "ARCHIVE", expectedVersion: 0, reason: "Cancelled requisition" }, HR());
    const refused = await applyRoleProfileToJob({ organizationId: "org-A", jobId: archived.jobId, roleCode: "backend_engineer", actor: { userId: "u-rec", role: "RECRUITER" }, correlationId: "c-2" });
    expect(refused).toEqual({ ok: false, code: "INVALID_STATE" });
  });
});

describe("second review — an edit never wipes translation fields the editor does not manage", () => {
  it("localized skills, a translated department label and hand-written SEO text survive an edit", async () => {
    const { jobId } = await created(minimal());
    const fa = store.state.translations.find((t) => t.language === "FA")!;
    Object.assign(fa, { localizedSkills: { plc: "برنامه‌نویسی PLC" }, departmentLabel: "مهندسی", seoTitle: "استخدام توسعه‌دهنده", seoDescription: "فرصت شغلی" });
    const r = await updatePosition(
      jobId,
      {
        expectedVersion: 0,
        copy: { en: { title: "Backend Developer II", summary: "APIs" }, fa: { title: "توسعه‌دهندهٔ بک‌اند ۲", summary: "رابط‌ها" } },
      },
      REC(),
    );
    expect(r.ok).toBe(true);
    const after = store.state.translations.find((t) => t.language === "FA")!;
    expect(after.title).toBe("توسعه‌دهندهٔ بک‌اند ۲");
    expect(after.localizedSkills).toEqual({ plc: "برنامه‌نویسی PLC" });
    expect(after.departmentLabel).toBe("مهندسی");
    expect(after.seoTitle).toBe("استخدام توسعه‌دهنده");
    expect(after.seoDescription).toBe("فرصت شغلی");
    // A still-DERIVED value follows the edit.
    const en = store.state.translations.find((t) => t.language === "EN")!;
    expect(en.seoTitle).toBe("Backend Developer II");
    expect(en.departmentLabel).toBe("Engineering");
  });
});
