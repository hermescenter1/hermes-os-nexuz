"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Switch, TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import { activeCueIndex, formatTimecode, normaliseCues } from "./logic";
import type { MediaTranscriptCueView } from "./view-model";

/**
 * PHASE 102 — the transcript, with active-cue highlighting and click-to-seek.
 *
 * WHY "FOLLOW PLAYBACK" IS A CONTROL AND DEFAULTS ON
 * Auto-scrolling a transcript is helpful while watching and actively hostile
 * while reading: the moment someone scrolls up to re-read a line, playback yanks
 * them back. The switch makes that the user's decision, and turning it off is
 * also the accessible escape hatch from WCAG 2.2's "no unexpected motion" — which
 * is why scrolling uses `behavior: "auto"` rather than `"smooth"`. Smooth
 * scrolling is scripted motion that CSS `prefers-reduced-motion` cannot suppress,
 * so it is simply never requested.
 *
 * The active-cue search is a binary search in `logic.ts` (`activeCueIndex`), not
 * a linear scan: this runs on every `timeupdate` — roughly four times a second —
 * and a two-hour transcript can carry several thousand cues.
 *
 * A cue with an explicit end stops being highlighted at that end. Silence between
 * cues is silence; leaving the previous line lit makes the transcript look out of
 * sync with the audio.
 */
export interface TranscriptPanelProps {
  cues: readonly MediaTranscriptCueView[];
  /** Current playhead position, in seconds. */
  currentSeconds: number;
  onSeek: (seconds: number) => void;
  /** Rendered when the asset has no transcript in the active locale. */
  unavailable?: boolean;
  className?: string;
}

export function TranscriptPanel({
  cues,
  currentSeconds,
  onSeek,
  unavailable = false,
  className,
}: TranscriptPanelProps) {
  const t = useTranslations("mediaHub");
  const headingId = useId();
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  const ordered = useMemo(() => normaliseCues(cues), [cues]);
  const activeIndex = activeCueIndex(ordered, currentSeconds);

  useEffect(() => {
    if (!follow) return;
    const node = activeRef.current;
    if (!node || typeof node.scrollIntoView !== "function") return;
    // `auto`, never `smooth` — see the note above.
    node.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [activeIndex, follow]);

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={headingId} className="text-title font-semibold text-text-primary">
        {t("transcript.title")}
      </h2>
      {ordered.length > 0 ? (
        <span className="flex items-center gap-2">
          <span id={`${headingId}-follow`} className="text-label-compact text-text-secondary">
            {t("transcript.follow")}
          </span>
          <Switch
            checked={follow}
            onCheckedChange={setFollow}
            aria-labelledby={`${headingId}-follow`}
          />
        </span>
      ) : null}
    </div>
  );

  if (unavailable || ordered.length === 0) {
    return (
      <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
        {heading}
        <p className="text-body-compact text-text-muted">{t("transcript.empty")}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      {heading}
      <ol
        ref={listRef}
        className="flex max-h-96 list-none flex-col gap-1 overflow-y-auto p-0"
        // Polite, not assertive: the transcript updates continuously, and an
        // assertive region would interrupt the screen reader every few seconds.
        aria-live="off"
      >
        {ordered.map((cue, index) => {
          const active = index === activeIndex;
          return (
            <li key={cue.id} ref={active ? activeRef : undefined}>
              <button
                type="button"
                onClick={() => onSeek(cue.startSeconds)}
                aria-current={active ? "true" : undefined}
                aria-label={t("transcript.jumpTo", { time: formatTimecode(cue.startSeconds) })}
                className={cn(
                  "ds-focus flex w-full items-baseline gap-3 rounded-sm px-2 py-1 text-start",
                  "transition-colors duration-fast ease-hermes hover:bg-surface-interactive",
                  active ? "bg-surface-interactive" : "",
                )}
              >
                <TechnicalValue
                  className={cn(
                    "shrink-0 text-label-compact",
                    active ? "text-brand-primary" : "text-text-muted",
                  )}
                >
                  {formatTimecode(cue.startSeconds)}
                </TechnicalValue>
                <span
                  className={cn(
                    "text-body-compact",
                    active ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {cue.speaker ? (
                    <span className="me-1 font-semibold text-text-primary">{cue.speaker}:</span>
                  ) : null}
                  {cue.text}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
