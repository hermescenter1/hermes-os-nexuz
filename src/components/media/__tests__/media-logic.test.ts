import { describe, expect, it, vi } from "vitest";
import {
  activeChapterIndex,
  activeCueIndex,
  activeFilterCount,
  bufferedFractionAt,
  chapterRange,
  chapterTickFractions,
  classifyMediaError,
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
  progressPct,
  resolvePlayerCommand,
  RESUME_MIN_SECONDS,
  resumePosition,
  seekFractionFromPointer,
  SEEK_JUMP_SECONDS,
  SEEK_STEP_SECONDS,
  shouldIgnorePlayerKey,
  shouldReportProgress,
  skillLevelBadgeVariant,
  stepPlaybackRate,
  stepVolume,
  timeFromFraction,
  TIMELINE_DIRECTION,
  volumeLevel,
  VOLUME_STEP,
} from "../logic";
import {
  MEDIA_LIFECYCLE_STATUSES,
  MEDIA_PROCESSING_STATES,
  MEDIA_SKILL_LEVELS,
} from "@/lib/media/types";
import type { MediaChapterView, MediaTranscriptCueView } from "../view-model";

/**
 * PHASE 102 — the media component logic core.
 *
 * Everything a player decides that does not need a DOM is tested here, in the
 * node environment. That is not a convenience: jsdom implements almost none of
 * HTMLMediaElement, so seek arithmetic, the keyboard map and chapter lookup would
 * be nearly untestable if they lived inside the component. The runtime tests
 * beside this file then only have to prove the wiring.
 */

const chapter = (id: string, startSeconds: number): MediaChapterView => ({
  id,
  title: `Chapter ${id}`,
  startSeconds,
});

const cue = (
  id: string,
  startSeconds: number,
  endSeconds: number | null = null,
): MediaTranscriptCueView => ({ id, startSeconds, endSeconds, text: `cue ${id}`, speaker: null });

/* ═══════════════════════════ formatting ═══════════════════════════ */

describe("formatTimecode", () => {
  it("formats under an hour as m:ss and past an hour as h:mm:ss", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(5)).toBe("0:05");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
    expect(formatTimecode(3599)).toBe("59:59");
    expect(formatTimecode(3600)).toBe("1:00:00");
    expect(formatTimecode(3723)).toBe("1:02:03");
    expect(formatTimecode(36000)).toBe("10:00:00");
  });

  it("truncates rather than rounds, so the label never runs ahead of the playhead", () => {
    expect(formatTimecode(59.9)).toBe("0:59");
    expect(formatTimecode(119.999)).toBe("1:59");
  });

  it("collapses every non-value to 0:00 instead of emitting NaN", () => {
    // A media element reports NaN before metadata and Infinity for a live stream.
    expect(formatTimecode(Number.NaN)).toBe("0:00");
    expect(formatTimecode(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatTimecode(-30)).toBe("0:00");
    expect(formatTimecode(null)).toBe("0:00");
    expect(formatTimecode(undefined)).toBe("0:00");
  });
});

describe("formatByteSize", () => {
  it("scales through the SI symbols", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(2048)).toBe("2 KB");
    expect(formatByteSize(1024 * 1024 * 3.5)).toBe("3.5 MB");
    expect(formatByteSize(1024 * 1024 * 1024 * 2)).toBe("2 GB");
  });

  it("drops the decimal past ten, where it is noise", () => {
    expect(formatByteSize(1024 * 1024 * 12.4)).toBe("12 MB");
  });

  it("returns null for an unknown size — an unrecorded length is not an empty file", () => {
    expect(formatByteSize(null)).toBeNull();
    expect(formatByteSize(undefined)).toBeNull();
    expect(formatByteSize(Number.NaN)).toBeNull();
    expect(formatByteSize(-1)).toBeNull();
    // Zero is a real, recorded size and must NOT be swallowed.
    expect(formatByteSize(0)).toBe("0 B");
  });
});

/* ═══════════════════════════ range maths ═══════════════════════════ */

