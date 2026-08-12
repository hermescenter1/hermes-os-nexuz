/**
 * PHASE 102 — Hermes Media & Video Hub: pure, JSX-free logic core.
 *
 * Every decision the media components make that can be made without a DOM lives
 * here: time formatting, seek arithmetic, the keyboard map, chapter and cue
 * lookup, buffering maths, resume policy, filter serialisation and the
 * status → badge-variant mappings.
 *
 * WHY THE SPLIT EXISTS
 * `src/components/ds/logic.ts` sets the precedent and Vitest enforces it: the
 * repo's app tsconfig sets `jsx: "preserve"` because Next compiles JSX itself, so
 * Vitest's oxc transform can only parse `.tsx` under the config override. A
 * JSX-free module runs in the default `node` environment with no transform
 * caveats, which is where the exhaustive unit tests for this phase live. It also
 * means the seek/keyboard/chapter behaviour is testable WITHOUT mounting a
 * `<video>` element — jsdom implements almost none of HTMLMediaElement, so a
 * DOM-coupled implementation of this logic would be effectively untestable.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR THE DATABASE. It is safe in a client
 * bundle, and `src/lib/media/db.ts` is deliberately never imported.
 */
import type { BadgeVariant } from "@/components/ds/logic";
import type {
  MediaLifecycleStatus,
  MediaProcessingState,
  MediaSkillLevel,
} from "@/lib/media/types";
import { MEDIA_SKILL_LEVELS } from "@/lib/media/types";
import type {
  MediaChapterView,
  MediaProgressView,
  MediaTranscriptCueView,
} from "./view-model";

/* ═══════════════════════════ direction ═══════════════════════════ */

/**
 * The seek timeline is pinned to LTR in EVERY locale.
 *
 * This is the single most consequential RTL decision in the phase and it is
 * deliberate. Persian and Arabic UIs mirror layout, and a naive implementation
 * inherits `dir="rtl"` on the timeline — at which point a native `<input
 * type="range">` renders its maximum on the LEFT, the browser inverts Arrow-key
 * direction, and pointer arithmetic computed from `clientX - rect.left` silently
 * disagrees with what the user sees. The result is a scrubber that seeks
 * backwards when you drag forwards.
 *
 * Elapsed time is not a language: it flows from past to future, and every video
 * platform, every hardware transport and every waveform renders that left to
 * right regardless of script. So the timeline element carries an explicit
 * `dir="ltr"`, the pointer maths below assumes LTR unconditionally, and the
 * surrounding labels stay in the document direction. Timecodes additionally
 * render inside `<bdi dir="ltr">` (the ds `TechnicalValue`) so "1:05" is never
 * reordered into "05:1" by neighbouring Persian text.
 */
export const TIMELINE_DIRECTION = "ltr" as const;

/* ═══════════════════════════ formatting ═══════════════════════════ */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Seconds → `m:ss`, or `h:mm:ss` past an hour.
 *
 * Non-finite, negative and NaN inputs all collapse to `0:00` rather than
 * producing `NaN:NaN`. A media element reports `NaN` duration before metadata
 * loads and `Infinity` for a live stream, so both are reachable in practice.
 */
export function formatTimecode(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/**
 * Byte size → a compact SI-symbol string, or null when the size is unknown.
 *
 * Returns null rather than "0 B" for an unknown size: an attachment whose length
 * was never recorded is not an empty file, and saying so would be a fabrication.
 */
export function formatByteSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/* ═══════════════════════════ range maths ═══════════════════════════ */

/** Clamp to `[min, max]`; non-finite input resolves to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Clamp a playhead position into `[0, duration]`. Unknown duration → `>= 0`. */
export function clampTime(position: number, duration: number | null | undefined): number {
  if (!Number.isFinite(position) || position < 0) return 0;
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return position;
  }
  return Math.min(position, duration);
}

