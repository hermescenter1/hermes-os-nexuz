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
 *   APPLICATION_ACCEPTANCE_AUTHORIZED = false   (shared gate, B1 —
 *     defined in @/lib/ats/acceptance-flag and re-exported by application.ts)
 *   APPLICATION_ORCHESTRATION_IMPLEMENTED = NO  (server, B2 work)
 *
 * While those hold, `ApplyFormClient` renders NO form and issues NO submit —
 * so nothing here is reachable from the product. It exists because the
 * contract must be correct and TESTED before it is ever wired, not invented
 * under time pressure on the day acceptance is switched on. The retired
 * vocabulary (name / location / coverLetter / totalYearsExp / skills /
 * workAuthorization) is deliberately absent: those keys are rejected by the
 * server's `.strict()` schema and must never return to a client.
 *
 * Enabling the flow is a B2 change on the SERVER (claim → in-transaction
 * eligibility re-check → persist → claim completion). Wiring this builder to
 * a form cannot bypass that: the route refuses before any write.
 */

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
