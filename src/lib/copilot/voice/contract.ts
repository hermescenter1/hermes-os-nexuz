/**
 * PHASE 103 — Hermes Live Voice Intelligence: the shared vocabulary.
 *
 * This module holds CONSTANTS and TYPES only. No I/O, no secrets, no provider
 * calls. Everything the three voice routes, the guard, the governance layer and
 * the UI agree on lives here exactly once, so a change to a limit or a code is a
 * one-line diff rather than a hunt through five files.
 *
 * WHAT THIS FEATURE IS
 * --------------------
 * A voice INTERFACE to the existing deterministic Industrial Copilot. The
 * permitted flow is, end to end:
 *
 *   microphone → transcription-only session → editable transcript →
 *   explicit operator confirmation → the EXISTING deterministic engine →
 *   documented answer → optional text-to-speech of that exact answer
 *
 * WHAT IT IS NOT
 * --------------
 * It is not an autonomous voice agent, not a second decision engine and not a
 * control path. The external models may transcribe and may speak; they may
 * never analyse, call a tool, decide, or reach a PLC/SCADA surface. The
 * deterministic engine is the sole author of every answer, and the answer the
 * speech leg reads back is bound to a server signature so it cannot be swapped
 * for text the server never produced.
 */

/* ── Locales ──────────────────────────────────────────────────────────────── */

/**
 * The locales a voice interaction may declare.
 *
 * Deliberately the platform's own three routing locales rather than an open
 * language tag: the locale selects which deterministic Copilot rendering is
 * spoken, and it is bound into the speech grant, so an open set would widen
 * what a signed grant can authorise for no product benefit.
 */
export const VOICE_LOCALES = ["fa", "en", "de"] as const;
export type VoiceLocale = (typeof VOICE_LOCALES)[number];

export function isVoiceLocale(value: unknown): value is VoiceLocale {
  return typeof value === "string" && (VOICE_LOCALES as readonly string[]).includes(value);
}

/* ── Size and time limits ─────────────────────────────────────────────────── */

/**
 * The longest transcript the deterministic engine will accept.
 *
 * A spoken industrial question is a sentence or two. 2 000 characters is
 * generous for dictation and small enough that the engine's cost stays bounded
 * even at the rate limit's ceiling.
 */
export const VOICE_TRANSCRIPT_MAX_CHARS = 2_000;

/** The longest answer text the speech leg will read back. */
export const VOICE_SPEECH_MAX_CHARS = 4_000;

/**
 * Hard byte ceiling for every voice request body.
 *
 * All three bodies are small JSON envelopes (a locale, a transcript, a grant).
 * The ceiling is a genuine resource boundary applied before parsing, not a
 * post-hoc length check.
 */
export const VOICE_BODY_MAX_BYTES = 16 * 1024;

/**
 * Lifetime of the transcription session credential requested from the provider.
 *
 * Short by design: the credential is handed to a browser, so its blast radius is
 * its lifetime. Long enough to complete a handshake and dictate a question.
 */
export const VOICE_SESSION_TTL_SECONDS = 60;

/**
 * Lifetime of the signed speech grant.
 *
 * The operator reads the answer, then decides whether to play it. A minute
 * covers that without leaving a reusable authorisation lying around.
 */
export const VOICE_GRANT_TTL_SECONDS = 60;

/* ── Rate-limit buckets ───────────────────────────────────────────────────── */

/**
 * The three independent buckets, one per route.
 *
 * They are separate because they cost different things: a session mints an
 * external credential, a query runs the deterministic pipeline, and speech
 * synthesises audio. Sharing one budget would let the cheapest surface exhaust
 * the most expensive one.
 *
 * WHY THIS LIST IS NOT WHAT THE ROUTES IMPORT
 * Each route passes its bucket as a STRING LITERAL, typed `RateLimitAction`, so
 * two independent things stay true: the compiler rejects a bucket the canonical
 * registry does not declare, AND the Phase 102 on-disk registry audit — which
 * resolves `bucket: "…"` literals by reading the source, not by importing it —
 * can see which bucket each route actually names. An imported constant would be
 * invisible to that audit. This list exists so the Phase 103 tests can pin the
 * three names once; `phase103-voice-security-contract.test.ts` asserts each
 * route's source really names its entry, so the two cannot drift.
 */