/** Position → fraction of the timeline in `[0, 1]`. Unknown duration → 0. */
export function fractionOfDuration(position: number, duration: number | null | undefined): number {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return clamp(position / duration, 0, 1);
}

/** Fraction of the timeline → position in seconds. */
export function timeFromFraction(fraction: number, duration: number | null | undefined): number {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return clamp(fraction, 0, 1) * duration;
}

/**
 * Pointer x → fraction of the timeline.
 *
 * LTR unconditionally, per `TIMELINE_DIRECTION`. A zero-width rect (an element
 * measured before layout) yields 0 instead of `Infinity`/`NaN`.
 */
export function seekFractionFromPointer(
  clientX: number,
  rect: { left: number; width: number },
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.width) || rect.width <= 0) return 0;
  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

/** Integer percentage `0..100` of the asset watched. Unknown duration → 0. */
export function progressPct(position: number, duration: number | null | undefined): number {
  return Math.round(fractionOfDuration(position, duration) * 100);
}

/**
 * The completion threshold, in percent.
 *
 * MUST stay equal to `MEDIA_COMPLETION_THRESHOLD_PCT` in `src/lib/media/db.ts`.
 * It is restated rather than imported because that module is server-only (it
 * reaches Prisma) and importing it here would drag the database client into a
 * client bundle. The server remains the authority — a component's opinion about
 * completion is a UI affordance, and the persisted `completedAt` is written by
 * the server against its own constant.
 */
export const MEDIA_COMPLETION_THRESHOLD_PCT = 95;

/** True when watched far enough that the server would record a completion. */
export function isCompletedProgress(pct: number): boolean {
  return Number.isFinite(pct) && pct >= MEDIA_COMPLETION_THRESHOLD_PCT;
}

/* ═══════════════════════════ buffering ═══════════════════════════ */

export interface BufferedRange {
  start: number;
  end: number;
}

/**
 * How far the contiguous buffer containing `position` extends, as a fraction.
 *
 * Only the range that actually covers the playhead counts. A far-ahead range
 * left over from an earlier seek must not be drawn as though playback were
 * buffered up to it — that is exactly the lie that makes a stalled player look
 * healthy.
 */
export function bufferedFractionAt(
  ranges: readonly BufferedRange[],
  position: number,
  duration: number | null | undefined,
): number {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  for (const range of ranges) {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) continue;
    if (position >= range.start && position <= range.end) {
      return clamp(range.end / duration, 0, 1);
    }
  }
  return 0;
}

/* ═══════════════════════════ volume & rate ═══════════════════════════ */

export const VOLUME_STEP = 0.05;

export function clampVolume(volume: number): number {
  return clamp(volume, 0, 1);
}

export function stepVolume(current: number, delta: number): number {
  // Rounded to hundredths so repeated 0.05 steps cannot drift into 0.35000000004.
  return Math.round(clampVolume(current + delta) * 100) / 100;
}

export type VolumeLevel = "muted" | "low" | "medium" | "high";

/** Which speaker glyph to show. Muted wins over any volume value. */
export function volumeLevel(volume: number, muted: boolean): VolumeLevel {
  if (muted || volume <= 0) return "muted";
  if (volume < 0.34) return "low";
  if (volume < 0.67) return "medium";
  return "high";
}

/**
 * Offered playback rates.
 *
 * Progressive playback only (ADR §4): the browser resamples audio itself, so
 * these need no transcoder and no worker — which is the point, because
 * `worker-src 'none'` in the CSP forbids one.
 */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export function isPlaybackRate(value: unknown): value is PlaybackRate {
  return typeof value === "number" && (PLAYBACK_RATES as readonly number[]).includes(value);
}

/** Move one notch along `PLAYBACK_RATES`, saturating at both ends. */
export function stepPlaybackRate(current: number, direction: 1 | -1): PlaybackRate {
  const index = PLAYBACK_RATES.findIndex((rate) => rate === current);
  const from = index === -1 ? PLAYBACK_RATES.indexOf(DEFAULT_PLAYBACK_RATE) : index;
  const next = clamp(from + direction, 0, PLAYBACK_RATES.length - 1);
  return PLAYBACK_RATES[next];
}

