import type { ReactNode } from "react";
import { EmptyState } from "@/components/ds";
import { useTranslations } from "next-intl";

/**
 * PHASE 102 — "nothing to show", disambiguated.
 *
 * WHY THE REASON IS A PROP AND NOT A DEFAULT MESSAGE
 * Four different situations produce an empty media grid, and only one of them is
 * fixed by the same action:
 *
 *   LIBRARY_EMPTY  nothing has been published in this organization yet
 *                  → the remedy is to upload, and only an editor can
 *   NO_MATCHES     the filters exclude everything
 *                  → the remedy is to clear a filter, and anyone can
 *   NO_RESULTS     the search term matches nothing
 *                  → the remedy is a different term
 *   NOT_ENTITLED   the `video_hub` entitlement is not on this plan (ADR §1)
 *                  → the remedy is commercial, and no amount of filtering helps
 *
 * `OtStates` in the OT console makes exactly this distinction and states why;
 * this is the same reasoning applied to media. Collapsing them into one "No
 * videos found" sends three quarters of the audience down the wrong path.
 *
 * Server-renderable.
 */
export type MediaEmptyReason = "LIBRARY_EMPTY" | "NO_MATCHES" | "NO_RESULTS" | "NOT_ENTITLED";

export interface MediaEmptyStateProps {
  reason: MediaEmptyReason;
  /**
   * Optional remedy control — e.g. a "clear filters" button for NO_MATCHES.
   * Deliberately a slot: the component knows what happened, the caller knows
   * what can be done about it in that context.
   */
  action?: ReactNode;
  className?: string;
}

const ICON: Record<MediaEmptyReason, string> = {
  LIBRARY_EMPTY: "▤",
  NO_MATCHES: "⌗",
  NO_RESULTS: "⌕",
  NOT_ENTITLED: "◍",
};

export function MediaEmptyState({ reason, action, className }: MediaEmptyStateProps) {
  const t = useTranslations("mediaHub");
  return (
    <EmptyState
      className={className}
      icon={<span aria-hidden="true">{ICON[reason]}</span>}
      title={t(`empty.${reason}.title`)}
      message={t(`empty.${reason}.body`)}
      action={action}
    />
  );
}
