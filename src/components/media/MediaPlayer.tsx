"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";
import { Alert, Button, IconButton, Spinner, TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import {
  activeChapterIndex,
  bufferedFractionAt,
  chapterTickFractions,
  classifyMediaError,
  clampTime,
  clampVolume,
  DEFAULT_PLAYBACK_RATE,
  formatTimecode,
  isRetryableMediaError,
  isPlaybackRate,
  MEDIA_COMPLETION_THRESHOLD_PCT,
  nextChapterStart,
  normaliseChapters,
  playerBlockReason,
  PLAYBACK_RATES,
  previousChapterStart,
  progressPct,
  resolvePlayerCommand,
  resumePosition,
  shouldIgnorePlayerKey,
  shouldReportProgress,
  stepPlaybackRate,
  stepVolume,
  STALL_TIMEOUT_MS,
  TIMELINE_DIRECTION,
  timeFromFraction,
  volumeLevel,
  type BufferedRange,
  type MediaErrorKind,
  type PlaybackRate,
} from "./logic";
import type { MediaLocale, MediaPlaybackView } from "./view-model";

/**
 * PHASE 102 — the Hermes media player.
 *
 * ════════ WHAT THIS PLAYER IS, AND WHAT IT REFUSES TO PRETEND ════════
 *
 * PROGRESSIVE PLAYBACK ONLY. No hls.js, no dash.js, no `MediaSource` — not as a
 * simplification but because the platform genuinely cannot support them: there is
 * no transcoder to produce the segments (ADR §2.6) and `worker-src 'none'` in
 * `src/middleware.ts` breaks the worker mode both libraries rely on (ADR §2.5).
 * A player that shipped an adaptive-streaming code path here would fail at
 * runtime in production and nowhere else. Seeking works because the byte route
 * answers `Range:` with `206 Partial Content` (ADR §4), which is a server
 * property this component simply consumes.
 *
 * IT DEGRADES HONESTLY. Three distinct failure surfaces, never one spinner:
 *   · BLOCKED  — the asset is not servable at all (PENDING_UPLOAD, VALIDATING,
 *                FAILED, QUARANTINED, or READY with no URL). No `<video>` is even
 *                mounted. Each state has its own message because each has a
 *                different remedy, and none of them resolves on its own: there is
 *                no background worker in this platform (ADR §5), so a spinner
 *                would spin until the tab was closed.
 *   · ERROR    — the element reported a `MediaError`. The W3C code is mapped to a
 *                cause, and a retry button appears only for causes where another
 *                attempt could plausibly succeed. A codec the browser cannot
 *                decode will not decode on the second try.
 *   · STALLED  — buffering that has lasted longer than `STALL_TIMEOUT_MS`. The
 *                spinner is replaced by a statement that it is not progressing.
 *                This is the specific lie the brief forbids, and a watchdog is
 *                the only way to avoid it: `waiting` with no matching `playing`
 *                is indistinguishable from a dead socket.
 *
 * NATIVE CONTROLS, NOT DIVS. Every control is a real `<button>` or `<select>`,
 * and both sliders are a real `<input type="range">` — visually transparent over
 * a drawn track, so the design is ours while the semantics, the drag behaviour,
 * the Arrow/Home/End handling and the `slider` role remain the browser's. The
 * one thing a native range does not give us is a guaranteed `aria-valuetext`, so
 * that (and explicit `aria-valuemin/max/now`) is set by hand.
 *
 * ════════ THE RTL TRAP, HANDLED DELIBERATELY ════════
 *
 * Persian is RTL and the entire surface mirrors — labels, control order, panels.
 * The timeline must not. Under an inherited `dir="rtl"` a native range renders
 * its maximum on the LEFT, the browser inverts Arrow-key direction, and pointer
 * arithmetic derived from `clientX - rect.left` disagrees with what is on screen:
 * dragging forwards seeks backwards. Elapsed time is not a language. Both sliders
 * therefore carry an explicit `dir="ltr"` (`TIMELINE_DIRECTION`), the keyboard map
 * is never mirrored, and every timecode renders inside `<bdi dir="ltr">` so
 * "1:05" is not reordered by adjacent Persian text. Everything else stays in the
 * document direction and uses logical properties only.
 *
 * ════════ MOTION ════════
 * No scripted animation and no auto-hiding chrome. Controls stay visible: hiding
 * them behind a hover timer is a WCAG 2.2 hazard for pointer and low-vision users
 * and would have to be re-earned with focus and timing rules. The only
 * transitions are CSS ones, which globals.css already reduces to 0.01ms under
 * `prefers-reduced-motion`.
 */

/* ────────────────────────────── slider ────────────────────────────── */

interface PlayerSliderProps {
  value: number;
  max: number;
  step?: number | "any";
  disabled?: boolean;
  ariaLabel: string;
  ariaValueText?: string;
  onValueChange: (value: number) => void;
  /** Fraction already buffered — seek bar only. */
  bufferedFraction?: number;
  /** Chapter marks, as fractions of the timeline. */
  tickFractions?: readonly number[];
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  trackClassName?: string;
}

/**
 * A native range slider with a drawn track.
 *
 * The input is `opacity-0` and stretched over the visual track: it keeps every
 * native affordance (drag, click-to-position, Arrow/Home/End/PageUp keys, the
 * `slider` role, touch handling) while the pixels are ours. Because the input
 * itself is invisible its focus ring would be too, so the ring is drawn on the
 * wrapper with `focus-within:` — visible focus is preserved, not lost.
 *
 * `dir` is pinned to LTR here and nowhere else in the component.
 */
function PlayerSlider({
  value,
  max,
  step = "any",
  disabled = false,
  ariaLabel,
  ariaValueText,
  onValueChange,
  bufferedFraction = 0,
  tickFractions,
  inputRef,
  className,
  trackClassName,
}: PlayerSliderProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const pct = (n: number): CSSProperties => ({ width: `${n * 100}%` });

  return (
    <div
      dir={TIMELINE_DIRECTION}
      className={cn(
        "relative flex h-5 w-full items-center rounded-full",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-surface-interactive",
          trackClassName,
        )}
      >
        {bufferedFraction > 0 ? (
          <div className="absolute inset-y-0 start-0 bg-text-disabled" style={pct(bufferedFraction)} />
        ) : null}
        <div className="absolute inset-y-0 start-0 bg-brand-primary" style={pct(fraction)} />
        {tickFractions?.map((tick) => (
          <span
            key={tick}
            className="absolute inset-y-0 w-0.5 bg-background-deep"
            style={{ left: `${tick * 100}%` }}
          />
        ))}
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-brand-primary shadow-e1"
        style={{ left: `${fraction * 100}%` }}
      />

      <input
        ref={inputRef}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={ariaValueText}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/* ────────────────────────────── player ────────────────────────────── */

export interface MediaPlayerProps {
  media: MediaPlaybackView;
  /**
   * Which subtitle locale to show on load. `undefined` defers to the track
   * flagged `isDefault`; `null` explicitly starts with captions off.
   */
  initialSubtitleLocale?: MediaLocale | null;
  /** Throttled watch-progress callback (every `PROGRESS_REPORT_INTERVAL_SECONDS`). */
  onProgress?: (progress: { positionSeconds: number; progressPct: number }) => void;
  onPlay?: () => void;
  /** Fired once, when playback passes the completion threshold or ends. */
  onComplete?: () => void;
  /** Fired when the playhead crosses into a different chapter (-1 = before the first). */
  onChapterChange?: (index: number) => void;
  className?: string;
}

export function MediaPlayer({
  media,
  initialSubtitleLocale,
  onProgress,
  onPlay,
  onComplete,
  onChapterChange,
  className,
}: MediaPlayerProps) {
  const t = useTranslations("mediaHub");
  const baseId = useId();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const lastReportedRef = useRef<number | null>(null);
  const completedFiredRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const lastChapterRef = useRef<number>(-2); // -2 = "never reported", distinct from -1

  const chapters = useMemo(() => normaliseChapters(media.chapters), [media.chapters]);
  const block = playerBlockReason({ processingState: media.processingState, src: media.src });
  const resumeAt = useMemo(
    () => resumePosition(media.progress, media.durationSeconds),
    [media.progress, media.durationSeconds],
  );

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(
    media.durationSeconds !== null && Number.isFinite(media.durationSeconds)
      ? media.durationSeconds
      : 0,
  );
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(DEFAULT_PLAYBACK_RATE);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [errorKind, setErrorKind] = useState<MediaErrorKind | null>(null);
  const [playRejected, setPlayRejected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenUnsupported, setFullscreenUnsupported] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const defaultTrackLocale =
    initialSubtitleLocale !== undefined
      ? initialSubtitleLocale
      : (media.subtitleTracks.find((track) => track.isDefault)?.locale ?? null);
  const [subtitleLocale, setSubtitleLocale] = useState<MediaLocale | null>(defaultTrackLocale);

  const hasDuration = duration > 0 && Number.isFinite(duration);
  const seekMax = hasDuration ? duration : 0;
  const watchedPct = progressPct(currentTime, hasDuration ? duration : null);
  const chapterIndex = activeChapterIndex(chapters, currentTime);

  /* ── element commands ─────────────────────────────────────────────── */

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = clampTime(seconds, hasDuration ? duration : null);
      video.currentTime = target;
      setCurrentTime(target);
    },
    [duration, hasDuration],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const started = video.play();
      // `play()` returns a promise in every modern browser but not in jsdom, and
      // it rejects on autoplay policy or an aborted load. An unhandled rejection
      // here would surface as a console error and nothing the user can act on.
      if (started && typeof started.catch === "function") {
        started.catch(() => setPlayRejected(true));
      }
    } else {
      video.pause();
    }
  }, []);

  const applyVolume = useCallback(
    (next: number) => {
      const value = clampVolume(next);
      const video = videoRef.current;
      setVolumeState(value);
      if (video) {
        video.volume = value;
        // Raising the volume from a muted state is an unmute — otherwise the
        // slider moves and nothing is heard, which reads as a broken control.
        if (value > 0 && video.muted) video.muted = false;
      }
      if (value > 0 && muted) setMuted(false);
    },
    [muted],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const next = !(video ? video.muted : muted);
    if (video) video.muted = next;
    setMuted(next);
    setAnnouncement(next ? t("player.announce.muted") : t("player.announce.unmuted"));
  }, [muted, t]);

  const applyRate = useCallback((next: number) => {
    if (!isPlaybackRate(next)) return;
    const video = videoRef.current;
    if (video) video.playbackRate = next;
    setRate(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const doc: Document = document;
    if (doc.fullscreenElement) {
      if (typeof doc.exitFullscreen === "function") void doc.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof frame.requestFullscreen === "function") {
      void frame.requestFullscreen().catch(() => setFullscreenUnsupported(true));
      return;
    }
    // Some embedded webviews (and jsdom) expose no Fullscreen API at all. Say so
    // rather than leaving a control that silently does nothing.
    setFullscreenUnsupported(true);
  }, []);

  const toggleCaptions = useCallback(() => {
    if (media.subtitleTracks.length === 0) {
      setAnnouncement(t("subtitles.unavailable"));
      return;
    }
    setSubtitleLocale((current) => (current === null ? media.subtitleTracks[0].locale : null));
  }, [media.subtitleTracks, t]);

  /* ── keyboard map ─────────────────────────────────────────────────── */

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        shouldIgnorePlayerKey(
          target
            ? {
                tagName: target.tagName,
                isContentEditable: target.isContentEditable,
              }
            : null,
          event.key,
        )
      ) {
        return;
      }
      const command = resolvePlayerCommand(event);
      if (!command) return;
      event.preventDefault();

      switch (command.kind) {
        case "TOGGLE_PLAY":
          togglePlay();
          break;
        case "SEEK_BY":
          seekTo(currentTime + command.seconds);
          break;
        case "SEEK_TO_FRACTION":
          if (hasDuration) seekTo(timeFromFraction(command.fraction, duration));
          break;
        case "SEEK_TO_START":
          seekTo(0);
          break;
        case "SEEK_TO_END":
          if (hasDuration) seekTo(duration);
          break;
        case "VOLUME_BY":
          applyVolume(stepVolume(volume, command.delta));
          break;
        case "TOGGLE_MUTE":
          toggleMute();
          break;
        case "TOGGLE_FULLSCREEN":
          toggleFullscreen();
          break;
        case "TOGGLE_CAPTIONS":
          toggleCaptions();
          break;
        case "RATE_STEP": {
          const next = stepPlaybackRate(rate, command.direction);
          applyRate(next);
          setAnnouncement(t("player.announce.rate", { rate: String(next) }));
          break;
        }
        case "NEXT_CHAPTER": {
          const next = nextChapterStart(chapters, currentTime);
          if (next !== null) seekTo(next);
          break;
        }
        case "PREVIOUS_CHAPTER": {
          const previous = previousChapterStart(chapters, currentTime);
          if (previous !== null) seekTo(previous);
          break;
        }
        default:
          break;
      }
    },
    [
      applyRate,
      applyVolume,
      chapters,
      currentTime,
      duration,
      hasDuration,
      rate,
      seekTo,
      t,
      toggleCaptions,
      toggleFullscreen,
      toggleMute,
      togglePlay,
      volume,
    ],
  );

  /* ── effects ──────────────────────────────────────────────────────── */

  // Stall watchdog. A `waiting` that never resolves must stop claiming to buffer.
  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // Text-track modes follow `subtitleLocale`. `textTracks` is absent in jsdom and
  // in browsers before the tracks have loaded, so the guard is load-bearing.
  useEffect(() => {
    const video = videoRef.current;
    const tracks = video?.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      track.mode = subtitleLocale !== null && track.language === subtitleLocale ? "showing" : "disabled";
    }
  }, [subtitleLocale, media.subtitleTracks]);

  // Fullscreen is changed by the browser too (Esc, F11), so mirror the document.
  useEffect(() => {
    const onChange = (): void => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Report chapter crossings once each, including the crossing into "no chapter".
  useEffect(() => {
    if (!onChapterChange) return;
    if (lastChapterRef.current === chapterIndex) return;
    lastChapterRef.current = chapterIndex;
    onChapterChange(chapterIndex);
  }, [chapterIndex, onChapterChange]);

  /* ── media element events ─────────────────────────────────────────── */

  const readBuffered = useCallback((video: HTMLVideoElement) => {
    const ranges: BufferedRange[] = [];
    const source = video.buffered;
    if (source) {
      for (let i = 0; i < source.length; i += 1) {
        ranges.push({ start: source.start(i), end: source.end(i) });
      }
    }
    setBuffered(bufferedFractionAt(ranges, video.currentTime, video.duration));
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    if (!resumeAppliedRef.current && resumeAt !== null) {
      resumeAppliedRef.current = true;
      video.currentTime = resumeAt;
      setCurrentTime(resumeAt);
      setResumeNotice(resumeAt);
    }
  }, [resumeAt]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const position = video.currentTime;
    setCurrentTime(position);

    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const pct = progressPct(position, total);

    if (onProgress && shouldReportProgress(position, lastReportedRef.current)) {
      lastReportedRef.current = position;
      onProgress({ positionSeconds: Math.floor(position), progressPct: pct });
    }
    if (onComplete && !completedFiredRef.current && pct >= MEDIA_COMPLETION_THRESHOLD_PCT) {
      completedFiredRef.current = true;
      onComplete();
    }
  }, [onComplete, onProgress]);

  const handleError = useCallback(() => {
    const video = videoRef.current;
    setWaiting(false);
    setStalled(false);
    setErrorKind(classifyMediaError(video?.error?.code));
  }, []);

  const retryPlayback = useCallback(() => {
    const video = videoRef.current;
    setErrorKind(null);
    setStalled(false);
    setPlayRejected(false);
    if (video && typeof video.load === "function") video.load();
  }, []);

  /* ── blocked: nothing is servable ─────────────────────────────────── */

  if (block !== null) {
    return (
      <section
        aria-label={t("player.region", { title: media.title })}
        className={cn("ds-glass-elevated overflow-hidden rounded-lg", className)}
      >
        <div className="relative aspect-video w-full bg-background-deep">
          {media.posterUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- see VideoCard;
               next/image would route this through the sharp-backed optimizer. */
            <img
              src={media.posterUrl}
              alt=""
              className="h-full w-full object-cover opacity-40"
            />
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Alert
              variant={block === "FAILED" || block === "QUARANTINED" ? "danger" : "information"}
              title={t(`player.blocked.${block}.title`)}
              className="max-w-md"
            >
              {t(`player.blocked.${block}.body`)}
            </Alert>
          </div>
        </div>
      </section>
    );
  }

  /* ── playable ─────────────────────────────────────────────────────── */

  const level = volumeLevel(volume, muted);
  const captionsOn = subtitleLocale !== null;
  const timeLabel = t("player.timeOf", {
    current: formatTimecode(currentTime),
    total: hasDuration ? formatTimecode(duration) : t("player.durationUnknown"),
  });

  return (
    <section
      aria-label={t("player.region", { title: media.title })}
      aria-describedby={`${baseId}-help`}
      className={cn("ds-glass-elevated overflow-hidden rounded-lg", className)}
    >
      <div
        ref={frameRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative bg-background-deep outline-none"
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are
            supplied through <track> below whenever the asset has any. An asset
            with no uploaded WebVTT track genuinely has no captions, and there is
            no speech-to-text engine to invent them (ADR §9); the SubtitleToggle
            reports their absence rather than the player faking a track. */}
        <video
          ref={videoRef}
          // `src` is non-null here: `playerBlockReason` returns NO_SOURCE otherwise.
          src={media.src ?? undefined}
          poster={media.posterUrl ?? undefined}
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-background-deep"
          onClick={() => {
            frameRef.current?.focus();
            togglePlay();
          }}
          onDoubleClick={toggleFullscreen}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={() => {
            const video = videoRef.current;
            if (video && Number.isFinite(video.duration) && video.duration > 0) {
              setDuration(video.duration);
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onProgress={() => {
            const video = videoRef.current;
            if (video) readBuffered(video);
          }}
          onPlay={() => {
            setPlaying(true);
            setPlayRejected(false);
            setAnnouncement(t("player.announce.playing"));
            onPlay?.();
          }}
          onPause={() => {
            setPlaying(false);
            setAnnouncement(t("player.announce.paused"));
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => {
            setWaiting(false);
            setErrorKind(null);
          }}
          onCanPlay={() => setWaiting(false)}
          onSeeked={() => {
            const video = videoRef.current;
            if (video) {
              setCurrentTime(video.currentTime);
              readBuffered(video);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            if (onComplete && !completedFiredRef.current) {
              completedFiredRef.current = true;
              onComplete();
            }
          }}
          onVolumeChange={() => {
            const video = videoRef.current;
            if (!video) return;
            setVolumeState(clampVolume(video.volume));
            setMuted(video.muted);
          }}
          onRateChange={() => {
            const video = videoRef.current;
            if (video && isPlaybackRate(video.playbackRate)) setRate(video.playbackRate);
          }}
          onError={handleError}
        >
          {media.subtitleTracks.map((track) => (
            <track
              key={track.id}
              kind="subtitles"
              src={track.src}
              srcLang={track.locale}
              label={track.label}
              default={track.locale === defaultTrackLocale}
            />
          ))}
        </video>

        {/* ── buffering / stalled / error overlays ─────────────────── */}
        {errorKind !== null ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background-deep/85 p-6">
            <Alert variant="danger" title={t(`player.error.${errorKind}.title`)} className="max-w-md">
              <p>{t(`player.error.${errorKind}.body`)}</p>
              {isRetryableMediaError(errorKind) ? (
                <Button variant="secondary" size="sm" className="mt-3" onClick={retryPlayback}>
                  {t("player.error.retry")}
                </Button>
              ) : null}
            </Alert>
          </div>
        ) : stalled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background-deep/85 p-6">
            <Alert variant="warning" title={t("player.stalled.title")} className="max-w-md">
              <p>{t("player.stalled.body")}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={retryPlayback}>
                {t("player.error.retry")}
              </Button>
            </Alert>
          </div>
        ) : waiting ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner size={32} className="text-brand-primary" />
            <span className="sr-only">{t("player.buffering")}</span>
          </div>
        ) : null}

        {/* ── controls ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 bg-background-deep/80 px-3 py-2">
          <div className="flex items-center gap-3">
            <PlayerSlider
              value={hasDuration ? Math.min(currentTime, duration) : 0}
              max={seekMax}
              disabled={!hasDuration}
              ariaLabel={t("player.seek")}
              ariaValueText={timeLabel}
              onValueChange={seekTo}
              bufferedFraction={buffered}
              tickFractions={chapterTickFractions(chapters, hasDuration ? duration : null)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              variant="tertiary"
              size="md"
              aria-label={playing ? t("player.pause") : t("player.play")}
              aria-pressed={playing}
              icon={<span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>}
              onClick={togglePlay}
            />

            {chapters.length > 0 ? (
              <>
                <IconButton
                  variant="tertiary"
                  size="md"
                  aria-label={t("chapters.previous")}
                  icon={<span aria-hidden="true" className="rtl:-scale-x-100">⏮</span>}
                  onClick={() => {
                    const previous = previousChapterStart(chapters, currentTime);
                    if (previous !== null) seekTo(previous);
                  }}
                />
                <IconButton
                  variant="tertiary"
                  size="md"
                  aria-label={t("chapters.next")}
                  icon={<span aria-hidden="true" className="rtl:-scale-x-100">⏭</span>}
                  onClick={() => {
                    const next = nextChapterStart(chapters, currentTime);
                    if (next !== null) seekTo(next);
                  }}
                />
              </>
            ) : null}

            <IconButton
              variant="tertiary"
              size="md"
              aria-label={muted ? t("player.unmute") : t("player.mute")}
              aria-pressed={muted}
              icon={
                <span aria-hidden="true">
                  {level === "muted" ? "🔇" : level === "low" ? "🔈" : level === "medium" ? "🔉" : "🔊"}
                </span>
              }
              onClick={toggleMute}
            />

            <div className="w-24">
              <PlayerSlider
                value={muted ? 0 : volume}
                max={1}
                step={0.05}
                ariaLabel={t("player.volume")}
                ariaValueText={t("player.volumePct", { pct: Math.round((muted ? 0 : volume) * 100) })}
                onValueChange={applyVolume}
              />
            </div>

            <p className="text-label-compact text-text-secondary">
              <TechnicalValue mono={false}>{formatTimecode(currentTime)}</TechnicalValue>
              <span aria-hidden="true" className="mx-1 text-text-disabled">
                /
              </span>
              <TechnicalValue mono={false}>
                {hasDuration ? formatTimecode(duration) : "—"}
              </TechnicalValue>
              <span className="sr-only">{timeLabel}</span>
            </p>

            <div className="ms-auto flex items-center gap-2">
              <label className="sr-only" htmlFor={`${baseId}-rate`}>
                {t("player.speed")}
              </label>
              <select
                id={`${baseId}-rate`}
                value={rate}
                onChange={(event) => applyRate(Number(event.target.value))}
                className={cn(
                  "ds-focus h-8 rounded-sm border border-border-default bg-surface-interactive px-2",
                  "text-label-compact text-text-primary hover:border-border-active",
                )}
              >
                {PLAYBACK_RATES.map((option) => (
                  <option key={option} value={option}>
                    {/* A numeric multiplier needs no translation, and inventing a
                        catalog entry per rate would be seven keys of noise. */}
                    {option}&#215;
                  </option>
                ))}
              </select>

              <IconButton
                variant="tertiary"
                size="md"
                aria-label={captionsOn ? t("subtitles.turnOff") : t("subtitles.turnOn")}
                aria-pressed={captionsOn}
                disabled={media.subtitleTracks.length === 0}
                icon={<span aria-hidden="true">CC</span>}
                className="text-label-compact font-semibold"
                onClick={toggleCaptions}
              />

              <IconButton
                variant="tertiary"
                size="md"
                aria-label={fullscreen ? t("player.exitFullscreen") : t("player.enterFullscreen")}
                aria-pressed={fullscreen}
                icon={<span aria-hidden="true">{fullscreen ? "⤡" : "⤢"}</span>}
                onClick={toggleFullscreen}
              />
            </div>
          </div>

          {/* Resume notice — announced, dismissable, and reversible. Seeking the
              viewer back without telling them is disorienting; offering only a
              notice without the "start over" escape is worse. */}
          {resumeNotice !== null ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sm bg-surface-interactive px-3 py-1.5">
              <p role="status" aria-live="polite" className="text-label-compact text-text-secondary">
                {t("player.resumedAt", { time: formatTimecode(resumeNotice) })}
              </p>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => {
                  seekTo(0);
                  setResumeNotice(null);
                }}
              >
                {t("player.startOver")}
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setResumeNotice(null)}>
                {t("player.dismiss")}
              </Button>
            </div>
          ) : null}

          {playRejected ? (
            <Alert variant="warning" title={t("player.blockedByBrowser.title")}>
              {t("player.blockedByBrowser.body")}
            </Alert>
          ) : null}

          {fullscreenUnsupported ? (
            <Alert variant="information" title={t("player.fullscreenUnavailable.title")}>
              {t("player.fullscreenUnavailable.body")}
            </Alert>
          ) : null}
        </div>
      </div>

      {/* Live region for state changes, and the keyboard map for screen readers. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p id={`${baseId}-help`} className="sr-only">
        {t("player.keyboardHelp")}
      </p>
      <span className="sr-only">{t("player.watchedPct", { pct: watchedPct })}</span>
    </section>
  );
}
