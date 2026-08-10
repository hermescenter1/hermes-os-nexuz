"use client";

import { useId } from "react";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import type { MediaLocale, MediaSubtitleTrackView } from "./view-model";

/**
 * PHASE 102 — the captions selector.
 *
 * A NATIVE `<select>`, ON PURPOSE. It is keyboard- and screen-reader-correct on
 * every platform without a line of custom logic, works before hydration, and on a
 * phone opens the OS picker — the same reasoning `OtSelect` records for the OT
 * console. A custom listbox would have to re-earn all of that, and captions are
 * precisely the control an assistive-technology user is most likely to need.
 *
 * ABSENCE IS REPORTED, NOT HIDDEN. An asset with no uploaded WebVTT track has no
 * captions, and there is no speech-to-text engine to generate them (ADR §9). The
 * control renders disabled with an explicit message instead of vanishing, because
 * a missing control is indistinguishable from a broken page.
 *
 * WebVTT only — there is no subtitle converter, which is why
 * `MEDIA_SUBTITLE_FORMATS` in the domain types has exactly one member.
 */
export interface SubtitleToggleProps {
  tracks: readonly MediaSubtitleTrackView[];
  /** The showing track's locale, or null when captions are off. */
  activeLocale: MediaLocale | null;
  onChange: (locale: MediaLocale | null) => void;
  className?: string;
}

/** Sentinel for the "off" option — an empty value is indistinguishable from unset. */
const OFF_VALUE = "__off__";

export function SubtitleToggle({
  tracks,
  activeLocale,
  onChange,
  className,
}: SubtitleToggleProps) {
  const t = useTranslations("mediaHub");
  const id = useId();

  if (tracks.length === 0) {
    return (
      <p className={cn("text-label-compact text-text-muted", className)}>
        {t("subtitles.unavailable")}
      </p>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-label-compact text-text-secondary">
        {t("subtitles.label")}
      </label>
      <select
        id={id}
        value={activeLocale ?? OFF_VALUE}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === OFF_VALUE ? null : (value as MediaLocale));
        }}
        className={cn(
          "ds-focus h-8 rounded-sm border border-border-default bg-surface-interactive px-2",
          "text-label-compact text-text-primary hover:border-border-active",
        )}
      >
        <option value={OFF_VALUE}>{t("subtitles.off")}</option>
        {tracks.map((track) => (
          <option key={track.id} value={track.locale}>
            {track.label}
          </option>
        ))}
      </select>
    </div>
  );
}
