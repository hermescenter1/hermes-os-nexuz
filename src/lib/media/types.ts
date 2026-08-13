/**
 * PHASE 102 — Hermes Media & Video Hub: domain vocabularies.
 *
 * Design authority: docs/phase102/architecture.md §6 and §10.
 *
 * Every union here mirrors, EXACTLY, a CHECK constraint written by hand in
 * prisma/migrations/20260821000000_phase102_media_video_hub/migration.sql. The
 * database is the enforcement point; this module is the TypeScript projection of
 * it. If the two ever disagree, the database wins and a write fails loudly — which
 * is the intent: a widened union must not be able to smuggle an unpersistable value
 * past the type checker.
 *
 * These are `String` columns + CHECK, not Prisma enums. Phases 96/97 stopped
 * declaring enums for lifecycle vocabularies because `ALTER TYPE … ADD VALUE` is
 * append-only and `ALTER TYPE … DROP` is classified BREAKING_OR_UNKNOWN by
 * scripts/dr/migration-sql-classify.mjs, which blocks a deploy outright.
 */

// ── Editorial lifecycle (§11) ────────────────────────────────────────────────
// DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED, with REJECTED reachable
// from review. Every state is reachable; the closed transition table that governs
// movement between them lives with the editorial service, not here.
export const MEDIA_LIFECYCLE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type MediaLifecycleStatus = (typeof MEDIA_LIFECYCLE_STATUSES)[number];

// ── Visibility (§3) ──────────────────────────────────────────────────────────
// PUBLIC is not "unscoped": an asset is publicly readable only when
// `status === "PUBLISHED" && visibility === "PUBLIC"`. Both halves are required,
// and the repository layer — not the caller — applies them.
export const MEDIA_VISIBILITIES = ["PRIVATE", "ORGANIZATION", "PUBLIC"] as const;
export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];

// ── Processing state (§5) ────────────────────────────────────────────────────
// Advanced by compare-and-swap `updateMany` plus an operator-run CLI; there is no
// background job runner in this platform, so no state here implies a worker.
// QUARANTINED exists because there is no virus scanner: it is where an asset sits
// when validation cannot vouch for the bytes, so nothing is ever served on the
// optimistic assumption that an unscanned file is safe.
export const MEDIA_PROCESSING_STATES = [
  "PENDING_UPLOAD",
  "UPLOADED",
  "VALIDATING",
  "READY",
  "FAILED",
  "QUARANTINED",
] as const;
export type MediaProcessingState = (typeof MEDIA_PROCESSING_STATES)[number];

// ── Locale (§10) ─────────────────────────────────────────────────────────────
// The platform locale set. Deliberately NOT `ArtLanguage`, which is EN|FA only and
// has no DE. `ACTIVE_LOCALES` remains the single source of truth for which of
// these are currently switched on in the UI; this union is the storage vocabulary.
export const MEDIA_LOCALES = ["fa", "en", "de"] as const;
export type MediaLocale = (typeof MEDIA_LOCALES)[number];

// ── Skill level ──────────────────────────────────────────────────────────────
// Nullable in the database: an asset that has not been graded stays ungraded
// rather than being defaulted into a level nobody chose.
export const MEDIA_SKILL_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
export type MediaSkillLevel = (typeof MEDIA_SKILL_LEVELS)[number];

// ── Supporting vocabularies (also CHECK-constrained in the same migration) ────

/** Append-only analytics event. Recorded with an `ipHash`, never a raw IP (§8). */
export const MEDIA_VIEW_EVENT_TYPES = ["PLAY", "PROGRESS", "COMPLETE"] as const;
export type MediaViewEventType = (typeof MEDIA_VIEW_EVENT_TYPES)[number];

/** The accountable act recorded on every lifecycle transition (§11). */
export const MEDIA_EDITORIAL_ACTIONS = [
  "SUBMIT",
  "START_REVIEW",
  "PUBLISH",
  "REJECT",
  "ARCHIVE",
  "RESTORE",
] as const;
export type MediaEditorialAction = (typeof MEDIA_EDITORIAL_ACTIONS)[number];

