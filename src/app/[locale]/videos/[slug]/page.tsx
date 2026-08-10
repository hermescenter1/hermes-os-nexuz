import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  InstructorCard,
  MediaPlayer,
  MediaSkillLevelBadge,
  RelatedVideos,
} from "@/components/media";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  VIDEO_HUB_ORG_PARAM,
  loadVideoWatch,
  resolveVideoHubScope,
} from "../data";

/**
 * PHASE 102 — `/[locale]/videos/[slug]`: the PUBLIC watch page.
 *
 * PUBLISHED-ONLY, WITHOUT RE-IMPLEMENTING THE GATE
 * ------------------------------------------------
 * `loadVideoWatch` calls `getMediaAssetBySlug` with NO `audience`, so the
 * repository's default applies `PUBLISHED + PUBLIC + READY` inside the database
 * query and an unpublished row is never materialised. This page therefore contains
 * no `status`/`visibility`/`processingState` comparison of its own — deliberately,
 * because the Journal's `[slug]` page does the opposite (`getArticleDetailBySlug`
 * has no filter and the page re-checks three fields by hand), and that shape is one
 * forgotten caller away from serving a draft.
 *
 * EVERY REFUSAL IS THE SAME 404
 * -----------------------------
 * A missing organization selector, an unknown organization, an unknown slug, a
 * draft, a PRIVATE or ORGANIZATION-visibility asset, another tenant's asset, one
 * still validating, one quarantined, and a storage failure all reach `notFound()`.
 * A distinguishable answer would confirm the existence of a resource the visitor is
 * not entitled to know about.
 *
 * SERVER / CLIENT SPLIT
 * ---------------------
 * This page is a Server Component. `MediaPlayer` is the only client component on
 * it, and it receives serializable props only — no callbacks — because there is no
 * authenticated viewer here whose watch progress could be written (ADR §8: private
 * viewing history is only ever read back for the authenticated subject). The
 * player's timeline stays LTR under Persian on its own; nothing here overrides it.
 */

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  const scope = await resolveVideoHubScope(sp[VIDEO_HUB_ORG_PARAM]);
  const view = scope ? await loadVideoWatch({ scope, slug, routeLocale: locale }) : null;
  if (!view) {
    // Never index a page that did not resolve, and never describe why it did not.
    return { title: t("states.notFound"), robots: { index: false, follow: false } };
  }

  // The canonical URL is built from the PERSISTED slug, never the raw route param,
  // so one asset keeps one canonical URL however the request encoded it.
  return buildMetadata({
    locale,
    path: view.canonicalPath,
    title: view.seoTitle ?? view.title,
    description: view.seoDescription ?? view.summary ?? "",
    // `buildMetadata` accepts only "website" | "article". A `video.other` OG type
    // would need a change to the shared SEO module, which is out of scope here.
    ogType: "article",
    publishedTime: view.publishedAt ?? undefined,
  });
}

export default async function VideoWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  const scope = await resolveVideoHubScope(sp[VIDEO_HUB_ORG_PARAM]);
  const view = scope ? await loadVideoWatch({ scope, slug, routeLocale: locale }) : null;
  if (!view) {
    notFound();
  }

  const publishedLabel =
    view.publishedAt !== null
      ? t("watch.publishedOn", {
          date: new Date(view.publishedAt).toLocaleDateString(locale),
        })
      : null;

  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      {/* Skip link — the player is the reason this page exists, and it sits below
          a heading block a keyboard user would otherwise tab through every time. */}
      <a
        href="#video-hub-player"
        className="ds-focus sr-only focus:not-sr-only focus:inline-flex focus:rounded-lg focus:bg-surface-elevated focus:px-4 focus:py-2 focus:text-body-compact focus:text-text-primary"
      >
        {t("a11y.skipToPlayer")}
      </a>

      <nav aria-label={t("watch.backToLibrary")}>
        <Link
          href={view.libraryHref}
          className="ds-focus text-body-compact text-brand-primary hover:underline"
        >
          {t("watch.backToLibrary")}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="text-role-h1 font-bold text-text-primary">{view.title}</h1>
        {view.summary ? (
          <p className="text-body-lg text-text-secondary">{view.summary}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <MediaSkillLevelBadge level={view.skillLevel} />
          {view.category ? (
            <span className="text-label-compact text-text-muted">{view.category.name}</span>
          ) : null}
          {publishedLabel ? (
            <span className="text-label-compact text-text-muted">{publishedLabel}</span>
          ) : null}
          <span className="text-label-compact text-text-muted">
            {t("watch.viewCount", { count: view.viewCount })}
          </span>
        </div>
      </header>

      {/* `tabIndex={-1}` makes the skip link's target focusable without putting it
          in the tab order. The player owns its own controls and announcements. */}
      <div id="video-hub-player" tabIndex={-1} className="outline-none">
        <MediaPlayer media={view.playback} />
      </div>

      {view.description ? (
        <section aria-labelledby="video-hub-description" className="flex flex-col gap-2">
          <h2 id="video-hub-description" className="text-title font-semibold text-text-primary">
            {t("watch.descriptionTitle")}
          </h2>
          {/* Plain text from the editorial translation row — rendered as text, never
              as HTML, so nothing an editor typed can become markup. */}
          <p className="whitespace-pre-line text-body text-text-secondary">{view.description}</p>
        </section>
      ) : null}

      {view.transcript ? (
        <section aria-labelledby="video-hub-transcript" className="flex flex-col gap-2">
          <h2 id="video-hub-transcript" className="text-title font-semibold text-text-primary">
            {t("transcript.title")}
          </h2>
          {/*
            `TranscriptPanel` is deliberately NOT used here. It renders cue-timed
            lines that seek the player when clicked, and `MediaTranscript` stores one
            plain-text body per locale with no timings (ADR §10) — there are no cues
            to click. Rendering the panel would present a transcript that looks
            seekable and is not. This is the same text, honestly static.
          */}
          <p className="whitespace-pre-line text-body text-text-secondary">{view.transcript}</p>
        </section>
      ) : null}

      {view.instructor ? <InstructorCard instructor={view.instructor} /> : null}

      <RelatedVideos items={view.related} />
    </article>
  );
}
