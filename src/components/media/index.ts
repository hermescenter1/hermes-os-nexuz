/**
 * PHASE 102 — the Hermes Media & Video Hub component library.
 *
 * Design authority: docs/phase102/architecture.md.
 *
 * Import:  import { VideoGrid, MediaPlayer } from "@/components/media";
 *
 * A CAVEAT THAT MATTERS FOR SERVER COMPONENTS. This barrel re-exports both
 * server-renderable presentational components and `"use client"` ones. Importing
 * a *component* from here in a Server Component is fine — Next resolves the
 * boundary. Pulling a plain *value* (a function or constant) out of a
 * client-tainted module is not, so every pure helper lives in the JSX-free
 * `./logic` module and should be deep-imported from there, exactly as
 * `@/components/ds/logic` is. The same applies to the ds barrel, which is why the
 * components in this directory import `cn` and `cardVariants`/`buttonVariants`
 * from `@/components/ds/cn` and `@/components/ds/logic` rather than
 * `@/components/ds`.
 */

// ── Pure logic core (safe in server components, unit-tested in node) ──
export {
  activeChapterIndex,
  activeCueIndex,
  activeFilterCount,
  bufferedFractionAt,
  chapterRange,
  chapterTickFractions,
  classifyMediaError,
  clamp,
  clampTime,
  clampVolume,
  createDebounced,
  CHAPTER_REWIND_THRESHOLD_SECONDS,
  DEFAULT_MEDIA_SORT,
  DEFAULT_PLAYBACK_RATE,
  durationBucketOf,
  EMPTY_MEDIA_FILTERS,
  formatByteSize,
  formatTimecode,
  fractionOfDuration,
  isCompletedProgress,
  isDurationInBucket,
  isPlaybackRate,
  isRetryableMediaError,
  lifecycleBadgeVariant,
  MEDIA_COMPLETION_THRESHOLD_PCT,
  MEDIA_DURATION_BUCKETS,
  MEDIA_DURATION_BUCKET_BOUNDS,
  MEDIA_DURATION_MEDIUM_MAX_SECONDS,
  MEDIA_DURATION_SHORT_MAX_SECONDS,
  MEDIA_SEARCH_DEBOUNCE_MS,
  MEDIA_SORT_OPTIONS,
  mediaFiltersFromQuery,
  mediaFiltersToQuery,
  nextChapterStart,
  normaliseChapters,
  normaliseCues,
  playerBlockReason,
  PLAYBACK_RATES,
  previousChapterStart,
  processingBadgeVariant,
  PROGRESS_REPORT_INTERVAL_SECONDS,
  progressPct,
  resolvePlayerCommand,
  RESUME_MIN_SECONDS,
  RESUME_TAIL_SECONDS,
  resumePosition,
  seekFractionFromPointer,
  SEEK_JUMP_SECONDS,
  SEEK_STEP_SECONDS,
  shouldIgnorePlayerKey,
  shouldReportProgress,
  skillLevelBadgeVariant,
  STALL_TIMEOUT_MS,
  stepPlaybackRate,
  stepVolume,
  timeFromFraction,
  TIMELINE_DIRECTION,
  volumeLevel,
  VOLUME_STEP,
  type BufferedRange,
  type Debounced,
  type MediaDurationBucket,
  type MediaErrorKind,
  type MediaFilterState,
  type MediaSortOption,
  type PlaybackRate,
  type PlayerBlockReason,
  type PlayerCommand,
  type PlayerKeyEvent,
  type PlayerKeyTarget,
  type VolumeLevel,
} from "./logic";

// ── View models ──
export type {
  MediaAttachmentView,
  MediaCardView,
  MediaCategoryView,
  MediaChapterView,
  MediaInstructorView,
  MediaLifecycleStatus,
  MediaLocale,
  MediaPlaybackView,
  MediaProcessingState,
  MediaProgressView,
  MediaSkillLevel,
  MediaSubtitleTrackView,
  MediaTranscriptCueView,
} from "./view-model";

// ── Browsing surfaces ──
export { VideoCard, type VideoCardProps } from "./VideoCard";
export { VideoGrid, type VideoGridProps } from "./VideoGrid";
export { VideoHero, type VideoHeroProps } from "./VideoHero";
export { RelatedVideos, type RelatedVideosProps } from "./RelatedVideos";
export { ContinueWatchingRow, type ContinueWatchingRowProps } from "./ContinueWatchingRow";
export { InstructorCard, type InstructorCardProps } from "./InstructorCard";

// ── Playback ──
export { MediaPlayer, type MediaPlayerProps } from "./MediaPlayer";
export { ChapterList, type ChapterListProps } from "./ChapterList";
export { TranscriptPanel, type TranscriptPanelProps } from "./TranscriptPanel";
export { SubtitleToggle, type SubtitleToggleProps } from "./SubtitleToggle";
export { AttachmentList, type AttachmentListProps } from "./AttachmentList";

// ── Discovery controls ──
export {
  MediaFilters,
  type MediaFiltersProps,
  type MediaLanguageOption,
} from "./MediaFilters";
export { MediaSearchInput, type MediaSearchInputProps } from "./MediaSearchInput";
export { CategoryChips, type CategoryChipsProps } from "./CategoryChips";
export { FavouriteButton, type FavouriteButtonProps } from "./FavouriteButton";

// ── Status surfaces ──
export {
  MediaLifecycleBadge,
  MediaProcessingBadge,
  MediaSkillLevelBadge,
  type MediaLifecycleBadgeProps,
  type MediaProcessingBadgeProps,
  type MediaSkillLevelBadgeProps,
} from "./MediaStateBadge";
export { MediaEmptyState, type MediaEmptyReason, type MediaEmptyStateProps } from "./MediaEmptyState";
export {
  MediaErrorState,
  isRetryableFailure,
  normaliseFailureCode,
  type MediaErrorStateProps,
  type MediaFailureCode,
} from "./MediaErrorState";