export const VOICE_RATE_LIMIT_BUCKETS = [
  "copilot-voice-session",
  "copilot-voice-query",
  "copilot-voice-speech",
] as const;

/* ── Governance workflows ─────────────────────────────────────────────────── */

/**
 * Workflow identifiers a tenant provider policy must explicitly approve.
 *
 * A policy that enables the provider but does not list the workflow denies —
 * approving "OpenAI" is not the same decision as approving "our operators' voice
 * leaves the building".
 */
export const VOICE_TRANSCRIPTION_WORKFLOW = "copilot_voice_transcription";
export const VOICE_SPEECH_WORKFLOW = "copilot_voice_speech";

/**
 * The data class a voice interaction carries.
 *
 * An operator's spoken question about plant equipment is tenant operational
 * data. It is never `secret` (which the governance layer hard-denies) and it is
 * never claimed to be merely `public`.
 */
export const VOICE_DATA_CLASS = "tenant_operational" as const;

/* ── Response codes ───────────────────────────────────────────────────────── */

/**
 * The closed set of machine-readable codes the voice routes return.
 *
 * Every one is stable, non-leaking and safe to show a user: none carries a
 * resource id, a provider message, a transcript, a stack trace or a credential.
 * The UI maps each to a translated message, so adding a code without a
 * translation is caught by the i18n contract test.
 */
export const VOICE_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "SESSION_AUTH_REQUIRED",
  "FORBIDDEN",
  "ORGANIZATION_SCOPE_REQUIRED",
  "INSUFFICIENT_PERMISSION",
  "RATE_LIMITED",
  "UNSUPPORTED_MEDIA_TYPE",
  "BODY_TOO_LARGE",
  "INVALID_INPUT",
  "EXTERNAL_AI_UNAVAILABLE",
  "VOICE_GRANT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "COPILOT_UNAVAILABLE",
] as const;
export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/* ── Audit ────────────────────────────────────────────────────────────────── */

/**
 * Phase 103 audit actions.
 *
 * Each is recorded with NON-SENSITIVE metadata only: provider, registry id,
 * locale, character counts, decision codes. The transcript, the answer text, the
 * audio, the API key and the ephemeral client secret are never audited, never
 * logged and never persisted — see `buildVoiceAuditMetadata`.
 */
export const VOICE_AUDIT = {
  SESSION_ISSUED: "copilot.voice.session.issued",
  SESSION_DENIED: "copilot.voice.session.denied",
  QUERY_ANSWERED: "copilot.voice.query.answered",
  QUERY_DENIED: "copilot.voice.query.denied",
  SPEECH_SYNTHESISED: "copilot.voice.speech.synthesised",
  SPEECH_DENIED: "copilot.voice.speech.denied",
} as const;

/**
 * The ONLY fields a Phase 103 audit event may carry.
 *
 * Written as an explicit interface rather than `Record<string, unknown>` so that
 * adding a transcript or a secret to an audit call is a type error, not a review
 * miss. `characters` is a LENGTH, never content.
 */
export interface VoiceAuditMetadata {
  readonly organizationId: string;
  readonly registryId: string;
  readonly provider: string;
  readonly model: string;
  readonly locale: VoiceLocale;
  /** Length of the text involved, in characters. Never the text itself. */
  readonly characters: number;
  /** A stable outcome or denial code from the closed vocabularies above. */
  readonly result: string;
}

/**
 * Build audit metadata, dropping anything not in the closed shape.
 *
 * The rebuild is deliberate: it means a caller cannot widen the payload by
 * spreading an object that happens to hold a transcript, even with a cast.
 */
export function buildVoiceAuditMetadata(input: VoiceAuditMetadata): Record<string, unknown> {
  return {
    organizationId: input.organizationId,
    registryId: input.registryId,
    provider: input.provider,
    model: input.model,
    locale: input.locale,
    characters: input.characters,
    result: input.result,
  };
}