/** There is no speech-to-text engine here, so no value claims machine generation. */
export const MEDIA_TRANSCRIPT_SOURCES = ["MANUAL", "IMPORTED"] as const;
export type MediaTranscriptSource = (typeof MEDIA_TRANSCRIPT_SOURCES)[number];

/** WebVTT only — there is no subtitle converter (§9). */
export const MEDIA_SUBTITLE_FORMATS = ["vtt"] as const;
export type MediaSubtitleFormat = (typeof MEDIA_SUBTITLE_FORMATS)[number];

/**
 * Storage backend recorded on the asset. `s3` and `minio` are representable
 * because the column must be able to describe a future deployment, but the
 * adapters for both reject every call by design and no SDK is installed
 * (ADR §2.4, §9) — writing either value today produces an asset nothing can serve.
 */
export const MEDIA_STORAGE_PROVIDERS = ["local", "s3", "minio"] as const;
export type MediaStorageProvider = (typeof MEDIA_STORAGE_PROVIDERS)[number];

// ── Narrowing helpers ────────────────────────────────────────────────────────
// `unknown` in, narrowed out. External input is validated with Zod at the route
// boundary; these exist for the places that read a `String` column back out of the
// database, where Prisma's type is `string` and the CHECK constraint is the only
// thing that made it a member of the union.

function memberOf<T extends readonly string[]>(
  vocabulary: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (vocabulary as readonly string[]).includes(value);
}

export function isMediaLifecycleStatus(value: unknown): value is MediaLifecycleStatus {
  return memberOf(MEDIA_LIFECYCLE_STATUSES, value);
}

export function isMediaVisibility(value: unknown): value is MediaVisibility {
  return memberOf(MEDIA_VISIBILITIES, value);
}

export function isMediaProcessingState(value: unknown): value is MediaProcessingState {
  return memberOf(MEDIA_PROCESSING_STATES, value);
}

export function isMediaLocale(value: unknown): value is MediaLocale {
  return memberOf(MEDIA_LOCALES, value);
}

export function isMediaSkillLevel(value: unknown): value is MediaSkillLevel {
  return memberOf(MEDIA_SKILL_LEVELS, value);
}

export function isMediaViewEventType(value: unknown): value is MediaViewEventType {
  return memberOf(MEDIA_VIEW_EVENT_TYPES, value);
}

export function isMediaEditorialAction(value: unknown): value is MediaEditorialAction {
  return memberOf(MEDIA_EDITORIAL_ACTIONS, value);
}

// ── Derived predicates ───────────────────────────────────────────────────────

/**
 * The public-exposure test, in ONE place (§11).
 *
 * `Article` inlines this gate in each caller, which is one forgotten caller away
 * from leaking a draft. Both halves are required, and a publicly served asset must
 * additionally have finished validation — an unvalidated or quarantined file is
 * never served on the assumption that it is probably fine.
 */
export function isPubliclyReadable(asset: {
  status: string;
  visibility: string;
  processingState: string;
}): boolean {
  return (
    asset.status === "PUBLISHED" &&
    asset.visibility === "PUBLIC" &&
    asset.processingState === "READY"
  );
}

/** True when the asset's bytes may be served to anyone at all, public or not. */
export function isServable(asset: { processingState: string }): boolean {
  return asset.processingState === "READY";
}

// ── Domain shapes ────────────────────────────────────────────────────────────

/** Locale-resolved editorial copy for one asset. */
export interface MediaTranslationContent {
  locale: MediaLocale;
  title: string;
  summary: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string[];
}

/**
 * The narrowed projection of a `MediaAsset` row. Every `String` column that the
 * database constrains with a CHECK is surfaced here as its union, so a consumer
 * cannot silently handle a value the database would have rejected.
 */
export interface MediaAssetIdentity {
  id: string;
  organizationId: string;
  slug: string;
  primaryLocale: MediaLocale;
  status: MediaLifecycleStatus;
  visibility: MediaVisibility;
  processingState: MediaProcessingState;
  skillLevel: MediaSkillLevel | null;
}
