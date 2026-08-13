import { useTranslations } from "next-intl";
import { cn } from "@/components/ds/cn";
import { VideoCard } from "./VideoCard";
import type { MediaCardView } from "./view-model";

/**
 * PHASE 102 — "more like this", beside a watch page.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING. An empty related rail with a heading
 * and a "no related videos" message is pure noise on a page whose subject is the
 * video above it — unlike the library grid, where emptiness is the answer to a
 * question the user actually asked. Emptiness here is not an outcome worth
 * reporting, so the section is omitted entirely.
 *
 * RELATEDNESS IS COMPUTED SERVER-SIDE, and deliberately so: the ADR's industrial
 * association model (shared category, `industrialDomain`, `linkedAssetType`,
 * `linkedProtocol`) is a database query under the same tenant and visibility gate
 * as any other read. A client-side similarity score would need the whole library
 * in the browser, which is both a leak and a payload.
 *
 * Server-renderable.
 */
export interface RelatedVideosProps {
  items: readonly MediaCardView[];
  /** Override the default heading, e.g. "More from this instructor". */
  title?: string;
  className?: string;
}

export function RelatedVideos({ items, title, className }: RelatedVideosProps) {
  const t = useTranslations("mediaHub");
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="media-related" className={cn("flex flex-col gap-3", className)}>
      <h2 id="media-related" className="text-title font-semibold text-text-primary">
        {title ?? t("related.title")}
      </h2>
      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((asset) => (
          <li key={asset.id} className="flex">
            <VideoCard asset={asset} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