/* ═══════════════════════════ chapters ═══════════════════════════ */

/**
 * Sort by start time, drop non-finite or negative marks, and drop a duplicate
 * start (two chapters cannot both begin at 04:10 — the second would be
 * unreachable by seeking and would make `activeChapterIndex` order-dependent).
 */
export function normaliseChapters(
  chapters: readonly MediaChapterView[],
): readonly MediaChapterView[] {
  const usable = chapters.filter(
    (chapter) => Number.isFinite(chapter.startSeconds) && chapter.startSeconds >= 0,
  );
  const sorted = [...usable].sort((a, b) => a.startSeconds - b.startSeconds);
  const out: MediaChapterView[] = [];
  let previousStart: number | null = null;
  for (const chapter of sorted) {
    if (previousStart !== null && chapter.startSeconds === previousStart) continue;
    out.push(chapter);
    previousStart = chapter.startSeconds;
  }
  return out;
}

/**
 * Index of the chapter containing `position`, or -1.
 *
 * -1 is a real answer, not an error: when the first chapter starts at 00:30 the
 * opening half-minute belongs to no chapter, and pretending it belongs to
 * chapter 1 would highlight the wrong row for 30 seconds. Expects the
 * `normaliseChapters` ordering.
 */
export function activeChapterIndex(
  chapters: readonly MediaChapterView[],
  position: number,
): number {
  if (!Number.isFinite(position)) return -1;
  let found = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].startSeconds <= position) found = i;
    else break;
  }
  return found;
}

/** `[start, end)` of a chapter; `end` is the next start, or the duration. */
export function chapterRange(
  chapters: readonly MediaChapterView[],
  index: number,
  duration: number | null | undefined,
): { start: number; end: number | null } {
  const chapter = chapters[index];
  if (!chapter) return { start: 0, end: null };
  const next = chapters[index + 1];
  if (next) return { start: chapter.startSeconds, end: next.startSeconds };
  const hasDuration =
    duration !== null && duration !== undefined && Number.isFinite(duration) && duration > 0;
  return { start: chapter.startSeconds, end: hasDuration ? duration : null };
}

/** Start of the next chapter after `position`, or null at the last one. */
export function nextChapterStart(
  chapters: readonly MediaChapterView[],
  position: number,
): number | null {
  for (const chapter of chapters) {
    if (chapter.startSeconds > position) return chapter.startSeconds;
  }
  return null;
}

/**
 * How far into a chapter a "previous" press still rewinds to that chapter's own
 * start instead of stepping back one. This is the transport-control convention
 * every CD player, DAW and podcast app shares, and users expect it.
 */
export const CHAPTER_REWIND_THRESHOLD_SECONDS = 3;

/** Start of the previous chapter, or the current chapter's own start. */
export function previousChapterStart(
  chapters: readonly MediaChapterView[],
  position: number,
): number | null {
  const index = activeChapterIndex(chapters, position);
  if (index === -1) return null;
  const current = chapters[index];
  if (position - current.startSeconds > CHAPTER_REWIND_THRESHOLD_SECONDS) {
    return current.startSeconds;
  }
  const previous = chapters[index - 1];
  return previous ? previous.startSeconds : current.startSeconds;
}

/** Tick positions (fractions) for drawing chapter marks on the timeline. */
export function chapterTickFractions(
  chapters: readonly MediaChapterView[],
  duration: number | null | undefined,
): readonly number[] {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return [];
  }
  return chapters
    .filter((chapter) => chapter.startSeconds > 0 && chapter.startSeconds < duration)
    .map((chapter) => fractionOfDuration(chapter.startSeconds, duration));
}

/* ═══════════════════════════ transcript cues ═══════════════════════════ */

