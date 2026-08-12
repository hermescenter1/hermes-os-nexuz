/**
 * PHASE 102 — Hermes Media & Video Hub: component view models.
 *
 * Design authority: docs/phase102/architecture.md.
 *
 * These are the shapes the media COMPONENTS accept. They are deliberately NOT
 * `MediaAssetRow` (the Prisma projection in `src/lib/media/db.ts`, which is
 * server-only and must never be imported into a client bundle). A page or route
 * loads rows on the server, resolves the locale translation, mints the byte-serving
 * URLs, and hands the result down as one of these.
 *
 * Three consequences of that separation are load-bearing:
 *
 *  1. No component can ever reach a database, so no component can leak an
 *     unpublished row by accident — the visibility gate stays in the repository
 *     layer where ADR §11 put it.
 *  2. `storageKey` never appears here. A component receives a URL that the server
 *     already decided the viewer may request; it never learns the object key.
 *  3. Every field is already locale-resolved. A component does not pick a
 *     translation row, so it cannot pick the wrong one.
 *
 * Optionality is meaningful throughout: `null` means "the platform genuinely does
 * not know this" (no duration probe exists — ADR §9 — so `durationSeconds` is
 * routinely null), and components must render that absence honestly rather than
 * substituting a zero.
 */
import type {
  MediaLifecycleStatus,
  MediaLocale,
  MediaProcessingState,
  MediaSkillLevel,
} from "@/lib/media/types";

/** An instructor as shown on a card, a hero, or their own profile panel. */
export interface MediaInstructorView {
  id: string;
  /** Display name, already resolved for the active locale. */
  name: string;
  /** One-line professional headline, or null when the profile has none. */
  headline: string | null;
  /** Same-origin avatar URL, or null — never a placeholder face. */
  avatarUrl: string | null;
  /** Locale-prefixed profile route, or null when there is no profile page. */
  href: string | null;
  /** Published assets attributed to this instructor, or null when not counted. */
  videoCount: number | null;
}

/** A category in the org-scoped taxonomy (ADR §10). */
export interface MediaCategoryView {
  id: string;
  slug: string;
  /** Locale-resolved category name. */
  name: string;
  /** Published assets in the category, or null when the caller did not count. */
  count: number | null;
}

/** One ordered chapter mark. `startSeconds` is an offset, never a wall clock. */
export interface MediaChapterView {
  id: string;
  title: string;
  startSeconds: number;
}

/** A WebVTT subtitle track. WebVTT only — there is no converter (ADR §9). */
export interface MediaSubtitleTrackView {
  id: string;
  locale: MediaLocale;
  /** Human label shown in the captions menu, e.g. "فارسی". */
  label: string;
  /** Same-origin `.vtt` URL served through the media byte route. */
  src: string;
  /** True for the track that should be showing on first load. */
  isDefault: boolean;
}

/** One transcript cue. `endSeconds` is null when the source gave no end time. */
export interface MediaTranscriptCueView {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  /** Speaker attribution when the transcript carries one. */
  speaker: string | null;
}

/** A downloadable engineering attachment. */
export interface MediaAttachmentView {
  id: string;
  fileName: string;
  /** Same-origin download URL. */
  href: string;
  byteSize: number | null;
  contentType: string | null;
}

/**
 * The viewer's own watch progress for one asset.
 *
 * Private viewing history (ADR §8) — a page must only ever pass the *authenticated
 * viewer's* row here, filtered at the database query level. There is no field for
 * "someone else's progress" because no component should be able to render it.
 */
export interface MediaProgressView {
  positionSeconds: number;
  progressPct: number;
  completed: boolean;
}

/** The card-sized projection of an asset. */
export interface MediaCardView {
  id: string;
  slug: string;
  /** Locale-prefixed watch route, minted by the page. */
  href: string;
  title: string;
  summary: string | null;
  /** Poster URL, or null when no poster was uploaded (none is generated — ADR §9). */
  posterUrl: string | null;
  /** Null when the duration is genuinely unknown — there is no duration probe. */
  durationSeconds: number | null;
  skillLevel: MediaSkillLevel | null;
  status: MediaLifecycleStatus;
  processingState: MediaProcessingState;
  instructor: MediaInstructorView | null;
  category: MediaCategoryView | null;
  viewCount: number;
  /** The viewer's own progress, or null when signed out / never watched. */
  progress: MediaProgressView | null;
  /** Whether the viewer has saved this asset. Null when unknown (signed out). */
  saved: boolean | null;
}

/** Everything the watch page hands to the player and its side panels. */
export interface MediaPlaybackView {
  id: string;
  slug: string;
  title: string;
  /**
   * The byte-serving URL, or null when nothing is servable. Null is a first-class
   * value: an asset in any processing state other than READY has no playable
   * source, and the player must say so rather than spin (ADR §5, §9).
   */
  src: string | null;
  contentType: string | null;
  posterUrl: string | null;
  /** Server-recorded duration, or null when unknown. */
  durationSeconds: number | null;
  processingState: MediaProcessingState;
  chapters: readonly MediaChapterView[];
  subtitleTracks: readonly MediaSubtitleTrackView[];
  /** The viewer's own resume point, or null. */
  progress: MediaProgressView | null;
}

export type {
  MediaLifecycleStatus,
  MediaLocale,
  MediaProcessingState,
  MediaSkillLevel,
};
