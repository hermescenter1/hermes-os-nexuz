// Mirrors Prisma enum values for compile-time safety without a static import.
// ATS-M1 — PAUSED and ARCHIVED appended; ON_HOLD is the legacy pause, read as PAUSED.
export type AtsJobStatus         = "DRAFT" | "OPEN" | "CLOSED" | "ON_HOLD" | "PAUSED" | "ARCHIVED";
// ATS-B2/S1 — AI_REVIEW_PENDING and PENDING_HUMAN_APPROVAL are the stage gate.
export type AtsApplicationStatus =
  | "APPLIED"
  | "SCREENING"
  | "TECHNICAL_REVIEW"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "AI_REVIEW_PENDING"
  | "PENDING_HUMAN_APPROVAL";
export type AtsInterviewType     = "PHONE_SCREEN" | "VIDEO_CALL" | "TECHNICAL" | "PANEL" | "ONSITE";
export type AtsInterviewDecision = "PENDING" | "ADVANCE" | "HOLD" | "REJECT";
export type AtsCriterionKind     = "MUST_HAVE" | "NICE_TO_HAVE" | "DISQUALIFIER";
export type AtsAiRecommendation  = "ADVANCE" | "REVIEW_REQUIRED" | "HOLD" | "REJECT_RECOMMENDED";
export type AtsReviewDecisionKind = "ADVANCE" | "HOLD" | "RETURN_FOR_REVIEW" | "REJECT";
export type AtsReviewOutboxStatus = "PENDING" | "CLAIMED" | "RETRYING" | "DELIVERED" | "DEAD_LETTER";