/** Sorted, with non-finite starts dropped. */
export function normaliseCues(
  cues: readonly MediaTranscriptCueView[],
): readonly MediaTranscriptCueView[] {
  return [...cues]
    .filter((cue) => Number.isFinite(cue.startSeconds) && cue.startSeconds >= 0)
    .sort((a, b) => a.startSeconds - b.startSeconds);
}

/**
 * Index of the cue covering `position`, or -1.
 *
 * A cue with an explicit `endSeconds` stops being active at its end — a gap
 * between cues is silence, and highlighting a stale line through it makes the
 * transcript look out of sync. A cue with a null end runs until the next cue
 * starts. Binary search, so a two-hour transcript costs ~15 comparisons per
 * `timeupdate` rather than thousands.
 */
export function activeCueIndex(
  cues: readonly MediaTranscriptCueView[],
  position: number,
): number {
  if (!Number.isFinite(position) || cues.length === 0) return -1;
  let lo = 0;
  let hi = cues.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startSeconds <= position) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate === -1) return -1;
  const cue = cues[candidate];
  if (cue.endSeconds !== null && Number.isFinite(cue.endSeconds) && position >= cue.endSeconds) {
    return -1;
  }
  return candidate;
}

/* ═══════════════════════════ keyboard map ═══════════════════════════ */

export const SEEK_STEP_SECONDS = 5;
export const SEEK_JUMP_SECONDS = 10;

/** Every command the player keyboard map can produce. */
export type PlayerCommand =
  | { kind: "TOGGLE_PLAY" }
  | { kind: "SEEK_BY"; seconds: number }
  | { kind: "SEEK_TO_FRACTION"; fraction: number }
  | { kind: "SEEK_TO_START" }
  | { kind: "SEEK_TO_END" }
  | { kind: "VOLUME_BY"; delta: number }
  | { kind: "TOGGLE_MUTE" }
  | { kind: "TOGGLE_FULLSCREEN" }
  | { kind: "TOGGLE_CAPTIONS" }
  | { kind: "RATE_STEP"; direction: 1 | -1 }
  | { kind: "NEXT_CHAPTER" }
  | { kind: "PREVIOUS_CHAPTER" };

/** The subset of a KeyboardEvent the map reads. */
export interface PlayerKeyEvent {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** The subset of an event target the ignore rule reads. */
export interface PlayerKeyTarget {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/**
 * Should this keystroke be left alone for the focused control to handle?
 *
 * Without this the player fights its own controls. Focus the seek slider and
 * press ArrowRight: the native range advances one step AND the container map
 * seeks five seconds, so one press moves twice. Focus the play button and press
 * Space: the button activates AND the map toggles play, so playback flips twice
 * and lands where it started.
 *
 * Text-entry and value-selection controls therefore keep every key. Buttons and
 * links only keep their two activation keys — Space and Enter — so the rest of
 * the map still works while a control has focus, which is how a keyboard user
 * actually drives a player.
 */
export function shouldIgnorePlayerKey(
  target: PlayerKeyTarget | null | undefined,
  key: string,
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
  if (tag === "BUTTON" || tag === "A") return key === " " || key === "Enter" || key === "Spacebar";
  return false;
}

/**
 * The keyboard map.
 *
 * Modified keystrokes are always declined: Ctrl/Cmd/Alt combinations belong to
 * the browser and the assistive technology, and stealing Cmd+L or Ctrl+F from a
 * user because a video happens to be focused is hostile.
 *
 * Arrow keys are NOT mirrored under RTL. ArrowRight always seeks forwards,
 * matching `TIMELINE_DIRECTION`: the timeline the user is steering renders LTR
 * in every locale, so an inverted arrow would contradict the thing on screen.
 */
export function resolvePlayerCommand(event: PlayerKeyEvent): PlayerCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key;

  // Digits 0-9 → seek to that tenth of the timeline.
  if (key.length === 1 && key >= "0" && key <= "9") {
    return { kind: "SEEK_TO_FRACTION", fraction: Number(key) / 10 };
  }

