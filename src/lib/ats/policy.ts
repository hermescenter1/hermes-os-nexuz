/**
 * ATS-B2 / ATS-S1 — recruitment policy and configuration, in ONE place.
 *
 * Everything here is either a VERSION LABEL (stored beside every record it
 * governs, so a report can be reproduced) or an ENVIRONMENT-RESOLVED setting
 * with a fail-closed default. Nothing here is a business duration: retention
 * is read from the organization's APPROVED RetentionPolicy at intake, never
 * from a constant (see `intake.ts`).
 *
 * Dependency-free on purpose — importable from a route, a worker, a client
 * bundle and a test without dragging Prisma along.
 */

/** The privacy-notice / attestation text version an applicant acknowledges. */
export const RECRUITMENT_CONSENT_VERSION = "2026-09-ats-b2";

/** Version labels stamped on every AI review row. */
export const ATS_EXTRACTOR_VERSION = "deterministic-1.0";
export const ATS_RUBRIC_VERSION = "hermes-5-roles-1.0";
export const ATS_PROMPT_VERSION = "ats-review-prompt-1.0";
export const ATS_POLICY_VERSION = "stage-gate-1.0";

/** Environment variable NAMES (values are never read here). */
export const ENV = {
  /** HMAC secret binding an idempotency claim to its payload. REQUIRED for intake. */
  IDEMPOTENCY_SECRET: "RECRUITMENT_IDEMPOTENCY_SECRET",
  /** "deterministic" (default) | "router". */
  AI_REVIEW_PROVIDER: "ATS_AI_REVIEW_PROVIDER",
  /** Literal "true" allows candidate text to reach an external model. Default: not allowed. */
  AI_EXTERNAL_PROCESSING_ALLOWED: "ATS_AI_EXTERNAL_PROCESSING_ALLOWED",
  /** Bearer token for the review-worker trigger route. */
  REVIEW_WORKER_TOKEN: "ATS_REVIEW_WORKER_TOKEN",
} as const;

export type AtsAiReviewProviderMode = "deterministic" | "router";

/**
 * Which review provider runs. Anything that is not the literal "router" is
 * deterministic — a typo cannot turn on an external call.
 */
export function getAiReviewProviderMode(): AtsAiReviewProviderMode {
  return process.env[ENV.AI_REVIEW_PROVIDER]?.trim().toLowerCase() === "router" ? "router" : "deterministic";
}

/**
 * Whether candidate-supplied text may be sent to an external model at all.
 * Default false: the deterministic path never leaves the process, and the
 * router path is refused — not degraded, refused — without this policy flag.
 */
export function isExternalAiProcessingAllowed(): boolean {
  return process.env[ENV.AI_EXTERNAL_PROCESSING_ALLOWED]?.trim().toLowerCase() === "true";
}

/** The idempotency fingerprint secret, or null when intake must refuse. */
export function getIdempotencySecret(): string | null {
  const v = process.env[ENV.IDEMPOTENCY_SECRET];
  return typeof v === "string" && v.length >= 16 ? v : null;
}

/**
 * Attributes that must NEVER become a criterion, a keyword or a scoring
 * input. The rubric test scans every criterion label and keyword against
 * this list; the extractor never reads a field that could carry one.
 */
export const PROTECTED_ATTRIBUTE_TERMS = [
  "age",
  "date of birth",
  "birthday",
  "gender",
  "sex",
  "male",
  "female",
  "ethnicity",
  "race",
  "religion",
  "photo",
  "picture",
  "marital",
  "married",
  "single",
  "pregnan",
  "nationality",
  "surname",
  "family name",
  "last name",
  "disability",
] as const;