describe("timeline arithmetic", () => {
  it("pins the timeline to LTR in every locale", () => {
    // The RTL trap: an inherited dir="rtl" inverts a native range slider and the
    // browser's own Arrow handling, so a forward drag seeks backwards.
    expect(TIMELINE_DIRECTION).toBe("ltr");
  });

  it("clamps a position into the known duration", () => {
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(150, 100)).toBe(100);
    expect(clampTime(-10, 100)).toBe(0);
  });

  it("leaves a position uncapped while the duration is unknown", () => {
    // Before loadedmetadata there is no ceiling to clamp against; inventing one
    // (say, 0) would make every seek land at the start.
    expect(clampTime(50, null)).toBe(50);
    expect(clampTime(50, Number.NaN)).toBe(50);
    expect(clampTime(50, 0)).toBe(50);
  });

  it("maps position ↔ fraction, and refuses to divide by an unknown duration", () => {
    expect(fractionOfDuration(30, 120)).toBeCloseTo(0.25);
    expect(fractionOfDuration(200, 120)).toBe(1);
    expect(fractionOfDuration(30, null)).toBe(0);
    expect(fractionOfDuration(30, 0)).toBe(0);
    expect(timeFromFraction(0.5, 120)).toBe(60);
    expect(timeFromFraction(2, 120)).toBe(120);
    expect(timeFromFraction(0.5, null)).toBe(0);
  });

  it("computes the pointer fraction left-to-right regardless of locale", () => {
    const rect = { left: 100, width: 400 };
    expect(seekFractionFromPointer(100, rect)).toBe(0);
    expect(seekFractionFromPointer(300, rect)).toBe(0.5);
    expect(seekFractionFromPointer(500, rect)).toBe(1);
    // Outside the rect on either side saturates rather than seeking past the ends.
    expect(seekFractionFromPointer(0, rect)).toBe(0);
    expect(seekFractionFromPointer(900, rect)).toBe(1);
  });

  it("survives a zero-width rect (element measured before layout)", () => {
    expect(seekFractionFromPointer(50, { left: 0, width: 0 })).toBe(0);
  });

  it("reports whole-percent progress and the completion threshold", () => {
    expect(progressPct(0, 100)).toBe(0);
    expect(progressPct(50, 100)).toBe(50);
    expect(progressPct(999, 100)).toBe(100);
    expect(progressPct(50, null)).toBe(0);
    expect(isCompletedProgress(MEDIA_COMPLETION_THRESHOLD_PCT)).toBe(true);
    expect(isCompletedProgress(MEDIA_COMPLETION_THRESHOLD_PCT - 1)).toBe(false);
  });
});

describe("bufferedFractionAt", () => {
  it("reports the end of the range that actually contains the playhead", () => {
    const ranges = [{ start: 0, end: 30 }];
    expect(bufferedFractionAt(ranges, 10, 120)).toBeCloseTo(0.25);
  });

  it("ignores a far-ahead range left over from an earlier seek", () => {
    // The lie this prevents: a stalled player drawing a full buffer bar because
    // some unrelated region happens to be cached.
    const ranges = [{ start: 90, end: 120 }];
    expect(bufferedFractionAt(ranges, 10, 120)).toBe(0);
  });

  it("returns 0 with no ranges or no known duration", () => {
    expect(bufferedFractionAt([], 10, 120)).toBe(0);
    expect(bufferedFractionAt([{ start: 0, end: 30 }], 10, null)).toBe(0);
  });
});

/* ═══════════════════════════ volume & rate ═══════════════════════════ */

describe("volume", () => {
  it("clamps and steps without floating-point drift", () => {
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    let v = 0;
    for (let i = 0; i < 7; i += 1) v = stepVolume(v, VOLUME_STEP);
    expect(v).toBe(0.35); // not 0.35000000000000004
    expect(stepVolume(1, VOLUME_STEP)).toBe(1);
    expect(stepVolume(0, -VOLUME_STEP)).toBe(0);
  });

  it("lets muted win over any volume value when choosing the glyph", () => {
    expect(volumeLevel(0, false)).toBe("muted");
    expect(volumeLevel(0.2, false)).toBe("low");
    expect(volumeLevel(0.5, false)).toBe("medium");
    expect(volumeLevel(1, false)).toBe("high");
    // A muted player at full volume must not show a full speaker.
    expect(volumeLevel(1, true)).toBe("muted");
  });
});

