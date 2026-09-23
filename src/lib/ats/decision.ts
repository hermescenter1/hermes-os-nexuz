/**
 * ATS-S1 — the human decision gate and every later status transition.
 *
 * THE RULE: nothing moves an application except a recorded human decision
 * with a written reason, and every such decision is one transaction holding
 *   the conditional status update (matched against the status the actor saw),
 *   the AtsReviewDecision row (actor, org, application, from, to, decision,
 *   reason, time, AI report version, correlation id),
 *   the AtsPipelineEvent row,
 *   the AuditLog row,
 * and — for RETURN_FOR_REVIEW — the next review-cycle outbox row.
 *
 * Two entry points share one core:
 *   recordGateDecision()     PENDING_HUMAN_APPROVAL → SCREENING | (hold) |
 *                            AI_REVIEW_PENDING (next cycle) | REJECTED
 *   transitionApplication()  the later, ordinary stages (SCREENING → …)
 *                            — the old PATCH /status contract, now with a
 *                            mandatory reason and the same records.
 *
 * TENANCY: the application is loaded WITH the actor's organizationId in the
 * predicate, and a miss is NOT_FOUND — the same answer for "does not exist"
 * and "belongs to another organization".
 */

import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import type { AtsApplicationStatus, AtsReviewDecisionKind } from "./db-types";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";
import { AI_REVIEW_OUTBOX_KIND } from "./intake";

export const decisionReasonSchema = z.string().trim().min(3, "a reason is required").max(2000);

export const GATE_STATUS: AtsApplicationStatus = "PENDING_HUMAN_APPROVAL";

/** Where each gate decision sends the application. `null` = stays at the gate. */
export const GATE_DECISION_TARGET: Record<AtsReviewDecisionKind, AtsApplicationStatus | null> = {
  ADVANCE: "SCREENING",
  HOLD: null,
  RETURN_FOR_REVIEW: "AI_REVIEW_PENDING",
  REJECT: "REJECTED",
};

/**
 * Human transitions for the ordinary stages. AI_REVIEW_PENDING and
 * PENDING_HUMAN_APPROVAL are deliberately EMPTY here: the first is the
 * worker's, the second goes through recordGateDecision().
 */
export const HUMAN_TRANSITIONS: Record<AtsApplicationStatus, readonly AtsApplicationStatus[]> = {
  APPLIED: ["SCREENING", "REJECTED"],
  SCREENING: ["TECHNICAL_REVIEW", "INTERVIEW", "REJECTED"],
  TECHNICAL_REVIEW: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
  OFFER: ["HIRED", "REJECTED"],
  HIRED: [],
  REJECTED: [],
  AI_REVIEW_PENDING: [],
  PENDING_HUMAN_APPROVAL: [],
};

export interface DecisionActor {
  userId: string;
  memberId?: string | null;
  role: string;
}

export type DecisionRefusal =
  | "INVALID_INPUT"
  | "STORE_UNAVAILABLE"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "STALE"
  | "WRITE_FAILED";

export type DecisionResult =
  | { ok: true; decisionId: string; fromStatus: AtsApplicationStatus; toStatus: AtsApplicationStatus; cycle: number }
  | { ok: false; code: DecisionRefusal };

interface AppRow {
  id: string;
  status: AtsApplicationStatus;
  aiReviewCycle: number;
}

type Tx = {
  atsApplication: {
    findFirst: (a: unknown) => Promise<AppRow | null>;
    updateMany: (a: unknown) => Promise<{ count: number }>;
  };
  atsAiReview: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  atsReviewDecision: { create: (a: unknown) => Promise<{ id: string }> };
  atsPipelineEvent: { create: (a: unknown) => Promise<unknown> };
  atsReviewOutbox: { create: (a: unknown) => Promise<unknown> };
  auditLog: { create: (a: unknown) => Promise<{ id: string }> };
};
type Client = Tx & { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> };

class Refusal extends Error {
  constructor(public readonly code: DecisionRefusal) {
    super(code);
  }
}

interface CoreArgs {
  organizationId: string;
  applicationId: string;
  actor: DecisionActor;
  decision: AtsReviewDecisionKind;
  expectedFrom: AtsApplicationStatus | null;
  toStatus: AtsApplicationStatus | null;
  reason: string;
  aiReviewId: string | null;
  correlationId: string;
  now: Date;
  auditAction: "recruitment.decision.recorded" | "recruitment.application.status_transition";
}

