/**
 * Demo / sales lead review workflow — the WRITE path.
 * Server-side only.
 *
 * This module is the single authority for whether a SalesLead status change is
 * allowed to happen. The React layer disables controls it believes are invalid,
 * but that is a UX affordance only: every transition is re-decided here against
 * the row as it exists in the database at write time.
 *
 * The vocabulary and the transition table live in `./lead-status`, which is
 * pure so the client component can import the same rules instead of keeping a
 * second copy. Only this file touches Prisma or the audit log.
 *
 * ── Why this is deliberately NOT the access-request workflow ─────────────────
 *
 * Both flows happen to land in the same `SalesLead` table (Phase 79 created it
 * for demo capture; Phase 81A reused it for the registration gate rather than
 * adding a second table). They are nonetheless two different business decisions
 * and must stay two different state machines:
 *
 *   AUTH_ACCESS_REQUEST  approve → mint a single-use account invitation
 *                                 (src/lib/auth/access-invite.ts)
 *   demo / sales lead    approve → Hermes accepts the request for commercial
 *                                 follow-up. It grants NO product access and
 *                                 never creates an invitation or a User.
 *
 * `transitionSalesLead` therefore REFUSES any row whose source is
 * AUTH_ACCESS_REQUEST, exactly as `createAccessInvite` refuses any row whose
 * source is not. Each side rejects the other's records, so neither admin
 * surface can drive the other's decision even if a client aims a request at the
 * wrong endpoint.
 */

import { getPrisma }        from "@/lib/db/prisma";
import { logger }           from "@/lib/logger";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  ACCESS_REQUEST_SOURCE,
  canTransition,
  isSalesLeadStatus,
  type SalesLeadStatus,
} from "./lead-status";

export {
  ACCESS_REQUEST_SOURCE,
  SALES_LEAD_STATUSES,
  SALES_LEAD_TRANSITIONS,
  allowedTransitions,
  canTransition,
  isSalesLeadStatus,
} from "./lead-status";
export type { SalesLeadStatus } from "./lead-status";

/** Audit action ids for this workflow (recorded through the shared service). */
export const SALES_LEAD_AUDIT = {
  STATUS_CHANGED: "sales.lead.status_changed",
} as const;

// ── Prisma structural cast (matches the access-invite.ts convention) ─────────

interface LeadModel {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
}

function leadModel(db: unknown): LeadModel {
  return (db as Record<string, unknown>).salesLead as LeadModel;
}

// ── Transition ───────────────────────────────────────────────────────────────

export type TransitionError =
  /** No such lead. */
  | "not-found"
  /** The row belongs to the account-access state machine, not this one. */
  | "access-request-lead"
  /** The move is not in the allow-list for the row's ACTUAL current status. */
  | "invalid-transition"
  /** The caller's expected previous status no longer matches the row. */
  | "stale-state"
  /** The stored status is outside the closed vocabulary — refuse to guess. */
  | "unknown-state"
  | "db-unavailable";

export type TransitionResult =
  | { ok: true;  status: SalesLeadStatus; previousStatus: SalesLeadStatus }
  | { ok: false; error: TransitionError; currentStatus?: string };

export interface TransitionInput {
  leadId:       string;
  /** Target status, already narrowed to the closed vocabulary by the route. */
  to:           SalesLeadStatus;
  /**
   * Optimistic concurrency token: the status the operator was looking at when
   * they decided. It is compared BEFORE the write and again inside the write
   * predicate, so two stale tabs cannot both apply a decision.
   */
  expectedFrom: SalesLeadStatus;
  /** Server-derived actor id. Never read from the request body. */
  adminUserId:  string;
  correlationId?: string | null;
}

/**
 * Apply an allow-listed status transition to a demo/sales lead.
 *
 * The write is a conditional `updateMany` whose predicate repeats BOTH the
 * expected previous status and the source guard. That is the concurrency
 * boundary: `count === 1` means this caller won the race, `count === 0` means
 * another administrator moved the row first and this decision is discarded
 * rather than silently overwriting theirs.
 */
export async function transitionSalesLead(input: TransitionInput): Promise<TransitionResult> {
  const { leadId, to, expectedFrom, adminUserId, correlationId } = input;

  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const lead = leadModel(db);

    // Only the three fields the decision needs. The lead's message, use case,
    // phone and email are deliberately NOT read here — nothing in this path
    // should be able to spill them into a log or an audit payload.
    const row = await lead.findUnique({
      where:  { id: leadId },
      select: { id: true, source: true, status: true },
    });
    if (!row) return { ok: false, error: "not-found" };

    // Hard separation between the two state machines.
    if (String(row.source) === ACCESS_REQUEST_SOURCE) {
      return { ok: false, error: "access-request-lead" };
    }

    const current = String(row.status ?? "");
    if (!isSalesLeadStatus(current)) {
      return { ok: false, error: "unknown-state", currentStatus: current };
    }
    if (current !== expectedFrom) {
      return { ok: false, error: "stale-state", currentStatus: current };
    }
    if (!canTransition(current, to)) {
      return { ok: false, error: "invalid-transition", currentStatus: current };
    }

    const written = await lead.updateMany({
      where: {
        id:     leadId,
        status: expectedFrom,
        // Repeated in the predicate, not just checked above: the read and the
        // write are separate statements, and a row must not be able to change
        // workflow between them.
        source: { not: ACCESS_REQUEST_SOURCE },
      },
      data: { status: to },
    });

    if (written.count !== 1) {
      // Lost the race between the read and the write. Re-read so the operator
      // is told the status that actually won rather than a bare failure.
      const fresh = await lead.findUnique({
        where:  { id: leadId },
        select: { status: true },
      });
      return {
        ok: false,
        error: "stale-state",
        currentStatus: fresh ? String(fresh.status ?? "") : undefined,
      };
    }

    // Identifiers and closed enum values only — no lead PII (no email, phone,
    // company, use case or message) reaches the audit log.
    await recordAuditEvent({
      userId:        adminUserId,
      action:        SALES_LEAD_AUDIT.STATUS_CHANGED,
      entityType:    "sales_lead",
      entityId:      leadId,
      outcome:       "success",
      correlationId: correlationId ?? null,
      metadata:      { fromStatus: expectedFrom, toStatus: to },
    });

    return { ok: true, status: to, previousStatus: expectedFrom };
  } catch (err) {
    // The lead id is an opaque cuid and is safe to correlate on; the error text
    // is stringified without any row content.
    logger.error("[sales/lead-workflow] transition error", {
      leadId,
      error: String(err),
    });
    return { ok: false, error: "db-unavailable" };
  }
}
