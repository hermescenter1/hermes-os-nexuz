// Mirrors Prisma enum values for compile-time safety without a static import.
export type AtsJobStatus         = "DRAFT" | "OPEN" | "CLOSED" | "ON_HOLD";
export type AtsApplicationStatus = "APPLIED" | "SCREENING" | "TECHNICAL_REVIEW" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";
export type AtsInterviewType     = "PHONE_SCREEN" | "VIDEO_CALL" | "TECHNICAL" | "PANEL" | "ONSITE";
export type AtsInterviewDecision = "PENDING" | "ADVANCE" | "HOLD" | "REJECT";
