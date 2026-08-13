"use client";

import { TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import { activeChapterIndex, chapterRange, formatTimecode, normaliseChapters } from "./logic";
import type { MediaChapterView } from "./view-model";

/**
 * PHASE 102 — chapter navigation beside the player.
 *
 * REAL BUTTONS, NOT ROWS WITH CLICK HANDLERS. Each chapter is a `<button>` inside
 * an ordered list: it is reachable by Tab, activates on both Enter and Space, and
 * announces as a button. A `<div onClick>` would do none of that, and a chapter
 * list is exactly the surface a keyboard user reaches for when scrubbing is
 * awkward.
 *
 * `aria-current="true"` marks the chapter containing the playhead. Note that "no
 * chapter is current" is a real state, not a bug: when the first mark starts at
 * 00:30, the opening half-minute belongs to no chapter and nothing is highlighted
 * (see `activeChapterIndex`). Highlighting chapter 1 through that gap would put a
 * false claim on screen for thirty seconds.
 *
 * Timecodes are `TechnicalValue` (`<bdi dir="ltr">`), so "12:04" is not reordered
 * by the surrounding Persian title text.
 */
export interface ChapterListProps {
  chapters: readonly MediaChapterView[];
  /** Current playhead position, in seconds. */
  currentSeconds: number;
  /** Total duration, or null when unknown — the last chapter then has no end. */
  durationSeconds: number | null;
  onSeek: (seconds: number) => void;
  className?: string;
}

export function ChapterList({
  chapters,
  currentSeconds,
  durationSeconds,
  onSeek,
  className,
}: ChapterListProps) {
  const t = useTranslations("mediaHub");
  const ordered = normaliseChapters(chapters);
  const activeIndex = activeChapterIndex(ordered, currentSeconds);

  if (ordered.length === 0) {
    return (
      <section className={cn("flex flex-col gap-2", className)} aria-labelledby="media-chapters">
        <h2 id="media-chapters" className="text-title font-semibold text-text-primary">
          {t("chapters.title")}
        </h2>
        <p className="text-body-compact text-text-muted">{t("chapters.empty")}</p>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col gap-2", className)} aria-labelledby="media-chapters">
      <h2 id="media-chapters" className="text-title font-semibold text-text-primary">
        {t("chapters.title")}
      </h2>
      <ol className="flex list-none flex-col gap-1 p-0">
        {ordered.map((chapter, index) => {
          const active = index === activeIndex;
          const range = chapterRange(ordered, index, durationSeconds);
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => onSeek(chapter.startSeconds)}
                aria-current={active ? "true" : undefined}
                aria-label={t("chapters.jumpTo", {
                  title: chapter.title,
                  time: formatTimecode(chapter.startSeconds),
                })}
                className={cn(
                  "ds-focus flex w-full items-baseline gap-3 rounded-sm px-2 py-1.5 text-start",
                  "transition-colors duration-fast ease-hermes hover:bg-surface-interactive",
                  active
                    ? "bg-surface-interactive text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <TechnicalValue
                  className={cn(
                    "shrink-0 text-label-compact",
                    active ? "text-brand-primary" : "text-text-muted",
                  )}
                >
                  {formatTimecode(chapter.startSeconds)}
                </TechnicalValue>
                <span className="text-body-compact">{chapter.title}</span>
                {range.end !== null ? (
                  <span className="sr-only">
                    {t("chapters.range", {
                      start: formatTimecode(range.start),
                      end: formatTimecode(range.end),
                    })}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
