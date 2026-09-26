/**
 * PHASE 104-B1.3 — the Stage-1 application client contract.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * --------------------------------
 * This module is the CLIENT half of the Stage-1 contract, stated once so it
 * cannot drift from `stage1ApplicationSchema` in `@/lib/ats/application.ts`.
 * It is a pure builder: it constructs a payload and an idempotency key. It
 * performs NO request.
 *
 * It is wired to the public form (`Stage1ApplicationForm`) now that the owner
 * has authorized acceptance and B2 implemented the orchestration. Validation
 * runs the SAME `stage1ApplicationSchema` object the server route enforces
 * (`@/lib/ats/stage1-schema`), so the browser and the server cannot disagree
 * about what is valid — the server still re-validates everything. The retired
 * vocabulary (name / location / coverLetter / totalYearsExp / skills /
 * workAuthorization) is deliberately absent: those keys are rejected by the
 * server's `.strict()` schema and must never return to a client.
 *
 * Nothing here can bypass the server: the route still applies its rate limit,
 * Origin check, strict schema, idempotency key, eligibility predicate, the
 * owner gate, the approved retention policy and the organization's intake
 * switch before any write, and every accepted application waits for AI review
 * and then a recorded human decision.
 */

import { stage1ApplicationSchema } from "@/lib/ats/stage1-schema";

/**
 * The header the route reads the key from. The server constant lives in a
 * Prisma-importing module a client cannot load, so it is restated here and a
 * test pins the two equal.
 */
export const STAGE1_IDEMPOTENCY_HEADER = "idempotency-key";

/** Exactly the keys `stage1ApplicationSchema` accepts, with its types. */
export interface Stage1ApplicationPayload {
  jobId: string;
  fullName: string;
  email: string;
  phone?: string;
  currentLocation?: string;
  yearsExperience?: number;
  keySkills?: string[];
  resumeText?: string;
  fitStatement?: string;
  linkedinUrl?: string;
  /** Required literal `true` — an ACKNOWLEDGEMENT, not a lawful basis. */
  privacyNoticeAcknowledged: true;
  /** Required literal `true` — an ATTESTATION, not a lawful basis. */
  accuracyConfirmed: true;
  /** Genuinely optional CONSENT; never required to submit. */
  futureOpeningsConsent?: boolean;
}

/** The form shape a future Stage-1 UI would hold. Strings only — the builder
 *  performs the narrowing, so the UI never guesses a type. */
export interface Stage1FormState {
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  yearsExperience: string;
  keySkills: string;
  resumeText: string;
  fitStatement: string;
  linkedinUrl: string;
  privacyNoticeAcknowledged: boolean;
  accuracyConfirmed: boolean;
  futureOpeningsConsent: boolean;
}

export const STAGE1_INITIAL_FORM: Stage1FormState = {
  fullName: "",
  email: "",
  phone: "",
  currentLocation: "",
  yearsExperience: "",
  keySkills: "",
  resumeText: "",
  fitStatement: "",
  linkedinUrl: "",
  // Both confirmations start UNCHECKED: a pre-ticked acknowledgement is not an
  // acknowledgement, and a pre-ticked consent is not consent.
  privacyNoticeAcknowledged: false,
  accuracyConfirmed: false,
  futureOpeningsConsent: false,
};

/**
 * A per-submission idempotency key: 128 bits of Web Crypto randomness in the
 * base64url alphabet, which is exactly the FORMAT the server validates
 * (22..128 chars, [A-Za-z0-9_-]). The value is returned to the caller and
 * never stored, cached or logged anywhere in this module.
 */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const trimmed = (v: string): string | undefined => {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

/**
 * Build the payload, or refuse. Returns `null` when a REQUIRED part is
 * missing — the two confirmations included — so a caller cannot post a
 * half-formed application and discover the problem from a server 400.
 */
export function buildStage1Payload(
  jobId: string,
  form: Stage1FormState,
): Stage1ApplicationPayload | null {
  const fullName = trimmed(form.fullName);
  const email = trimmed(form.email);
  if (!jobId.trim() || !fullName || !email) return null;
  if (form.privacyNoticeAcknowledged !== true) return null;
  if (form.accuracyConfirmed !== true) return null;

  const years = trimmed(form.yearsExperience);
  const yearsExperience = years === undefined ? undefined : Number(years);
  if (yearsExperience !== undefined && !Number.isInteger(yearsExperience)) return null;

  const keySkills = form.keySkills
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    jobId: jobId.trim(),
    fullName,
    email,
    ...(trimmed(form.phone) ? { phone: trimmed(form.phone)! } : {}),
    ...(trimmed(form.currentLocation) ? { currentLocation: trimmed(form.currentLocation)! } : {}),
    ...(yearsExperience !== undefined ? { yearsExperience } : {}),
    ...(keySkills.length > 0 ? { keySkills } : {}),
    ...(trimmed(form.resumeText) ? { resumeText: trimmed(form.resumeText)! } : {}),
    ...(trimmed(form.fitStatement) ? { fitStatement: trimmed(form.fitStatement)! } : {}),
    ...(trimmed(form.linkedinUrl) ? { linkedinUrl: trimmed(form.linkedinUrl)! } : {}),
    privacyNoticeAcknowledged: true,
    accuracyConfirmed: true,
    // sent only when actually given; `false` carries no consent to record
    ...(form.futureOpeningsConsent === true ? { futureOpeningsConsent: true } : {}),
  };
}

