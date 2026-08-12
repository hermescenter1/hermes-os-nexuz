import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { cardVariants } from "@/components/ds/logic";
import { useTranslations } from "next-intl";
import { MediaSkillLevelBadge, MediaProcessingBadge, MediaLifecycleBadge } from "./MediaStateBadge";
import { formatTimecode, isCompletedProgress, TIMELINE_DIRECTION } from "./logic";
import type { MediaCardView } from "./view-model";

/**
 * PHASE 102 — the media library's unit of browsing.
 *
 * SERVER-RENDERABLE ON PURPOSE. A grid is a hundred of these; giving each one a
 * hydration cost would be the single largest client-JS regression the phase could
 * make, and nothing on the card needs a browser. Interactive extras (the
 * favourite toggle) arrive through the `actionSlot` prop as an already-client
 * component, so exactly one small island hydrates instead of the whole card.
 *
 * ONE LINK, NOT FIVE. The title anchor is stretched over the entire card with
 * `after:absolute after:inset-0`. Making the poster, the title and the instructor
 * three separate links to the same place would give a screen-reader user three
 * identical stops and a keyboard user three tabs to skip; the poster is therefore
 * `alt=""` (decorative — the title already names the destination) and the
 * instructor name is plain text here, with the real profile link living on
 * `InstructorCard`. `actionSlot` sits above the stretched layer via `relative
 * z-10` so it stays independently clickable.
 *
 * RTL: no physical direction anywhere except the two elements that must not
 * mirror — the duration chip's position is logical (`end-2`), while the progress
 * bar carries an explicit `dir="ltr"` because it measures elapsed time, which
 * flows the same way in every script (see `TIMELINE_DIRECTION`).
 */
export interface VideoCardProps {
  asset: MediaCardView;
  /**
   * Show the editorial/processing badges. Off for public browsing (where every
   * visible asset is PUBLISHED and READY by construction, so the badges would be
   * noise) and on for the management library, where they are the point.
   */
  showEditorialState?: boolean;
  /** An interactive island, e.g. `<FavouriteButton />`. */
  actionSlot?: ReactNode;
  className?: string;
}

export function VideoCard({
  asset,
  showEditorialState = false,
  actionSlot,
  className,
}: VideoCardProps) {
  const t = useTranslations("mediaHub");
  const pct = asset.progress ? Math.round(asset.progress.progressPct) : null;
  const completed = pct !== null && (asset.progress?.completed || isCompletedProgress(pct));

  return (
    <article
      className={cn(
        cardVariants("interactive", { padded: false }),
        "group relative flex flex-col overflow-hidden",
        className,
      )}
    >
      {/* ── Poster ─────────────────────────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden bg-background-deep">
        {asset.posterUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- next/image would
             route this through the on-demand optimizer, which runs on `sharp`.
             `sharp` is an `overrides`-only dependency here and importing it drags
             in the release-engineering CPU gate (ADR §2.6). Posters are already
             uploaded at their display size and served same-origin from the
             documents volume, so there is nothing for the optimizer to win. */
          <img
            src={asset.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          // No poster is generated for an asset that arrives without one — there
          // is no frame extractor (ADR §9). A restrained placeholder says so
          // rather than implying a broken image.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-background-deep">
            <span aria-hidden="true" className="text-3xl text-text-disabled">
              ▶
            </span>
            <span className="sr-only">{t("card.noPoster")}</span>
          </div>
        )}

        {actionSlot ? <div className="absolute end-2 top-2 z-10">{actionSlot}</div> : null}

        {/* Duration chip. `durationSeconds` is routinely null — nothing probes it
            (ADR §9) — so the unknown case gets its own honest label. */}
        <span className="absolute bottom-2 end-2 rounded-xs bg-background-deep/85 px-1.5 py-0.5 text-label-compact font-semibold text-text-primary">
          {asset.durationSeconds !== null ? (
            <TechnicalValue mono={false}>{formatTimecode(asset.durationSeconds)}</TechnicalValue>
          ) : (
            t("card.durationUnknown")
          )}
        </span>

        {/* Resume overlay. dir is pinned — see TIMELINE_DIRECTION. */}
        {pct !== null && pct > 0 ? (
          <div
            dir={TIMELINE_DIRECTION}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t("card.progressLabel", { title: asset.title })}
            className="absolute inset-x-0 bottom-0 h-1 bg-background-deep/70"
          >
            <div
              className={cn("h-full", completed ? "bg-status-success" : "bg-brand-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-label font-semibold leading-snug text-text-primary">
          <Link
            href={asset.href}
            // The href arrives already locale-prefixed from the page, so this is
            // `next/link` rather than the i18n Link — double-prefixing would
            // produce /fa/fa/… (the convention the app-shell clients follow).
            className="ds-focus rounded-xs after:absolute after:inset-0 after:content-['']"
          >
            {asset.title}
          </Link>
        </h3>

        {asset.summary ? (
          <p className="line-clamp-2 text-body-compact text-text-secondary">{asset.summary}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <MediaSkillLevelBadge level={asset.skillLevel} />
          {asset.category ? <Badge variant="neutral">{asset.category.name}</Badge> : null}
          {completed ? <Badge variant="success">{t("card.completed")}</Badge> : null}
          {showEditorialState ? (
            <>
              <MediaLifecycleBadge status={asset.status} />
              <MediaProcessingBadge state={asset.processingState} />
            </>
          ) : null}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label-compact text-text-muted">
          {asset.instructor ? <span>{asset.instructor.name}</span> : null}
          {asset.instructor ? (
            <span aria-hidden="true" className="text-text-disabled">
              ·
            </span>
          ) : null}
          <span>{t("card.views", { count: asset.viewCount })}</span>
        </p>
      </div>
    </article>
  );
}
