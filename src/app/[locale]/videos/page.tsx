import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/PageIntro";
import { VideoGrid } from "@/components/media";

/**
 * DISCOVERY-2A — `/[locale]/videos`: the bare hub root.
 *
 * WHY THIS PAGE CARRIES NO CONTENT AND IS NOT INDEXED
 * ---------------------------------------------------
 * A media asset is addressed by `(organization, slug)`, so a library page has to
 * say WHOSE library it is showing. Without an organization there is nothing this
 * route can honestly render, and it never could: before DISCOVERY-2A this page
 * accepted `?org=` and, when it was absent, rendered a permanently empty grid —
 * while `src/app/sitemap.ts` advertised it at priority 0.8. A URL that always
 * answers "nothing here" is a soft 404, and advertising one teaches a crawler to
 * discount the whole sitemap.
 *
 * So this route now states the position instead of faking a library:
 *   - it still answers HTTP 200 (nothing that used to resolve now 404s);
 *   - it is `noindex, follow`, so a crawler that arrives moves on to the real
 *     organization libraries rather than indexing an empty shell;
 *   - it is removed from the sitemap.
 *
 * Turning this into a genuine hub means deciding whether the platform is willing
 * to publish a directory of organizations that have public media. That is a
 * tenant-visibility policy question, not an indexing bug, so it is deliberately
 * left to DISCOVERY-2B; `../data.ts` already refuses to distinguish "no such
 * organization" from "nothing published here", and nothing in this phase weakens
 * that.
 *
 * The real, indexable surfaces are:
 *   /{locale}/videos/{org}          one organization's library
 *   /{locale}/videos/{org}/{slug}   one watch page
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mediaHub" });
  return {
    title: t("title"),
    description: t("description"),
    // `follow` stays true: the page has no content of its own, but a crawler
    // that lands here should still be free to walk onward.
    robots: { index: false, follow: true },
  };
}

export default async function VideoHubRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  return (
    <>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("subtitle")} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <section aria-label={t("a11y.libraryRegion")}>
          {/* The existing empty state, with its existing copy. No organization
              was selected, so there is genuinely nothing to list — and no
              organization is named here, which is what keeps this route from
              becoming a tenant directory by accident. */}
          <VideoGrid items={[]} emptyReason="LIBRARY_EMPTY" label={t("a11y.libraryRegion")} />
        </section>
      </div>
    </>
  );
}
