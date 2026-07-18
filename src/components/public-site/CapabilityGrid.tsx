import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";

// PHASE 87D — capability card grid: used for the four homepage pillars
// (title + description, accent-colored per the Figma cyan/azure/violet/green
// row) and the five operating-domain cards (title + module list).
// 87D.1 — optional per-card `href`/`ctaLabel` turn a card into a doorway to
// an existing public route (challenge/capability/ecosystem sections).

export type CapabilityAccent = "brand" | "azure" | "violet" | "success";

const ACCENT_TEXT: Record<CapabilityAccent, string> = {
  brand:   "text-brand-primary",
  azure:   "text-intelligence-azure",
  violet:  "text-reasoning-hypothesis",
  success: "text-status-success",
};

export interface CapabilityGridItem {
  key: string;
  title: string;
  body?: string;
  /** Stacked module names (rendered as a list, like the Figma group cards). */
  list?: readonly string[];
  accent?: CapabilityAccent;
  /** Decorative glyph rendered before the title (aria-hidden). */
  glyph?: ReactNode;
  /** Existing public route this card links to (87D.1). */
  href?: string;
  /** Accessible link text for the card's route (required when href is set). */
  ctaLabel?: string;
}

export interface CapabilityGridProps {
  items: readonly CapabilityGridItem[];
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}

const COLUMNS: Record<NonNullable<CapabilityGridProps["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
};

export function CapabilityGrid({ items, columns = 4, className }: CapabilityGridProps) {
  return (
    <ul className={cn("grid gap-4", COLUMNS[columns], className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="ds-glass-card rounded-lg p-5"
        >
          <h3
            className={cn(
              "flex items-center gap-2 text-title-lg font-semibold",
              ACCENT_TEXT[item.accent ?? "brand"],
            )}
          >
            {item.glyph ? <span aria-hidden="true">{item.glyph}</span> : null}
            {item.title}
          </h3>
          {item.body ? (
            <p className="mt-2.5 text-body-compact text-text-secondary">{item.body}</p>
          ) : null}
          {item.list?.length ? (
            <ul className="mt-2.5 flex flex-col gap-1">
              {item.list.map((entry) => (
                <li key={entry} className="text-body-compact font-medium text-text-secondary" dir="auto">
                  {entry}
                </li>
              ))}
            </ul>
          ) : null}
          {item.href && item.ctaLabel ? (
            <Link
              href={item.href}
              className={cn(
                "ds-focus mt-3.5 inline-flex items-center gap-1.5 rounded-sm text-label font-semibold",
                "text-brand-primary transition-colors duration-fast hover:text-brand-primary-hover",
              )}
            >
              {item.ctaLabel}
              <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