describe("playback rate", () => {
  it("recognises only offered rates", () => {
    for (const rate of PLAYBACK_RATES) expect(isPlaybackRate(rate)).toBe(true);
    expect(isPlaybackRate(3)).toBe(false);
    expect(isPlaybackRate("1")).toBe(false);
    expect(isPlaybackRate(null)).toBe(false);
  });

  it("steps one notch and saturates at both ends", () => {
    expect(stepPlaybackRate(1, 1)).toBe(1.25);
    expect(stepPlaybackRate(1, -1)).toBe(0.75);
    expect(stepPlaybackRate(2, 1)).toBe(2);
    expect(stepPlaybackRate(0.5, -1)).toBe(0.5);
  });

  it("recovers to the default when the current rate is not one of ours", () => {
    // e.g. a browser extension set playbackRate to 3.
    expect(stepPlaybackRate(3, 1)).toBe(stepPlaybackRate(DEFAULT_PLAYBACK_RATE, 1));
  });
});

/* ═══════════════════════════ chapters ═══════════════════════════ */

describe("normaliseChapters", () => {
  it("sorts by start time", () => {
    const out = normaliseChapters([chapter("c", 90), chapter("a", 0), chapter("b", 30)]);
    expect(out.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("drops a duplicate start, which would otherwise be unreachable by seeking", () => {
    const out = normaliseChapters([chapter("a", 30), chapter("b", 30)]);
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("drops non-finite and negative marks", () => {
    const out = normaliseChapters([
      chapter("a", 0),
      chapter("bad", Number.NaN),
      chapter("neg", -5),
    ]);
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("does not mutate its input", () => {
    const input = [chapter("b", 30), chapter("a", 0)];
    normaliseChapters(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("activeChapterIndex", () => {
  const chapters = normaliseChapters([chapter("a", 30), chapter("b", 60), chapter("c", 120)]);

  it("finds the chapter containing the playhead", () => {
    expect(activeChapterIndex(chapters, 30)).toBe(0);
    expect(activeChapterIndex(chapters, 59.9)).toBe(0);
    expect(activeChapterIndex(chapters, 60)).toBe(1);
    expect(activeChapterIndex(chapters, 9999)).toBe(2);
  });

  it("returns -1 before the first mark — that gap belongs to no chapter", () => {
    // Highlighting chapter 1 through a 30-second cold open would be a false claim
    // on screen for thirty seconds.
    expect(activeChapterIndex(chapters, 0)).toBe(-1);
    expect(activeChapterIndex(chapters, 29.99)).toBe(-1);
    expect(activeChapterIndex([], 10)).toBe(-1);
    expect(activeChapterIndex(chapters, Number.NaN)).toBe(-1);
  });
});

describe("chapter ranges and ticks", () => {
  const chapters = normaliseChapters([chapter("a", 0), chapter("b", 60)]);

  it("ends a chapter at the next start, and the last one at the duration", () => {
    expect(chapterRange(chapters, 0, 200)).toEqual({ start: 0, end: 60 });
    expect(chapterRange(chapters, 1, 200)).toEqual({ start: 60, end: 200 });
  });

  it("leaves the last chapter open-ended when the duration is unknown", () => {
    expect(chapterRange(chapters, 1, null)).toEqual({ start: 60, end: null });
  });

  it("returns a safe range for an index that does not exist", () => {
    expect(chapterRange(chapters, 99, 200)).toEqual({ start: 0, end: null });
  });

  it("emits ticks only for interior marks, and none without a duration", () => {
    // A tick at 0% or 100% is a mark on the slider's own end cap — visual noise.
    expect(chapterTickFractions(chapters, 200)).toEqual([0.3]);
    expect(chapterTickFractions(chapters, null)).toEqual([]);
  });
});

describe("chapter transport", () => {
  const chapters = normaliseChapters([chapter("a", 0), chapter("b", 60), chapter("c", 120)]);

  it("skips forward to the next start, and reports null at the last chapter", () => {
    expect(nextChapterStart(chapters, 10)).toBe(60);
    expect(nextChapterStart(chapters, 60)).toBe(120);
    expect(nextChapterStart(chapters, 130)).toBeNull();
  });

  it("rewinds to the current chapter's start once past the threshold", () => {
    // The transport convention every CD player and podcast app shares.
    expect(previousChapterStart(chapters, 60 + CHAPTER_REWIND_THRESHOLD_SECONDS + 1)).toBe(60);
  });

  it("steps back a whole chapter when pressed near a chapter start", () => {
    expect(previousChapterStart(chapters, 61)).toBe(0);
  });

  it("stays at the first chapter's start rather than seeking before it", () => {
    expect(previousChapterStart(chapters, 1)).toBe(0);
  });

  it("returns null before the first chapter, where there is nothing to step back to", () => {
    const later = normaliseChapters([chapter("a", 30)]);
    expect(previousChapterStart(later, 10)).toBeNull();
  });
});

/* ═══════════════════════════ transcript ═══════════════════════════ */

describe("activeCueIndex", () => {
  it("finds the cue covering the playhead", () => {
    const cues = normaliseCues([cue("a", 0), cue("b", 10), cue("c", 20)]);
    expect(activeCueIndex(cues, 0)).toBe(0);
    expect(activeCueIndex(cues, 9.9)).toBe(0);
    expect(activeCueIndex(cues, 10)).toBe(1);
    expect(activeCueIndex(cues, 100)).toBe(2);
  });

  it("stops highlighting at an explicit end — silence must not look like speech", () => {
    const cues = normaliseCues([cue("a", 0, 5), cue("b", 20, 25)]);
    expect(activeCueIndex(cues, 4.9)).toBe(0);
    expect(activeCueIndex(cues, 5)).toBe(-1);
    expect(activeCueIndex(cues, 12)).toBe(-1);
    expect(activeCueIndex(cues, 20)).toBe(1);
  });

  it("returns -1 before the first cue and for an empty transcript", () => {
    const cues = normaliseCues([cue("a", 30)]);
    expect(activeCueIndex(cues, 10)).toBe(-1);
    expect(activeCueIndex([], 10)).toBe(-1);
    expect(activeCueIndex(cues, Number.NaN)).toBe(-1);
  });

  it("agrees with a linear scan across a large transcript (binary-search check)", () => {
    const cues = normaliseCues(
      Array.from({ length: 2000 }, (_, i) => cue(String(i), i * 3, i * 3 + 2)),
    );
    const linear = (position: number): number => {
      let found = -1;
      for (let i = 0; i < cues.length; i += 1) {
        const c = cues[i];
        if (c.startSeconds <= position && (c.endSeconds === null || position < c.endSeconds)) {
          found = i;
        }
      }
      return found;
    };
    for (const position of [0, 1.5, 2, 2.5, 3, 1499, 2999.5, 5997, 5999, 100000]) {
      expect(activeCueIndex(cues, position)).toBe(linear(position));
    }
  });
});

/* ═══════════════════════════ keyboard map ═══════════════════════════ */

describe("resolvePlayerCommand", () => {
  it("maps play/pause to Space and K", () => {
    expect(resolvePlayerCommand({ key: " " })).toEqual({ kind: "TOGGLE_PLAY" });
    expect(resolvePlayerCommand({ key: "Spacebar" })).toEqual({ kind: "TOGGLE_PLAY" });
    expect(resolvePlayerCommand({ key: "k" })).toEqual({ kind: "TOGGLE_PLAY" });
    expect(resolvePlayerCommand({ key: "K" })).toEqual({ kind: "TOGGLE_PLAY" });
  });

  it("maps arrows to a short seek and J/L to a ten-second jump", () => {
    expect(resolvePlayerCommand({ key: "ArrowRight" })).toEqual({
      kind: "SEEK_BY",
      seconds: SEEK_STEP_SECONDS,
    });
    expect(resolvePlayerCommand({ key: "ArrowLeft" })).toEqual({
      kind: "SEEK_BY",
      seconds: -SEEK_STEP_SECONDS,
    });
    expect(resolvePlayerCommand({ key: "l" })).toEqual({
      kind: "SEEK_BY",
      seconds: SEEK_JUMP_SECONDS,
    });
    expect(resolvePlayerCommand({ key: "J" })).toEqual({
      kind: "SEEK_BY",
      seconds: -SEEK_JUMP_SECONDS,
    });
  });

  it("NEVER mirrors the arrows for RTL", () => {
    // The timeline renders LTR in every locale (TIMELINE_DIRECTION), so an
    // inverted arrow would contradict what is on screen. There is no locale
    // parameter here at all — the map cannot be mirrored by accident.
    const right = resolvePlayerCommand({ key: "ArrowRight" });
    expect(right).toEqual({ kind: "SEEK_BY", seconds: SEEK_STEP_SECONDS });
    expect(SEEK_STEP_SECONDS).toBeGreaterThan(0);
  });

  it("maps 0-9 to tenths of the timeline", () => {
    expect(resolvePlayerCommand({ key: "0" })).toEqual({ kind: "SEEK_TO_FRACTION", fraction: 0 });
    expect(resolvePlayerCommand({ key: "5" })).toEqual({ kind: "SEEK_TO_FRACTION", fraction: 0.5 });
    expect(resolvePlayerCommand({ key: "9" })).toEqual({
      kind: "SEEK_TO_FRACTION",
      fraction: 0.9,
    });
  });

  it("maps volume, mute, fullscreen, captions, chapters, rate and the ends", () => {
    expect(resolvePlayerCommand({ key: "ArrowUp" })).toEqual({
      kind: "VOLUME_BY",
      delta: VOLUME_STEP,
    });
    expect(resolvePlayerCommand({ key: "ArrowDown" })).toEqual({
      kind: "VOLUME_BY",
      delta: -VOLUME_STEP,
    });
    expect(resolvePlayerCommand({ key: "m" })).toEqual({ kind: "TOGGLE_MUTE" });
    expect(resolvePlayerCommand({ key: "f" })).toEqual({ kind: "TOGGLE_FULLSCREEN" });
    expect(resolvePlayerCommand({ key: "c" })).toEqual({ kind: "TOGGLE_CAPTIONS" });
    expect(resolvePlayerCommand({ key: "n" })).toEqual({ kind: "NEXT_CHAPTER" });
    expect(resolvePlayerCommand({ key: "p" })).toEqual({ kind: "PREVIOUS_CHAPTER" });
    expect(resolvePlayerCommand({ key: ">" })).toEqual({ kind: "RATE_STEP", direction: 1 });
    expect(resolvePlayerCommand({ key: "<" })).toEqual({ kind: "RATE_STEP", direction: -1 });
    expect(resolvePlayerCommand({ key: "Home" })).toEqual({ kind: "SEEK_TO_START" });
    expect(resolvePlayerCommand({ key: "End" })).toEqual({ kind: "SEEK_TO_END" });
  });

  it("declines every modified keystroke — those belong to the browser and the AT", () => {
    expect(resolvePlayerCommand({ key: "f", ctrlKey: true })).toBeNull();
    expect(resolvePlayerCommand({ key: "l", metaKey: true })).toBeNull();
    expect(resolvePlayerCommand({ key: "ArrowRight", altKey: true })).toBeNull();
    // Shift is NOT a decline: > and < are shifted characters by definition.
    expect(resolvePlayerCommand({ key: ">", shiftKey: true })).toEqual({
      kind: "RATE_STEP",
      direction: 1,
    });
  });

  it("declines anything unmapped", () => {
    expect(resolvePlayerCommand({ key: "Tab" })).toBeNull();
    expect(resolvePlayerCommand({ key: "Escape" })).toBeNull();
    expect(resolvePlayerCommand({ key: "q" })).toBeNull();
  });
});

describe("shouldIgnorePlayerKey", () => {
  it("hands every key to a text-entry or value-selection control", () => {
    // Otherwise focusing the seek slider and pressing ArrowRight moves twice:
    // once natively, once through the map.
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "OPTION"]) {
      expect(shouldIgnorePlayerKey({ tagName }, "ArrowRight")).toBe(true);
      expect(shouldIgnorePlayerKey({ tagName }, "k")).toBe(true);
    }
    expect(shouldIgnorePlayerKey({ tagName: "DIV", isContentEditable: true }, "k")).toBe(true);
  });

  it("hands a button only its activation keys, so the rest of the map still works", () => {
    expect(shouldIgnorePlayerKey({ tagName: "BUTTON" }, " ")).toBe(true);
    expect(shouldIgnorePlayerKey({ tagName: "BUTTON" }, "Enter")).toBe(true);
    expect(shouldIgnorePlayerKey({ tagName: "BUTTON" }, "l")).toBe(false);
    expect(shouldIgnorePlayerKey({ tagName: "A" }, "ArrowRight")).toBe(false);
  });

  it("is case-insensitive about the tag name and safe with no target", () => {
    expect(shouldIgnorePlayerKey({ tagName: "input" }, "k")).toBe(true);
    expect(shouldIgnorePlayerKey(null, "k")).toBe(false);
    expect(shouldIgnorePlayerKey(undefined, "k")).toBe(false);
  });
});

/* ═══════════════════════════ playability ═══════════════════════════ */

describe("playerBlockReason", () => {
  it("blocks every state that is not READY, with a distinguishable reason", () => {
    const src = "/api/media/x/bytes";
    expect(playerBlockReason({ processingState: "PENDING_UPLOAD", src })).toBe("PENDING_UPLOAD");
    expect(playerBlockReason({ processingState: "UPLOADED", src })).toBe("PROCESSING");
    expect(playerBlockReason({ processingState: "VALIDATING", src })).toBe("PROCESSING");
    expect(playerBlockReason({ processingState: "FAILED", src })).toBe("FAILED");
    expect(playerBlockReason({ processingState: "QUARANTINED", src })).toBe("QUARANTINED");
  });

  it("allows playback only for READY with a URL", () => {
    expect(playerBlockReason({ processingState: "READY", src: "/api/media/x/bytes" })).toBeNull();
    // READY with no URL is the caller failing to mint one — say so rather than
    // mounting <video src=""> and waiting for a browser error.
    expect(playerBlockReason({ processingState: "READY", src: null })).toBe("NO_SOURCE");
  });

  it("covers every processing state in the domain vocabulary", () => {
    for (const state of MEDIA_PROCESSING_STATES) {
      const reason = playerBlockReason({ processingState: state, src: "/x" });
      if (state === "READY") expect(reason).toBeNull();
      else expect(reason).not.toBeNull();
    }
  });
});

describe("classifyMediaError", () => {
  it("maps the W3C MediaError codes", () => {
    expect(classifyMediaError(1)).toBe("ABORTED");
    expect(classifyMediaError(2)).toBe("NETWORK");
    expect(classifyMediaError(3)).toBe("DECODE");
    expect(classifyMediaError(4)).toBe("UNSUPPORTED");
    expect(classifyMediaError(undefined)).toBe("UNKNOWN");
    expect(classifyMediaError(null)).toBe("UNKNOWN");
    expect(classifyMediaError(99)).toBe("UNKNOWN");
  });

  it("offers a retry only where another attempt could plausibly succeed", () => {
    expect(isRetryableMediaError("NETWORK")).toBe(true);
    expect(isRetryableMediaError("ABORTED")).toBe(true);
    expect(isRetryableMediaError("UNKNOWN")).toBe(true);
    // A codec the browser cannot decode will not decode on the second try.
    expect(isRetryableMediaError("DECODE")).toBe(false);
    expect(isRetryableMediaError("UNSUPPORTED")).toBe(false);
  });
});

/* ═══════════════════════════ resume & reporting ═══════════════════════════ */

describe("resumePosition", () => {
  it("offers a resume point once past the minimum", () => {
    expect(resumePosition({ positionSeconds: 120, progressPct: 20, completed: false }, 600)).toBe(
      120,
    );
  });

  it("declines in the opening seconds, where starting over is easier", () => {
    expect(
      resumePosition(
        { positionSeconds: RESUME_MIN_SECONDS - 1, progressPct: 1, completed: false },
        600,
      ),
    ).toBeNull();
  });

  it("declines in the closing seconds, which would drop the viewer at the credits", () => {
    expect(resumePosition({ positionSeconds: 590, progressPct: 98, completed: false }, 600)).toBeNull();
  });

  it("declines for a completed asset — a replay wants the beginning", () => {
    expect(resumePosition({ positionSeconds: 300, progressPct: 100, completed: true }, 600)).toBeNull();
  });

  it("declines with no progress at all, and floors a fractional position", () => {
    expect(resumePosition(null, 600)).toBeNull();
    expect(resumePosition(undefined, 600)).toBeNull();
    expect(
      resumePosition({ positionSeconds: 120.9, progressPct: 20, completed: false }, 600),
    ).toBe(120);
  });

  it("still resumes when the duration is unknown", () => {
    // Nothing probes duration (ADR §9); an unknown length must not silently
    // disable a feature the viewer's own progress row fully supports.
    expect(resumePosition({ positionSeconds: 120, progressPct: 0, completed: false }, null)).toBe(
      120,
    );
  });
});

describe("shouldReportProgress", () => {
  it("always reports the first sample, then throttles by interval", () => {
    expect(shouldReportProgress(3, null)).toBe(true);
    expect(shouldReportProgress(7, 5)).toBe(false);
    expect(shouldReportProgress(10, 5)).toBe(true);
  });

  it("reports after a backwards seek too, so the stored position can go down", () => {
    expect(shouldReportProgress(5, 100)).toBe(true);
  });

  it("declines a non-finite position", () => {
    expect(shouldReportProgress(Number.NaN, 5)).toBe(false);
  });
});

/* ═══════════════════════════ variants ═══════════════════════════ */

describe("status → badge variant", () => {
  it("covers every lifecycle status with a defined variant", () => {
    for (const status of MEDIA_LIFECYCLE_STATUSES) {
      expect(typeof lifecycleBadgeVariant(status)).toBe("string");
    }
    expect(lifecycleBadgeVariant("PUBLISHED")).toBe("success");
    expect(lifecycleBadgeVariant("REJECTED")).toBe("danger");
    // Archiving is a completed editorial decision, not a fault.
    expect(lifecycleBadgeVariant("ARCHIVED")).toBe("neutral");
    expect(lifecycleBadgeVariant("DRAFT")).toBe("neutral");
  });

  it("treats QUARANTINED as danger, not a warning", () => {
    // There is no virus scanner (ADR §9): quarantine is "the platform cannot
    // vouch for these bytes", which amber would understate.
    expect(processingBadgeVariant("QUARANTINED")).toBe("danger");
    expect(processingBadgeVariant("FAILED")).toBe("danger");
    expect(processingBadgeVariant("READY")).toBe("success");
    for (const state of MEDIA_PROCESSING_STATES) {
      expect(typeof processingBadgeVariant(state)).toBe("string");
    }
  });

  it("gives every skill level a distinct-enough variant", () => {
    const variants = MEDIA_SKILL_LEVELS.map(skillLevelBadgeVariant);
    expect(new Set(variants).size).toBe(MEDIA_SKILL_LEVELS.length);
  });
});

/* ═══════════════════════════ filters ═══════════════════════════ */

describe("duration buckets", () => {
  it("bucketises by the published bounds", () => {
    expect(durationBucketOf(0)).toBe("SHORT");
    expect(durationBucketOf(299)).toBe("SHORT");
    expect(durationBucketOf(300)).toBe("MEDIUM");
    expect(durationBucketOf(1199)).toBe("MEDIUM");
    expect(durationBucketOf(1200)).toBe("LONG");
    expect(durationBucketOf(9999)).toBe("LONG");
  });

  it("matches NO bucket when the duration is unknown", () => {
    // Nothing probes duration, so null is common and must not default into SHORT.
    expect(durationBucketOf(null)).toBeNull();
    expect(durationBucketOf(undefined)).toBeNull();
    expect(durationBucketOf(Number.NaN)).toBeNull();
    for (const bucket of MEDIA_DURATION_BUCKETS) {
      expect(isDurationInBucket(null, bucket)).toBe(false);
    }
    expect(isDurationInBucket(60, "SHORT")).toBe(true);
    expect(isDurationInBucket(60, "LONG")).toBe(false);
  });
});

describe("filter state", () => {
  it("counts narrowing filters but never the sort order", () => {
    expect(activeFilterCount(EMPTY_MEDIA_FILTERS)).toBe(0);
    // Reordering the same rows narrows nothing; counting it would show
    // "1 filter active" on an untouched library.
    expect(activeFilterCount({ ...EMPTY_MEDIA_FILTERS, sort: "TITLE" })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_MEDIA_FILTERS, query: "   " })).toBe(0);
    expect(
      activeFilterCount({
        query: "plc",
        categoryId: "cat",
        skillLevel: "EXPERT",
        duration: "LONG",
        language: "fa",
        sort: "TITLE",
      }),
    ).toBe(5);
  });

  it("serialises only non-default values, so a pristine library has a clean URL", () => {
    expect(mediaFiltersToQuery(EMPTY_MEDIA_FILTERS)).toEqual({});
    expect(
      mediaFiltersToQuery({
        query: "  plc  ",
        categoryId: "cat",
        skillLevel: "EXPERT",
        duration: "LONG",
        language: "de",
        sort: "TITLE",
      }),
    ).toEqual({
      q: "plc",
      category: "cat",
      level: "EXPERT",
      duration: "LONG",
      lang: "de",
      sort: "TITLE",
    });
  });

  it("round-trips through URLSearchParams", () => {
    const state = {
      query: "opc ua",
      categoryId: "cat-1",
      skillLevel: "INTERMEDIATE" as const,
      duration: "MEDIUM" as const,
      language: "en",
      sort: "MOST_VIEWED" as const,
    };
    const params = new URLSearchParams(mediaFiltersToQuery(state));
    expect(mediaFiltersFromQuery(params)).toEqual(state);
  });

  it("rejects a hand-edited value instead of forwarding it to the API", () => {
    // The URL is untrusted input like any other.
    const params = new URLSearchParams({
      level: "SUPERUSER",
      duration: "FOREVER",
      sort: "; DROP TABLE",
    });
    const parsed = mediaFiltersFromQuery(params);
    expect(parsed.skillLevel).toBeNull();
    expect(parsed.duration).toBeNull();
    expect(parsed.sort).toBe(DEFAULT_MEDIA_SORT);
  });

  it("treats a missing query string as the empty state", () => {
    expect(mediaFiltersFromQuery(new URLSearchParams())).toEqual(EMPTY_MEDIA_FILTERS);
    expect(MEDIA_SORT_OPTIONS).toContain(DEFAULT_MEDIA_SORT);
  });
});

/* ═══════════════════════════ debounce ═══════════════════════════ */

describe("createDebounced", () => {
  it("fires once, on the trailing edge, with the last arguments", () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const debounced = createDebounced<[string]>(spy, 300);
      debounced.call("P");
      debounced.call("PL");
      debounced.call("PLC");
      vi.advanceTimersByTime(299);
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("PLC");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel drops the pending call — an unmounted component must not fire", () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const debounced = createDebounced<[string]>(spy, 300);
      debounced.call("PLC");
      debounced.cancel();
      vi.advanceTimersByTime(1000);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush runs the pending call immediately and only once", () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const debounced = createDebounced<[string]>(spy, 300);
      debounced.call("PLC");
      debounced.flush();
      expect(spy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);
      debounced.flush(); // nothing pending
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
