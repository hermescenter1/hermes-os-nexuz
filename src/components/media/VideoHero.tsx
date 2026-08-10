import Link from "next/link";
import { TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { buttonVariants } from "@/components/ds/logic";
import { useTranslations } from "next-intl";
import { MediaSkillLevelBadge } from "./MediaStateBadge";
import { formatTimecode, resumePosition, TIMELINE_DIRECTION } from "./logic";
import type { MediaCardView } from "./view-model";

/**
 * PHASE 102 — the cinematic featured treatment at the top of the library.
 *
 * WHY THE POSTER IS A BACKGROUND AND THE SCRIM IS NOT OPTIONAL
 * The hero is the one surface where product imagery sits under product text, and
 * the imagery is operator-supplied: a bright still from a control-room video will
 * put `--color-text-primary` (#EDF7FA) on near-white and drop the contrast under
 * 2:1. The two stacked scrims below are therefore a legibility guarantee, not a
 * style — the lower one is opaque enough at the text edge that the worst-case
 * poster still clears AA. This is also why `.ds-glass-hero` is the tier used
 * here: it is the only glass variant that actually blurs, because it is the only
 * one that sits over imagery.
 *
 * NO AUTOPLAYING PREVIEW. A muted looping teaser is the usual "cinematic" move
 * and it is declined deliberately: it burns a Range-served byte stream off the
 * documents volume for every visitor who scrolls past, and the platform serves
 * those from the app process itself (ADR §4). The hero links to the watch page;
 * playback starts when a human asks for it.
 *
 * Server-renderable — `buttonVariants` is imported from the JSX-free `ds/logic`
 * core rather than the barrel, because the barrel re-exports client-tainted
 * modules and a server component may not pull a value out of one.
 */
export interface VideoHeroProps {
  asset: MediaCardView;
  /** Small overline above the title, e.g. a curated collection name. */
  eyebrow?: string;
  className?: string;
}

export function VideoHero({ asset, eyebrow, className }: VideoHeroProps) {
  const t = useTranslations("mediaHub");
  const resumeAt = resumePosition(asset.progress, asset.durationSeconds);
  const pct = asset.progress ? Math.round(asset.progress.progressPct) : null;

  return (
    <section
      aria-labelledby={`media-hero-${asset.id}`}
      className={cn(
        "ds-glass-hero relative isolate overflow-hidden rounded-xl",
        "min-h-[18rem] md:min-h-[24rem]",
        className,
      )}
    >
      {asset.posterUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- see VideoCard:
              the on-demand optimizer runs on `sharp`, which is overrides-only in
              this repo and gated by release engineering (ADR §2.6). */}
          <img
            src={asset.posterUrl}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          {/* Legibility scrims — vertical for the body, plus a horizontal one
              behind the text column. Tailwind has no logical gradient direction,
              so the `rtl:` variant mirrors it explicitly; without that the scrim
              would darken the empty side and leave Persian text on bare image. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-background-deep via-background-deep/80 to-background-deep/25"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-r from-background-deep/90 to-transparent rtl:bg-gradient-to-l"
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-br from-surface-elevated via-background-base to-background-deep"
        />
      )}

      <div className="flex h-full max-w-2xl flex-col justify-end gap-3 p-6 md:p-10">
        {eyebrow ? (
          <p className="text-label-compact font-semibold uppercase tracking-widest text-brand-primary">
            {eyebrow}
          </p>
        ) : null}

        <h2
          id={`media-hero-${asset.id}`}
          className="text-role-h2 font-bold text-text-primary md:text-role-h1"
        >
          {asset.title}
        </h2>

        {asset.summary ? (
          <p className="line-clamp-3 text-body-lg text-text-secondary">{asset.summary}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <MediaSkillLevelBadge level={asset.skillLevel} />
          {asset.category ? (
            <span className="text-label-compact text-text-muted">{asset.category.name}</span>
          ) : null}
          {asset.instructor ? (
            <span className="text-label-compact text-text-muted">{asset.instructor.name}</span>
          ) : null}
          {asset.durationSeconds !== null ? (
            <span className="text-label-compact text-text-muted">
              <TechnicalValue mono={false}>{formatTimecode(asset.durationSeconds)}</TechnicalValue>
            </span>
          ) : null}
        </div>

        {/* Continue-watching rail. dir pinned — elapsed time is not a language. */}
        {pct !== null && pct > 0 ? (
          <div
            dir={TIMELINE_DIRECTION}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t("card.progressLabel", { title: asset.title })}
            className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-surface-interactive"
          >
            <div className="h-full bg-brand-primary" style={{ width: `${pct}%` }} />
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href={asset.href} className={buttonVariants("primary", "lg")}>
            {resumeAt !== null
              ? t("hero.resumeAt", { time: formatTimecode(resumeAt) })
              : t("hero.watch")}
          </Link>
        </div>
      </div>
    </section>
  );
}