async function applyDecision(prisma: Client, a: CoreArgs): Promise<DecisionResult> {
  try {
    const out = await prisma.$transaction(async (tx) => {
      const app = await tx.atsApplication.findFirst({
        where: { id: a.applicationId, organizationId: a.organizationId, deletedAt: null },
        select: { id: true, status: true, aiReviewCycle: true },
      });
      if (!app) throw new Refusal("NOT_FOUND");
      if (a.expectedFrom && app.status !== a.expectedFrom) throw new Refusal("INVALID_STATE");

      const fromStatus = app.status;
      const toStatus = a.toStatus ?? fromStatus;
      const returning = a.decision === "RETURN_FOR_REVIEW";
      const nextCycle = returning ? app.aiReviewCycle + 1 : app.aiReviewCycle;

      // The AI report the actor says they read must belong to THIS
      // application in THIS organization, or it is not recorded at all.
      let aiReviewId: string | null = null;
      if (a.aiReviewId) {
        const r = await tx.atsAiReview.findFirst({
          where: { id: a.aiReviewId, organizationId: a.organizationId, applicationId: app.id },
          select: { id: true },
        });
        if (!r) throw new Refusal("INVALID_INPUT");
        aiReviewId = r.id;
      }

      // Conditional on the status the actor decided against. A concurrent
      // decision wins and this one is refused as STALE, never merged.
      const moved = await tx.atsApplication.updateMany({
        where: { id: app.id, organizationId: a.organizationId, status: fromStatus },
        data: { status: toStatus, ...(returning ? { aiReviewCycle: nextCycle } : {}) },
      });
      if (moved.count !== 1) throw new Refusal("STALE");

      const decision = await tx.atsReviewDecision.create({
        data: {
          organizationId: a.organizationId,
          applicationId: app.id,
          actorUserId: a.actor.userId,
          actorMemberId: a.actor.memberId ?? null,
          actorRole: a.actor.role,
          fromStatus,
          toStatus,
          decision: a.decision,
          reason: a.reason,
          aiReviewId,
          correlationId: a.correlationId,
        },
        select: { id: true },
      });

      await tx.atsPipelineEvent.create({
        data: {
          organizationId: a.organizationId,
          applicationId: app.id,
          fromStatus,
          toStatus,
          changedById: a.actor.userId,
          changedByName: null,
          notes: `decision:${a.decision} decisionId=${decision.id}`,
        },
      });

      if (returning) {
        await tx.atsReviewOutbox.create({
          data: {
            organizationId: a.organizationId,
            applicationId: app.id,
            kind: AI_REVIEW_OUTBOX_KIND,
            cycle: nextCycle,
            status: "PENDING",
            correlationId: a.correlationId,
          },
        });
      }

      const audit = await tx.auditLog.create(
        buildRecruitmentAuditCreate({
          action: a.auditAction,
          entityType: "AtsReviewDecision",
          entityId: decision.id,
          userId: a.actor.userId,
          organizationId: a.organizationId,
          correlationId: a.correlationId,
          metadata: {
            reason: a.reason,
            before: { status: fromStatus, cycle: app.aiReviewCycle },
            after: { status: toStatus, cycle: nextCycle, decision: a.decision, applicationId: app.id, aiReviewId, actorRole: a.actor.role },
            stage: "S1",
          },
        }),
      );
      void audit;

      return { decisionId: decision.id, fromStatus, toStatus, cycle: nextCycle };
    });
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, code: err.code };
    return { ok: false, code: "WRITE_FAILED" };
  }
}

export interface GateDecisionArgs {
  organizationId: string;
  applicationId: string;
  actor: DecisionActor;
  decision: AtsReviewDecisionKind;
  reason: string;
  aiReviewId?: string | null;
  correlationId: string;
  now?: Date;
}

/** A human decision at PENDING_HUMAN_APPROVAL. The only way out of the gate. */
export async function recordGateDecision(args: GateDecisionArgs): Promise<DecisionResult> {
  const reason = decisionReasonSchema.safeParse(args.reason);
  if (!reason.success) return { ok: false, code: "INVALID_INPUT" };
  if (!args.actor?.userId || !args.actor.role) return { ok: false, code: "INVALID_INPUT" };
  if (!(args.decision in GATE_DECISION_TARGET)) return { ok: false, code: "INVALID_INPUT" };

  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };

  return applyDecision(prisma, {
    organizationId: args.organizationId,
    applicationId: args.applicationId,
    actor: args.actor,
    decision: args.decision,
    expectedFrom: GATE_STATUS,
    toStatus: GATE_DECISION_TARGET[args.decision],
    reason: reason.data,
    aiReviewId: args.aiReviewId ?? null,
    correlationId: args.correlationId,
    now: args.now ?? new Date(),
    auditAction: "recruitment.decision.recorded",
  });
}

export interface TransitionArgs {
  organizationId: string;
  applicationId: string;
  actor: DecisionActor;
  toStatus: AtsApplicationStatus;
  reason: string;
  correlationId: string;
  now?: Date;
}

/** A human transition between the ordinary stages, with the same records. */
export async function transitionApplication(args: TransitionArgs): Promise<DecisionResult> {
  const reason = decisionReasonSchema.safeParse(args.reason);
  if (!reason.success) return { ok: false, code: "INVALID_INPUT" };
  if (!args.actor?.userId || !args.actor.role) return { ok: false, code: "INVALID_INPUT" };
  if (!(args.toStatus in HUMAN_TRANSITIONS)) return { ok: false, code: "INVALID_INPUT" };

  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };

  // The allowed-from check happens INSIDE the transaction against the live
  // status; here we only classify the decision kind for the record.
  const decision: AtsReviewDecisionKind = args.toStatus === "REJECTED" ? "REJECT" : "ADVANCE";

  return applyDecisionWithTable(prisma, {
    organizationId: args.organizationId,
    applicationId: args.applicationId,
    actor: args.actor,
    decision,
    expectedFrom: null,
    toStatus: args.toStatus,
    reason: reason.data,
    aiReviewId: null,
    correlationId: args.correlationId,
    now: args.now ?? new Date(),
    auditAction: "recruitment.application.status_transition",
  });
}

/** Same core, plus the HUMAN_TRANSITIONS table check against the live status. */
async function applyDecisionWithTable(prisma: Client, a: CoreArgs): Promise<DecisionResult> {
  const guarded: Client = {
    ...prisma,
    $transaction: <T,>(fn: (tx: Tx) => Promise<T>) =>
      prisma.$transaction(async (tx) => {
        const app = await tx.atsApplication.findFirst({
          where: { id: a.applicationId, organizationId: a.organizationId, deletedAt: null },
          select: { id: true, status: true, aiReviewCycle: true },
        });
        if (!app) throw new Refusal("NOT_FOUND");
        const allowed = HUMAN_TRANSITIONS[app.status] ?? [];
        if (!a.toStatus || !allowed.includes(a.toStatus)) throw new Refusal("INVALID_STATE");
        return fn(tx);
      }),
  };
  return applyDecision(guarded, a);
}
