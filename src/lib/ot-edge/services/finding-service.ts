// PHASE 94B3.3 — finding review.
//
// The decision of WHETHER a transition is legal belongs to the centralized
// matrix; this service only enforces authorization, scope and note bounds, then
// asks the repository to apply it as a compare-and-set. Two reviewers racing on
// the same finding therefore cannot both win, and neither can silently
// overwrite the other — the loser is told the finding moved.
//
// A NOOP emits no audit event. Emitting one would make a double-click look like
// two independent human decisions in the record.

import { authorize, type OtServiceContext } from "../service-context";
import {
  evaluateTransition,
  buildReviewPatch,
  MAX_REVIEW_NOTE,
  TRANSITION_AUDIT,
  type FindingState,
} from "../finding-workflow";
import { record as recordMetric, type MetricSink } from "../metrics";
import { toEngineeringFindingDto } from "../dto";
import type { EngineeringFindingRepository } from "../persistence/ports";
import {
  fromRepo,
  svcFail,
  svcOk,
  type AuditPort,
  type OtAuditAction,
  type ServiceResult,
} from "./core";

export interface TransitionOutcomeDto {
  finding: ReturnType<typeof toEngineeringFindingDto>;
  applied: boolean;
  previousState: string;
}

export interface FindingServiceDeps {
  findings: EngineeringFindingRepository;
  audit: AuditPort;
  metrics: MetricSink;
  now?: () => Date;
}

export function createFindingService(deps: FindingServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async transitionFinding(
      ctx: OtServiceContext,
      findingId: string,
      targetState: string,
      reviewNote?: string | null,
    ): Promise<ServiceResult<TransitionOutcomeDto>> {
      const denied = authorize(ctx, "review_engineering_finding");
      if (denied) return svcFail("FORBIDDEN");

      if (reviewNote != null && reviewNote.length > MAX_REVIEW_NOTE * 4) {
        // Reject an absurd note outright rather than silently truncating
        // megabytes of caller data.
        return svcFail("VALIDATION_FAILED", "review note is too long");
      }

      // Scoped read: a foreign finding is NOT_FOUND, never "forbidden".
      const current = await deps.findings.findVisibleById(ctx, findingId);
      if (!current.ok) return fromRepo(current);
      const previousState = current.value.status;

      const verdict = evaluateTransition(previousState, targetState);
      if (!verdict.ok) {
        return verdict.reason === "UNKNOWN_STATE"
          ? svcFail("VALIDATION_FAILED", "unknown finding state")
          : svcFail("CONFLICT", "transition is not permitted from the current state");
      }

      if (verdict.kind === "NOOP") {
        // Idempotent: no write, no audit, no metric.
        return svcOk({
          finding: toEngineeringFindingDto(current.value as never),
          applied: false,
          previousState,
        });
      }

      const patch = buildReviewPatch({
        to: targetState as FindingState,
        reviewedById: ctx.userId,
        reviewedAt: now(),
        reviewNote,
      });

      const applied = await deps.findings.transitionAtomically(ctx, findingId, {
        expectedStatus: previousState,
        nextStatus: patch.state,
        reviewedById: patch.reviewedById,
        reviewedAt: patch.reviewedAt,
      });
      if (!applied.ok) return fromRepo(applied);

      if (applied.value.outcome === "NOOP") {
        return svcOk({
          finding: toEngineeringFindingDto(applied.value.record as never),
          applied: false,
          previousState,
        });
      }

      const action = TRANSITION_AUDIT[patch.state];
      if (action) {
        await deps.audit.record({
          action: action as OtAuditAction,
          actorId: ctx.userId,
          entityType: "EngineeringFinding",
          entityId: findingId,
          metadata: {
            organizationId: ctx.organizationId,
            findingId,
            projectId: applied.value.record.projectId,
            state: patch.state,
            previousState,
          },
        });
      }
      recordMetric(deps.metrics, "ot_finding_transition", 1, { outcome: "ok" });

      return svcOk({
        finding: toEngineeringFindingDto(applied.value.record as never),
        applied: true,
        previousState,
      });
    },
  };
}

export type EngineeringFindingService = ReturnType<typeof createFindingService>;