  switch (key) {
    case " ":
    case "Spacebar": // legacy key name, still emitted by some IME/browser combos
    case "k":
    case "K":
      return { kind: "TOGGLE_PLAY" };
    case "ArrowRight":
      return { kind: "SEEK_BY", seconds: SEEK_STEP_SECONDS };
    case "ArrowLeft":
      return { kind: "SEEK_BY", seconds: -SEEK_STEP_SECONDS };
    case "l":
    case "L":
      return { kind: "SEEK_BY", seconds: SEEK_JUMP_SECONDS };
    case "j":
    case "J":
      return { kind: "SEEK_BY", seconds: -SEEK_JUMP_SECONDS };
    case "ArrowUp":
      return { kind: "VOLUME_BY", delta: VOLUME_STEP };
    case "ArrowDown":
      return { kind: "VOLUME_BY", delta: -VOLUME_STEP };
    case "Home":
      return { kind: "SEEK_TO_START" };
    case "End":
      return { kind: "SEEK_TO_END" };
    case "m":
    case "M":
      return { kind: "TOGGLE_MUTE" };
    case "f":
    case "F":
      return { kind: "TOGGLE_FULLSCREEN" };
    case "c":
    case "C":
      return { kind: "TOGGLE_CAPTIONS" };
    case "n":
    case "N":
      return { kind: "NEXT_CHAPTER" };
    case "p":
    case "P":
      return { kind: "PREVIOUS_CHAPTER" };
    case ">":
      return { kind: "RATE_STEP", direction: 1 };
    case "<":
      return { kind: "RATE_STEP", direction: -1 };
    default:
      return null;
  }
}

/* ═══════════════════════════ playability & errors ═══════════════════════════ */

/**
 * Why the player cannot play, or null when it can attempt playback.
 *
 * This is the honesty gate. Every one of these states currently ends with a
 * human doing something — there is no background worker to advance them (ADR §5)
 * — so a spinner would spin until the tab closed. Each reason gets its own
 * message because each has a different remedy.
 */
export type PlayerBlockReason =
  | "PENDING_UPLOAD"
  | "PROCESSING"
  | "FAILED"
  | "QUARANTINED"
  | "NO_SOURCE";

export function playerBlockReason(input: {
  processingState: MediaProcessingState;
  src: string | null;
}): PlayerBlockReason | null {
  switch (input.processingState) {
    case "PENDING_UPLOAD":
      return "PENDING_UPLOAD";
    case "UPLOADED":
    case "VALIDATING":
      return "PROCESSING";
    case "FAILED":
      return "FAILED";
    case "QUARANTINED":
      return "QUARANTINED";
    case "READY":
      // READY with no URL means the caller could not mint one — say so plainly
      // rather than mounting a <video src=""> that fails with a browser error.
      return input.src ? null : "NO_SOURCE";
    default:
      return "NO_SOURCE";
  }
}

/** Mapped from the W3C `MediaError.code` values. */
export type MediaErrorKind = "ABORTED" | "NETWORK" | "DECODE" | "UNSUPPORTED" | "UNKNOWN";

export function classifyMediaError(code: number | null | undefined): MediaErrorKind {
  switch (code) {
    case 1:
      return "ABORTED";
    case 2:
      return "NETWORK";
    case 3:
      return "DECODE";
    case 4:
      return "UNSUPPORTED";
    default:
      return "UNKNOWN";
  }
}

/** Only transient failures are worth a retry button. */
export function isRetryableMediaError(kind: MediaErrorKind): boolean {
  return kind === "NETWORK" || kind === "ABORTED" || kind === "UNKNOWN";
}

/**
 * How long the player may sit in `waiting` before it stops claiming to be
 * buffering and reports a stall.
 *
 * A `waiting` event with no matching `playing` event is indistinguishable from a
 * dead connection, and nginx gives up on the upstream at 300s anyway (ADR §2.1),
 * so an unbounded spinner is a promise the platform cannot keep.
 */
export const STALL_TIMEOUT_MS = 15_000;

/* ═══════════════════════════ resume ═══════════════════════════ */

/** Below this, resuming is more annoying than starting over. */
export const RESUME_MIN_SECONDS = 15;
/** Within this of the end, resuming would drop the viewer at the credits. */
export const RESUME_TAIL_SECONDS = 15;

/**
 * The position to resume from, or null when resuming is not worth offering.
 *
 * Returns null for a completed asset: a viewer replaying something they finished
 * wants the beginning, not the last ten seconds of it.
 */
export function resumePosition(
  progress: MediaProgressView | null | undefined,
  durationSeconds: number | null | undefined,
): number | null {
  if (!progress || progress.completed) return null;
  const position = progress.positionSeconds;
  if (!Number.isFinite(position) || position < RESUME_MIN_SECONDS) return null;
  if (
    durationSeconds !== null &&
    durationSeconds !== undefined &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    position >= durationSeconds - RESUME_TAIL_SECONDS
  ) {
    return null;
  }
  return Math.floor(position);
}

/** How often watch progress is reported upstream, in seconds of playback. */
export const PROGRESS_REPORT_INTERVAL_SECONDS = 5;

/** True when enough playback has elapsed since the last report to send another. */
export function shouldReportProgress(
  currentSeconds: number,
  lastReportedSeconds: number | null,
): boolean {
  if (!Number.isFinite(currentSeconds)) return false;
  if (lastReportedSeconds === null) return true;
  return Math.abs(currentSeconds - lastReportedSeconds) >= PROGRESS_REPORT_INTERVAL_SECONDS;
}

/* ═══════════════════════════ status → variant ═══════════════════════════ */

/**
 * Editorial lifecycle → badge variant.
 *
 * PUBLISHED is `success` and REJECTED is `danger`; DRAFT and ARCHIVED stay
 * neutral because neither is a fault — an archived asset is a completed
 * editorial decision, not an error.
 */
export function lifecycleBadgeVariant(status: MediaLifecycleStatus): BadgeVariant {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "SUBMITTED":
    case "IN_REVIEW":
      return "information";
    case "REJECTED":
      return "danger";
    case "ARCHIVED":
    case "DRAFT":
    default:
      return "neutral";
  }
}

