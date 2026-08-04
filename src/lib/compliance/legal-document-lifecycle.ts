/**
 * Phase 97 — Legal-document lifecycle (Part D). Pure, deterministic, I/O-free.
 *
 * A closed state machine governs DRAFT → IN_REVIEW → APPROVED → SCHEDULED →
 * PUBLISHED → SUPERSEDED → ARCHIVED, plus WITHDRAWN (a PUBLISHED document pulled
 * from publication WITHOUT a replacement — distinct from SUPERSEDED, which is
 * replaced by a newer version, and ARCHIVED, the terminal retired state). Every
 * transition names the permission it needs so approval and publication stay
 * separate. Content is editable ONLY while DRAFT — a published (or reviewed)
 * version is immutable in place.
 */

export type LegalDocumentLifecycle =
  | "DRAFT" | "IN_REVIEW" | "APPROVED" | "SCHEDULED"
  | "PUBLISHED" | "SUPERSEDED" | "WITHDRAWN" | "ARCHIVED";

export const LEGAL_DOCUMENT_LIFECYCLES: LegalDocumentLifecycle[] = [
  "DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "SUPERSEDED", "WITHDRAWN", "ARCHIVED",
];

/** Permission classes for lifecycle actions — approval and publication are distinct. */
export type LegalDocumentAction = "manage" | "approve" | "publish";

export const LEGAL_DOCUMENT_TRANSITIONS: Record<LegalDocumentLifecycle, LegalDocumentLifecycle[]> = {
  DRAFT:      ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW:  ["APPROVED", "DRAFT"],
  APPROVED:   ["SCHEDULED", "PUBLISHED", "DRAFT"],
  SCHEDULED:  ["PUBLISHED", "APPROVED"],
  PUBLISHED:  ["SUPERSEDED", "WITHDRAWN", "ARCHIVED"],
  SUPERSEDED: ["ARCHIVED"],
  WITHDRAWN:  ["ARCHIVED"],
  ARCHIVED:   [],
};

/** The permission class each allowed transition requires. */
const TRANSITION_ACTION: Record<string, LegalDocumentAction> = {
  "DRAFT->IN_REVIEW":     "manage",
  "DRAFT->ARCHIVED":      "manage",
  "IN_REVIEW->APPROVED":  "approve",
  "IN_REVIEW->DRAFT":     "manage",
  "APPROVED->SCHEDULED":  "manage",
  "APPROVED->PUBLISHED":  "publish",
  "APPROVED->DRAFT":      "manage",
  "SCHEDULED->PUBLISHED": "publish",
  "SCHEDULED->APPROVED":  "manage",
  "PUBLISHED->SUPERSEDED": "publish", // only ever performed transactionally by another version's publish
  "PUBLISHED->WITHDRAWN": "publish",
  "PUBLISHED->ARCHIVED":  "manage",
  "SUPERSEDED->ARCHIVED": "manage",
  "WITHDRAWN->ARCHIVED":  "manage",
};

export const TERMINAL_LEGAL_DOCUMENT_LIFECYCLES: LegalDocumentLifecycle[] = ["ARCHIVED"];
/** Content (title/content/locale/type/version/effectiveDate) may change ONLY here. */
export const CONTENT_EDITABLE_LIFECYCLES: LegalDocumentLifecycle[] = ["DRAFT"];

export function isKnownLifecycle(s: string): s is LegalDocumentLifecycle {
  return (LEGAL_DOCUMENT_LIFECYCLES as string[]).includes(s);
}

export function canTransitionLegalDocument(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = LEGAL_DOCUMENT_TRANSITIONS[from as LegalDocumentLifecycle];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}

/** The permission class a transition needs, or null if the transition is not allowed. */
export function transitionAction(from: string, to: string): LegalDocumentAction | null {
  if (!canTransitionLegalDocument(from, to)) return null;
  return TRANSITION_ACTION[`${from}->${to}`] ?? null;
}

export function isContentEditableLifecycle(s: string): boolean {
  return (CONTENT_EDITABLE_LIFECYCLES as string[]).includes(s);
}

/** Publication is only ever reachable from an approved state. */
export function isPublishable(from: string): boolean {
  return from === "APPROVED" || from === "SCHEDULED";
}
