"use client";

import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import type { MediaCategoryView } from "./view-model";

/**
 * PHASE 102 — the category taxonomy as a single-select chip row.
 *
 * `aria-pressed`, NOT `aria-selected`. These are toggle buttons in a group, not
 * options in a listbox: `aria-selected` is only meaningful inside a container
 * with the matching role, and using it on a bare button produces an element
 * screen readers describe inconsistently or not at all. Each chip is a real
 * `<button>` in a `role="group"`, which is what it behaves like.
 *
 * Selecting the active chip clears the filter. That reversibility matters on
 * touch, where there is no second control within reach to undo with — and the
 * "All" chip stays visible regardless so the escape is always one tap away.
 *
 * Counts are rendered only when the caller actually counted. `count: null` means
 * "not counted", which is not the same as zero, and showing "(0)" for an
 * uncounted category would be a fabrication.
 */
export interface CategoryChipsProps {
  categories: readonly MediaCategoryView[];
  /** Selected category id, or null for "all". */
  value: string | null;
  onChange: (categoryId: string | null) => void;
  className?: string;
}

export function CategoryChips({ categories, value, onChange, className }: CategoryChipsProps) {
  const t = useTranslations("mediaHub");

  const chip = (active: boolean): string =>
    cn(
      "ds-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
      "text-label-compact font-semibold whitespace-nowrap",
      "transition-colors duration-fast ease-hermes",
      active
        ? "border-brand-border bg-brand-subtle text-brand-primary"
        : "border-border-default bg-surface-interactive text-text-secondary hover:border-border-active hover:text-text-primary",
    );

  return (
    <div
      role="group"
      aria-label={t("categories.label")}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={chip(value === null)}
      >
        {t("categories.all")}
      </button>
      {categories.map((category) => {
        const active = category.id === value;
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : category.id)}
            className={chip(active)}
          >
            {category.name}
            {category.count !== null ? (
              <span className={cn("text-label-compact", active ? "" : "text-text-muted")}>
                {category.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
