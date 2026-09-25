/**
 * ATS-M1 — the position lifecycle, as data.
 *
 *     DRAFT ──PUBLISH──▶ OPEN ──PAUSE──▶ PAUSED ──RESUME──▶ OPEN
 *                          │                 │
 *                          └──CLOSE──▶ CLOSED ◀──CLOSE──┘
 *                                        │  ▲
 *                              ARCHIVE ◀─┘  └─REOPEN (ATS_ADMIN, reason)
 *     DRAFT ──ARCHIVE──▶ ARCHIVED (terminal)
 *
 * Pure and dependency-free: the service, the routes and the dashboard all read
 * the SAME table, so a button can never offer a move the server refuses — and
 * the server never trusts that the button was the only way to ask.
 *
 * Only OPEN can ever be public. Visibility on the careers site is still decided
 * solely by `publicJobWhere` (status = OPEN, isPublic, publishedAt ≤ now, not
 * closed, not deleted); this table decides which WRITES are legal.
 *
 * Soft deletion is not a status: it sets `deletedAt` (and archives), is
 * ATS_ADMIN-only, needs a reason, and is refused while the position is OPEN —
 * close or pause it first, so a live posting never vanishes mid-intake.
 */

import type { AtsCapability } from "@/lib/ats/rbac";
import type { PositionAction, PositionStatus } from "./contract";

/** The stored enum, including the legacy value this table reads as PAUSED. */
export type StoredJobStatus = PositionStatus | "ON_HOLD";

export function canonicalStatus(stored: string): PositionStatus | null {
  switch (stored) {
    case "DRAFT":
    case "OPEN":
    case "PAUSED":
    case "CLOSED":
    case "ARCHIVED":
      return stored;
    case "ON_HOLD":
      return "PAUSED";
    default:
      return null;
  }
}

export interface TransitionRule {
  from: readonly PositionStatus[];
  to: PositionStatus;
  capability: AtsCapability;
  reasonRequired: boolean;
  /** The publish gate (readiness) must pass before the write. */
  requiresReadiness: boolean;
}

export const TRANSITIONS: Readonly<Record<PositionAction, TransitionRule>> = Object.freeze({
  PUBLISH: { from: ["DRAFT"], to: "OPEN", capability: "ATS_MANAGE", reasonRequired: false, requiresReadiness: true },
  PAUSE: { from: ["OPEN"], to: "PAUSED", capability: "ATS_MANAGE", reasonRequired: false, requiresReadiness: false },
  RESUME: { from: ["PAUSED"], to: "OPEN", capability: "ATS_MANAGE", reasonRequired: false, requiresReadiness: true },
  CLOSE: { from: ["OPEN", "PAUSED"], to: "CLOSED", capability: "ATS_MANAGE", reasonRequired: true, requiresReadiness: false },
  REOPEN: { from: ["CLOSED"], to: "OPEN", capability: "ATS_ADMIN", reasonRequired: true, requiresReadiness: true },
  ARCHIVE: { from: ["DRAFT", "CLOSED"], to: "ARCHIVED", capability: "ATS_ADMIN", reasonRequired: true, requiresReadiness: false },
});

export const SOFT_DELETE_RULE = Object.freeze({
  from: ["DRAFT", "PAUSED", "CLOSED", "ARCHIVED"] as readonly PositionStatus[],
  capability: "ATS_ADMIN" as AtsCapability,
  reasonRequired: true,
});

/** Editable states. ARCHIVED is frozen; a deleted position is not found at all. */
export const EDITABLE_STATUSES: readonly PositionStatus[] = Object.freeze(["DRAFT", "OPEN", "PAUSED", "CLOSED"]);

export type TransitionVerdict =
  | { ok: true; rule: TransitionRule; from: PositionStatus }
  | { ok: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED" };

export function checkTransition(stored: string, action: PositionAction, reason?: string | null): TransitionVerdict {
  const from = canonicalStatus(stored);
  const rule = TRANSITIONS[action];
  if (!from || !rule || !rule.from.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };
  if (rule.reasonRequired && !(typeof reason === "string" && reason.trim().length >= 5)) {
    return { ok: false, code: "REASON_REQUIRED" };
  }
  return { ok: true, rule, from };
}

export function canSoftDelete(stored: string): boolean {
  const s = canonicalStatus(stored);
  return s !== null && SOFT_DELETE_RULE.from.includes(s);
}

export function isEditable(stored: string): boolean {
  const s = canonicalStatus(stored);
  return s !== null && EDITABLE_STATUSES.includes(s);
}

/**
 * The actions an actor holding `capabilities` may attempt on a position in
 * `stored` state. Advisory for the UI; the server re-derives it per request.
 */
export function allowedActions(
  stored: string,
  capabilities: ReadonlySet<AtsCapability>,
): { transitions: PositionAction[]; canEdit: boolean; canDelete: boolean } {
  const from = canonicalStatus(stored);
  if (!from) return { transitions: [], canEdit: false, canDelete: false };
  const transitions = (Object.keys(TRANSITIONS) as PositionAction[]).filter((a) => {
    const r = TRANSITIONS[a];
    return r.from.includes(from) && capabilities.has(r.capability);
  });
  return {
    transitions,
    canEdit: capabilities.has("ATS_MANAGE") && EDITABLE_STATUSES.includes(from),
    canDelete: capabilities.has(SOFT_DELETE_RULE.capability) && SOFT_DELETE_RULE.from.includes(from),
  };
}

/** The audit action each transition writes. */
export const TRANSITION_AUDIT_ACTION = Object.freeze({
  PUBLISH: "recruitment.position.published",
  PAUSE: "recruitment.position.paused",
  RESUME: "recruitment.position.resumed",
  CLOSE: "recruitment.position.closed",
  REOPEN: "recruitment.position.reopened",
  ARCHIVE: "recruitment.position.archived",
} as const satisfies Record<PositionAction, string>);