// ── Validation (the server's own schema) ─────────────────────────────────────

export type Stage1Field =
  | "fullName"
  | "email"
  | "phone"
  | "currentLocation"
  | "yearsExperience"
  | "keySkills"
  | "resumeText"
  | "fitStatement"
  | "linkedinUrl"
  | "privacyNoticeAcknowledged"
  | "accuracyConfirmed";

export type Stage1FieldError = "required" | "invalid" | "tooShort" | "tooLong" | "notConfirmed";

/** Field order for the error summary and for focusing the first invalid field. */
export const STAGE1_FIELD_ORDER: readonly Stage1Field[] = [
  "fullName",
  "email",
  "phone",
  "currentLocation",
  "yearsExperience",
  "keySkills",
  "resumeText",
  "fitStatement",
  "linkedinUrl",
  "privacyNoticeAcknowledged",
  "accuracyConfirmed",
];

export interface Stage1Validation {
  /** The exact payload to send, or null while any error remains. */
  payload: Stage1ApplicationPayload | null;
  errors: Partial<Record<Stage1Field, Stage1FieldError>>;
}

/**
 * Validate the WHOLE form at once (every error, not the first), against the
 * server's own schema. The candidate object is built the way
 * `buildStage1Payload` builds it, but WITHOUT refusing early, so the schema
 * sees every field and can name every problem.
 */
export function validateStage1Form(jobId: string, form: Stage1FormState): Stage1Validation {
  const errors: Partial<Record<Stage1Field, Stage1FieldError>> = {};
  const years = trimmed(form.yearsExperience);
  let yearsExperience: number | undefined;
  if (years !== undefined) {
    const n = Number(years);
    if (!/^\d+$/.test(years) || !Number.isInteger(n)) errors.yearsExperience = "invalid";
    else yearsExperience = n;
  }
  const keySkills = form.keySkills
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const candidate: Record<string, unknown> = {
    jobId: jobId.trim(),
    ...(trimmed(form.fullName) ? { fullName: trimmed(form.fullName) } : {}),
    ...(trimmed(form.email) ? { email: trimmed(form.email) } : {}),
    ...(trimmed(form.phone) ? { phone: trimmed(form.phone) } : {}),
    ...(trimmed(form.currentLocation) ? { currentLocation: trimmed(form.currentLocation) } : {}),
    ...(yearsExperience !== undefined ? { yearsExperience } : {}),
    ...(keySkills.length > 0 ? { keySkills } : {}),
    ...(trimmed(form.resumeText) ? { resumeText: trimmed(form.resumeText) } : {}),
    ...(trimmed(form.fitStatement) ? { fitStatement: trimmed(form.fitStatement) } : {}),
    ...(trimmed(form.linkedinUrl) ? { linkedinUrl: trimmed(form.linkedinUrl) } : {}),
    privacyNoticeAcknowledged: form.privacyNoticeAcknowledged === true,
    accuracyConfirmed: form.accuracyConfirmed === true,
    ...(form.futureOpeningsConsent === true ? { futureOpeningsConsent: true } : {}),
  };

  const parsed = stage1ApplicationSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string" || !(STAGE1_FIELD_ORDER as readonly string[]).includes(field)) continue;
      const f = field as Stage1Field;
      if (errors[f]) continue;
      if (f === "privacyNoticeAcknowledged" || f === "accuracyConfirmed") errors[f] = "notConfirmed";
      else if (issue.code === "too_big") errors[f] = "tooLong";
      else if (issue.code === "too_small") errors[f] = candidate[f] === undefined ? "required" : "tooShort";
      else if (candidate[f] === undefined) errors[f] = "required";
      else errors[f] = "invalid";
    }
  }
  if (Object.keys(errors).length > 0) return { payload: null, errors };
  return { payload: buildStage1Payload(jobId, form), errors };
}

// ── The server's answer, classified ──────────────────────────────────────────

export type Stage1SubmitOutcome =
  /** 202 — received and queued for review. Identical for new, replayed and duplicate applications. */
  | { kind: "received"; reference: string }
  /** 400 / 413 / 415 — the server did not accept the details as sent. */
  | { kind: "invalid" }
  /** 429 — too many attempts from this network. */
  | { kind: "rateLimited"; retryAfterSeconds: number | null }
  /** 503 / 403 / anything else — the one generic refusal; nothing about why. */
  | { kind: "notAccepting" }
  /** Network failure or an unreadable success: the outcome is UNKNOWN — retry with the SAME key. */
  | { kind: "unconfirmed" };

/** The route's opaque reference (`ats_` + base64url). A sanity check only: a
 *  202 whose body is not ours is never presented as a receipt. */
const REFERENCE_FORMAT = /^ats_[A-Za-z0-9_-]{1,128}$/;

export function classifyApplyResponse(status: number, body: unknown, retryAfterHeader: string | null): Stage1SubmitOutcome {
  if (status === 202) {
    const b = body as { received?: unknown; reference?: unknown } | null;
    if (b && b.received === true && typeof b.reference === "string" && REFERENCE_FORMAT.test(b.reference)) {
      return { kind: "received", reference: b.reference };
    }
    return { kind: "unconfirmed" };
  }
  if (status === 400 || status === 413 || status === 415) return { kind: "invalid" };
  if (status === 429) {
    const n = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
    return { kind: "rateLimited", retryAfterSeconds: Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null };
  }
  return { kind: "notAccepting" };
}
