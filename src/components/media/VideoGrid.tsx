import type { ReactNode } from "react";
import { Skeleton } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { cardVariants } from "@/components/ds/logic";
import { useTranslations } from "next-intl";
import { VideoCard } from "./VideoCard";
import { MediaEmptyState, type MediaEmptyReason } from "./MediaEmptyState";
import type { MediaCardView } from "./view-model";

/**
 * PHASE 102 — the responsive library grid, with its loading and empty states.
 *
 * THE THREE OUTCOMES ARE MUTUALLY EXCLUSIVE AND ORDERED. Loading wins over
 * empty: a grid that renders "no videos found" for the 300 ms before the first
 * response arrives has told the user something false, and they will act on it.
 * Only once loading has finished does an empty list mean anything.
 *
 * THE SKELETON IS ARIA-HIDDEN AND PAIRED WITH ONE LIVE MESSAGE. A screen reader
 * announcing a lattice of twelve empty boxes is worse than silence; it hears
 * "loading videos" once instead. Same pattern as `OtSkeleton`. The shimmer comes
 * from `.ds-skeleton`, which globals.css already stills under
 * `prefers-reduced-motion`.
 *
 * Server-renderable.
 */
export interface VideoGridProps {
  items: readonly MediaCardView[];
  /** True while the first (or a subsequent) page is in flight. */
  loading?: boolean;
  /** How many placeholder cards to show while loading. */
  skeletonCount?: number;
  /** Which "nothing here" message applies once loading has finished. */
  emptyReason?: MediaEmptyReason;
  /** Remedy control for the empty state, e.g. a "clear filters" button. */
  emptyAction?: ReactNode;
  showEditorialState?: boolean;
  /** Per-card interactive island, e.g. a favourite toggle bound to that asset. */
  renderAction?: (asset: MediaCardView) => ReactNode;
  /** Accessible name for the list region. */
  label?: string;
  className?: string;
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function VideoGrid({
  items,
  loading = false,
  skeletonCount = 8,
  emptyReason = "LIBRARY_EMPTY",
  emptyAction,
  showEditorialState = false,
  renderAction,
  label,
  className,
}: VideoGridProps) {
  const t = useTranslations("mediaHub");

  if (loading) {
    return (
      <div className={className} aria-busy="true">
        <p role="status" aria-live="polite" className="sr-only">
          {t("grid.loading")}
        </p>
        <div aria-hidden="true" className={GRID}>
          {Array.from({ length: skeletonCount }, (_, index) => (
            <div key={index} className={cn(cardVariants("soft", { padded: false }), "overflow-hidden")}>
              <Skeleton shape="rect" className="aspect-video w-full rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton shape="text" className="w-4/5" />
                <Skeleton shape="text" className="w-3/5" />
                <Skeleton shape="text" className="w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return <MediaEmptyState reason={emptyReason} action={emptyAction} className={className} />;
  }

  return (
    <ul aria-label={label ?? t("grid.label")} className={cn(GRID, "list-none p-0", className)}>
      {items.map((asset) => (
        <li key={asset.id} className="flex">
          <VideoCard
            asset={asset}
            showEditorialState={showEditorialState}
            actionSlot={renderAction ? renderAction(asset) : undefined}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}