/**
 * Processing state → badge variant.
 *
 * QUARANTINED is `danger`, not `warning`. There is no virus scanner (ADR §9), so
 * quarantine is the state where the platform cannot vouch for the bytes at all;
 * an amber "heads up" would understate it.
 */
export function processingBadgeVariant(state: MediaProcessingState): BadgeVariant {
  switch (state) {
    case "READY":
      return "success";
    case "UPLOADED":
    case "VALIDATING":
      return "information";
    case "FAILED":
    case "QUARANTINED":
      return "danger";
    case "PENDING_UPLOAD":
    default:
      return "neutral";
  }
}

/** Skill level → badge variant. Ungraded assets render no badge at all. */
export function skillLevelBadgeVariant(level: MediaSkillLevel): BadgeVariant {
  switch (level) {
    case "BEGINNER":
      return "success";
    case "INTERMEDIATE":
      return "information";
    case "ADVANCED":
      return "warning";
    case "EXPERT":
    default:
      return "brand";
  }
}

/* ═══════════════════════════ filters ═══════════════════════════ */

export const MEDIA_SORT_OPTIONS = [
  "NEWEST",
  "OLDEST",
  "MOST_VIEWED",
  "LONGEST",
  "SHORTEST",
  "TITLE",
] as const;
export type MediaSortOption = (typeof MEDIA_SORT_OPTIONS)[number];
export const DEFAULT_MEDIA_SORT: MediaSortOption = "NEWEST";

/**
 * Duration buckets, in seconds.
 *
 * Bucketed rather than a free numeric range because `durationSeconds` is
 * routinely null (nothing probes it — ADR §9), and a slider implies a precision
 * the data does not have. An asset of unknown length matches no bucket, and
 * `durationBucketOf` returns null to say exactly that.
 */
