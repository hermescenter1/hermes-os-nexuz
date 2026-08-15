/**
 * Demo / sales lead status vocabulary and transition table.
 *
 * PURE — no database, no logger, no audit, no server-only import of any kind.
 * The admin review controls are a client component, so the rule set it uses to
 * decide which buttons to offer has to be importable from the browser bundle.
 * Keeping it here means the UI and the API read from ONE table instead of two
 * copies that can drift; `src/lib/sales/lead-workflow.ts` is the server half
 * that actually applies a transition, and it is the security boundary.
 *
 * ── Vocabulary provenance ────────────────────────────────────────────────────
 *
 * These six values are exactly the ones the admin leads page already renders
 * (`STATUS_CLS` in src/app/[locale]/admin/leads/page.tsx). Nothing new is
 * introduced, and `SalesLead.status` stays a plain String column — this
 * workflow needs no Prisma migration.
 */

/** Source tag written by /api/auth/access-request — the OTHER state machine. */
export const ACCESS_REQUEST_SOURCE = "AUTH_ACCESS_REQUEST";

/** The closed status vocabulary. Anything outside this set is not a status. */
export const SALES_LEAD_STATUSES = [
  "NEW",
  "REVIEWED",
  "CONTACTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

export type SalesLeadStatus = (typeof SALES_LEAD_STATUSES)[number];

export function isSalesLeadStatus(v: unknown): v is SalesLeadStatus {
  return typeof v === "string" && (SALES_LEAD_STATUSES as readonly string[]).includes(v);
}

/**
 * The allow-list. A transition not named here does not exist — including every
 * self-transition, so re-clicking a control cannot rewrite an already-recorded
 * decision or emit a duplicate audit entry.
 *
 *   NEW       → REVIEWED   the administrator has intaken the request
 *   REVIEWED  → CONTACTED  the factory has been contacted
 *   CONTACTED → APPROVED   commercial/demo follow-up is accepted
 *   APPROVED  → CLOSED     the demo/sales process is finished
 *
 * REJECTED is reachable from any pre-decision state (NEW, REVIEWED, CONTACTED).
 * REJECTED and CLOSED are TERMINAL: a decided lead is never resurrected by a
 * stale browser tab, which is the concurrency property this table encodes.
 */
export const SALES_LEAD_TRANSITIONS: Record<SalesLeadStatus, readonly SalesLeadStatus[]> = {
  NEW:       ["REVIEWED", "REJECTED"],
  REVIEWED:  ["CONTACTED", "REJECTED"],
  CONTACTED: ["APPROVED", "REJECTED"],
  APPROVED:  ["CLOSED"],
  REJECTED:  [],
  CLOSED:    [],
};

export function canTransition(from: SalesLeadStatus, to: SalesLeadStatus): boolean {
  return SALES_LEAD_TRANSITIONS[from].includes(to);
}

/** Transitions an operator may take from a given state, in display order. */
export function allowedTransitions(from: SalesLeadStatus): readonly SalesLeadStatus[] {
  return SALES_LEAD_TRANSITIONS[from];
}
