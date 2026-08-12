import { useTranslations } from "next-intl";
import { cn } from "@/components/ds/cn";
import { VideoCard } from "./VideoCard";
import type { MediaCardView } from "./view-model";

/**
 * PHASE 102 — the viewer's own in-progress assets.
 *
 * THIS IS PRIVATE VIEWING HISTORY (ADR §8). Every row shown here comes from a
 * `MediaWatchProgress` read filtered by the authenticated `userId` at the database
 * query level. The component takes only what it is given and has no way to ask for
 * anyone else's — but the invariant lives in the loader, not here, and a caller
 * that passes another user's rows has already broken it upstream. Stated
 * explicitly because "the component only renders props" is how that class of leak
 * gets waved through in review.
 *
 * A HORIZONTAL SCROLLER, NOT A CAROUSEL. No auto-advance, no arrow buttons that
 * move content out from under a pointer: it is a plain scroll container with
 * scroll-snap, which means native keyboard scrolling, native touch momentum,
 * native scrollbars, and nothing that moves unless the user moves it. Scroll
 * snapping is a layout property, not an animation, so it is unaffected by —
 * and does not need to opt out of — `prefers-reduced-motion`.
 *
 * Renders nothing when the viewer has nothing in progress: a signed-out or
 * first-time visitor should see the library, not an empty shelf about themselves.
 *
 * Server-renderable.
 */
export interface ContinueWatchingRowProps {
  items: readonly MediaCardView[];
  title?: string;
  className?: string;
}

export function ContinueWatchingRow({ items, title, className }: ContinueWatchingRowProps) {
  const t = useTranslations("mediaHub");
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="media-continue-watching"
      className={cn("flex flex-col gap-3", className)}
    >
      <h2 id="media-continue-watching" className="text-title font-semibold text-text-primary">
        {title ?? t("continueWatching.title")}
      </h2>
      <ul
        // `snap-x` + `overflow-x-auto`: logical scrolling, so it starts at the
        // inline-start edge under both LTR and RTL without any mirroring code.
        className="flex snap-x snap-mandatory list-none gap-4 overflow-x-auto p-0 pb-2"
      >
        {items.map((asset) => (
          <li key={asset.id} className="w-64 shrink-0 snap-start">
            <VideoCard asset={asset} className="h-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