export const MEDIA_DURATION_BUCKETS = ["SHORT", "MEDIUM", "LONG"] as const;
export type MediaDurationBucket = (typeof MEDIA_DURATION_BUCKETS)[number];

/** Upper bound of SHORT / lower bound of MEDIUM, in seconds (5 minutes). */
export const MEDIA_DURATION_SHORT_MAX_SECONDS = 300;
/** Upper bound of MEDIUM / lower bound of LONG, in seconds (20 minutes). */
export const MEDIA_DURATION_MEDIUM_MAX_SECONDS = 1200;

/** Seconds in a minute, named so the conversions below are not bare `60`s. */
export const SECONDS_PER_MINUTE = 60;

/**
 * The ICU arguments the `mediaHub.duration.*` labels are formatted with.
 *
 * WHY THIS EXISTS
 * The three labels used to spell the boundaries out in words — "Under five
 * minutes", "Unter fünf Minuten", «کمتر از پنج دقیقه». That is two sources of
 * truth for one number: moving `MEDIA_DURATION_SHORT_MAX_SECONDS` to 240 would
 * have re-bucketed every asset while all three languages went on saying "five",
 * and no test could have caught it because the prose was, by construction, not
 * derived from the constant.
 *
 * Now the copy carries `{minutes}` / `{from}` / `{to}` placeholders and the
 * values come from here, so the boundary is stated exactly once — in seconds,
 * next to the comparison that uses it. The labels are minute-valued because the
 * bounds are whole minutes; `assertWholeMinutes` refuses to render a rounded
 * half-truth if that ever stops being so.
 */
function wholeMinutes(seconds: number): number {
  if (seconds % SECONDS_PER_MINUTE !== 0) {
    throw new Error(
      `duration bucket bound ${seconds}s is not a whole number of minutes; the ` +
        "translated labels are minute-valued and would round it",
    );
  }
  return seconds / SECONDS_PER_MINUTE;
}

export const MEDIA_DURATION_BUCKET_LABEL_VALUES: Record<
  MediaDurationBucket,
  Readonly<Record<string, number>>
> = {
  SHORT: { minutes: wholeMinutes(MEDIA_DURATION_SHORT_MAX_SECONDS) },
  MEDIUM: {
    from: wholeMinutes(MEDIA_DURATION_SHORT_MAX_SECONDS),
    to: wholeMinutes(MEDIA_DURATION_MEDIUM_MAX_SECONDS),
  },
  LONG: { minutes: wholeMinutes(MEDIA_DURATION_MEDIUM_MAX_SECONDS) },
};

export const MEDIA_DURATION_BUCKET_BOUNDS: Record<
  MediaDurationBucket,
  { minSeconds: number; maxSeconds: number | null }
> = {
  SHORT: { minSeconds: 0, maxSeconds: MEDIA_DURATION_SHORT_MAX_SECONDS },
  MEDIUM: {
    minSeconds: MEDIA_DURATION_SHORT_MAX_SECONDS,
    maxSeconds: MEDIA_DURATION_MEDIUM_MAX_SECONDS,
  },
  LONG: { minSeconds: MEDIA_DURATION_MEDIUM_MAX_SECONDS, maxSeconds: null },
};

/** Which bucket a duration falls in, or null when the duration is unknown. */
export function durationBucketOf(
  seconds: number | null | undefined,
): MediaDurationBucket | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  if (seconds < MEDIA_DURATION_SHORT_MAX_SECONDS) return "SHORT";
  if (seconds < MEDIA_DURATION_MEDIUM_MAX_SECONDS) return "MEDIUM";
  return "LONG";
}

/** True when `seconds` falls in `bucket`. Unknown durations match nothing. */
export function isDurationInBucket(
  seconds: number | null | undefined,
  bucket: MediaDurationBucket,
): boolean {
  return durationBucketOf(seconds) === bucket;
}

