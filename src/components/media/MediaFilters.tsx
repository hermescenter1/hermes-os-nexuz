"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import { MEDIA_SKILL_LEVELS } from "@/lib/media/types";
import {
  activeFilterCount,
  EMPTY_MEDIA_FILTERS,
  MEDIA_DURATION_BUCKETS,
  MEDIA_DURATION_BUCKET_LABEL_VALUES,
  MEDIA_SORT_OPTIONS,
  type MediaDurationBucket,
  type MediaFilterState,
  type MediaSortOption,
} from "./logic";
import type { MediaCategoryView, MediaSkillLevel } from "./view-model";

/**
 * PHASE 102 — the library filter bar.
 *
 * ONLY SUPPORTED AXES ARE OFFERED. Every control here maps to a field the media
 * repository can actually filter or order on; a control that silently does
 * nothing is worse than a missing one (the lesson `OtFilterBar` records after the
 * OT list API turned out to ignore unknown query params).
 *
 * DURATION IS BUCKETED, NOT A RANGE SLIDER. `durationSeconds` is routinely null
 * because nothing probes it (ADR §9), and a two-handled slider would imply a
 * precision the data does not have. Three buckets are honest about the
 * granularity, and an asset of unknown length simply matches none of them.
 *
 * APPLIED IMMEDIATELY, UNLIKE SEARCH. A select fires once per deliberate choice,
 * so there is no keystroke race to debounce and no reason to make the user press
 * a second button. Free text is the opposite case and lives in
 * `MediaSearchInput`, which is debounced for exactly that reason.
 *
 * SORT IS NOT COUNTED AS A FILTER. `activeFilterCount` excludes it — reordering
 * the same rows narrows nothing, and counting it would show "1 filter active" on
 * an untouched library and send people hunting for a filter they never set.
 */

interface FilterSelectProps<T extends string> {
  label: string;
  anyLabel?: string;
  value: T | null;
  options: readonly T[];
  optionLabel: (option: T) => string;
  onChange: (value: T | null) => void;
}

/**
 * A native `<select>` — keyboard- and screen-reader-correct everywhere, works
 * before hydration, opens the OS picker on a phone. Same choice, same reasons, as
 * `OtSelect`.
 */
function FilterSelect<T extends string>({
  label,
  anyLabel,
  value,
  options,
  optionLabel,
  onChange,
}: FilterSelectProps<T>) {
  const id = useId();
  return (
    <div className="flex min-w-[9rem] flex-col gap-1">
      <label htmlFor={id} className="text-label-compact font-semibold text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : (next as T));
        }}
        className={cn(
          "ds-focus h-9 w-full rounded-sm border border-border-default bg-surface-interactive px-3",
          "text-body text-text-primary hover:border-border-active",
        )}
      >
        {anyLabel !== undefined ? <option value="">{anyLabel}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface MediaLanguageOption {
  /** Platform locale code (`fa` | `en` | `de`) or any other stored code. */
  code: string;
  label: string;
}

export interface MediaFiltersProps {
  value: MediaFilterState;
  onChange: (next: MediaFilterState) => void;
  categories: readonly MediaCategoryView[];
  /** Languages actually present in the library — never a hard-coded list. */
  languages?: readonly MediaLanguageOption[];
  /** Slot for the search input, so the whole bar is one landmark. */
  searchSlot?: ReactNode;
  className?: string;
}

export function MediaFilters({
  value,
  onChange,
  categories,
  languages = [],
  searchSlot,
  className,
}: MediaFiltersProps) {
  const t = useTranslations("mediaHub");
  const active = activeFilterCount(value);

  const patch = (next: Partial<MediaFilterState>): void => onChange({ ...value, ...next });

  return (
    <section
      aria-label={t("filters.title")}
      className={cn("flex flex-col gap-3", className)}
    >
      {searchSlot}

      <div className="flex flex-wrap items-end gap-3">
        {categories.length > 0 ? (
          <FilterSelect
            label={t("filters.category")}
            anyLabel={t("filters.any")}
            value={value.categoryId}
            options={categories.map((category) => category.id)}
            optionLabel={(id) =>
              categories.find((category) => category.id === id)?.name ?? id
            }
            onChange={(categoryId) => patch({ categoryId })}
          />
        ) : null}

        <FilterSelect<MediaSkillLevel>
          label={t("filters.skillLevel")}
          anyLabel={t("filters.any")}
          value={value.skillLevel}
          options={MEDIA_SKILL_LEVELS}
          optionLabel={(level) => t(`skillLevel.${level}`)}
          onChange={(skillLevel) => patch({ skillLevel })}
        />

        <FilterSelect<MediaDurationBucket>
          label={t("filters.duration")}
          anyLabel={t("filters.any")}
          value={value.duration}
          options={MEDIA_DURATION_BUCKETS}
          // The boundaries are ICU arguments, not words baked into the copy, so
          // the label cannot drift from `durationBucketOf` (see logic.ts).
          optionLabel={(bucket) => t(`duration.${bucket}`, MEDIA_DURATION_BUCKET_LABEL_VALUES[bucket])}
          onChange={(duration) => patch({ duration })}
        />

        {languages.length > 0 ? (
          <FilterSelect
            label={t("filters.language")}
            anyLabel={t("filters.any")}
            value={value.language}
            options={languages.map((language) => language.code)}
            optionLabel={(code) =>
              languages.find((language) => language.code === code)?.label ?? code
            }
            onChange={(language) => patch({ language })}
          />
        ) : null}

        <FilterSelect<MediaSortOption>
          label={t("filters.sort")}
          value={value.sort}
          options={MEDIA_SORT_OPTIONS}
          optionLabel={(option) => t(`sort.${option}`)}
          // Sort has no "any": a list always has an order, and offering a blank
          // option would suggest an unordered result the API cannot return.
          onChange={(sort) => patch({ sort: sort ?? value.sort })}
        />

        {active > 0 ? (
          <Button
            variant="secondary"
            size="md"
            onClick={() => onChange({ ...EMPTY_MEDIA_FILTERS, sort: value.sort })}
          >
            {t("filters.clear", { count: active })}
          </Button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {t("filters.activeCount", { count: active })}
      </p>
    </section>
  );
}