export interface MediaFilterState {
  query: string;
  categoryId: string | null;
  skillLevel: MediaSkillLevel | null;
  duration: MediaDurationBucket | null;
  /** Subtitle/primary language filter, as a platform locale code. */
  language: string | null;
  sort: MediaSortOption;
}

export const EMPTY_MEDIA_FILTERS: MediaFilterState = {
  query: "",
  categoryId: null,
  skillLevel: null,
  duration: null,
  language: null,
  sort: DEFAULT_MEDIA_SORT,
};

/**
 * How many filters are narrowing the result set.
 *
 * The sort order is excluded on purpose: reordering the same rows is not
 * filtering, and counting it would show "1 filter active" on an untouched
 * library and send people hunting for a filter they never set.
 */
export function activeFilterCount(state: MediaFilterState): number {
  let count = 0;
  if (state.query.trim().length > 0) count += 1;
  if (state.categoryId) count += 1;
  if (state.skillLevel) count += 1;
  if (state.duration) count += 1;
  if (state.language) count += 1;
  return count;
}

/** Only non-default values are serialised, so a pristine library has a clean URL. */
export function mediaFiltersToQuery(state: MediaFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  const query = state.query.trim();
  if (query) out.q = query;
  if (state.categoryId) out.category = state.categoryId;
  if (state.skillLevel) out.level = state.skillLevel;
  if (state.duration) out.duration = state.duration;
  if (state.language) out.lang = state.language;
  if (state.sort !== DEFAULT_MEDIA_SORT) out.sort = state.sort;
  return out;
}

function readEnum<T extends readonly string[]>(
  vocabulary: T,
  raw: string | null,
): T[number] | null {
  return raw !== null && (vocabulary as readonly string[]).includes(raw)
    ? (raw as T[number])
    : null;
}

/**
 * Parse filters back out of a query string.
 *
 * Accepts `URLSearchParams` and Next's `ReadonlyURLSearchParams` alike. Every
 * value is checked against its vocabulary, so a hand-edited `?level=SUPERUSER`
 * degrades to "no level filter" instead of being forwarded to the API — the URL
 * is untrusted input like any other.
 */
export function mediaFiltersFromQuery(params: {
  get(key: string): string | null;
}): MediaFilterState {
  return {
    query: params.get("q") ?? "",
    categoryId: params.get("category") || null,
    skillLevel: readEnum(MEDIA_SKILL_LEVELS, params.get("level")),
    duration: readEnum(MEDIA_DURATION_BUCKETS, params.get("duration")),
    language: params.get("lang") || null,
    sort: readEnum(MEDIA_SORT_OPTIONS, params.get("sort")) ?? DEFAULT_MEDIA_SORT,
  };
}

/* ═══════════════════════════ debounce ═══════════════════════════ */

export interface Debounced<A extends readonly unknown[]> {
  call: (...args: A) => void;
  cancel: () => void;
  /** Run any pending call immediately (used on submit / unmount-with-flush). */
  flush: () => void;
}

/**
 * Trailing-edge debounce.
 *
 * Search is debounced rather than submitted because the library list is a cheap
 * read, but it must still be debounced: every keystroke would race, and the
 * response for "PL" can land after the response for "PLC" — the same ordering
 * hazard `OtFilterBar` avoids by requiring an explicit submit. `cancel` exists so
 * an unmounting component cannot fire a request into a dead tree.
 */
export function createDebounced<A extends readonly unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    call: (...args: A) => {
      pending = args;
      clear();
      timer = setTimeout(() => {
        timer = null;
        const queued = pending;
        pending = null;
        if (queued) fn(...queued);
      }, waitMs);
    },
    cancel: () => {
      clear();
      pending = null;
    },
    flush: () => {
      clear();
      const queued = pending;
      pending = null;
      if (queued) fn(...queued);
    },
  };
}

export const MEDIA_SEARCH_DEBOUNCE_MS = 300;
