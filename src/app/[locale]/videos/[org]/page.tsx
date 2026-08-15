import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/PageIntro";
import { MediaErrorState, VideoGrid } from "@/components/media";
import { buildMetadata } from "@/lib/seo/metadata";
import { mediaLibraryPath } from "@/lib/media/seo";
import { VideoLibraryFilters } from "../VideoLibraryFilters";
import {
  VIDEO_HUB_CATEGORY_PARAM,
  VIDEO_HUB_LEVEL_PARAM,
  VIDEO_HUB_PAGE_PARAM,
} from "@/lib/media/video-library-params";
import {
  loadVideoLibrary,
  readPageParam,
  readParam,
  readSlugParam,
  resolveVideoHubScope,
} from "../data";

/**
 * DISCOVERY-2A — `/[locale]/videos/[org]`: one organization's PUBLIC library.
 *
 * This is the Phase 102 library page, unchanged in behaviour, with the
 * organization selector moved from `?org=` into the path. `MediaAsset` is unique
 * on `(organizationId, slug)`, so the organization is half of an asset's
 * identity and belongs in its address; see the header of `../data.ts` for the
 * full rationale and for why a canonical URL may not depend on a query string.
 *
 * PUBLISHED-ONLY, IN THE REPOSITORY. Nothing on this page passes an `audience` to
 * `listMediaAssets`, so the `PUBLISHED + PUBLIC + READY` gate is applied by the
 * default in `src/lib/media/db.ts`, inside the Prisma `where` clause. That is the
 * deliberate opposite of the Journal, where `getArticleDetailBySlug` has no status
 * filter and each caller repeats the check.
 *
 * THREE OUTCOMES, THREE DIFFERENT ANSWERS. A storage failure is an error state, an
 * unfiltered empty library is `LIBRARY_EMPTY`, and a filtered empty library is
 * `NO_MATCHES`. Collapsing them would tell most of the audience the wrong thing:
 * "no videos found" is a lie when the request never reached the database, and
 * "nothing published yet" sends someone hunting for content that a filter is
 * hiding.
 *
 * NO TENANT ORACLE. A malformed or unknown `{org}` segment resolves to `null`
 * and is answered EXACTLY as a real organization with nothing published: the same
 * empty library, never a 404 and never an error. That is the same invariant the
 * `?org=` form carried, moved verbatim to the path.
 *
 * RTL/LTR is inherited: `dir` is set once on `<html>` by the locale layout and
 * every component here uses logical properties, so Persian mirrors without a
 * single direction-conditional in this file.
 */

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; org: string }>;
}) {
  const { locale, org } = await params;
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  // A segment that cannot mint a path is not describable. It is still answered
  // with the ordinary empty library below — this only refuses to advertise it.
  const path = mediaLibraryPath(org);
  if (path === null) {
    return { title: t("title"), robots: { index: false, follow: false } };
  }

  return buildMetadata({
    locale,
    path,
    title: t("title"),
    description: t("description"),
  });
}

export default async function OrganizationVideoLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; org: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, org } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  const categorySlug = readSlugParam(sp[VIDEO_HUB_CATEGORY_PARAM]);
  const level = readParam(sp[VIDEO_HUB_LEVEL_PARAM]);
  const page = readPageParam(sp[VIDEO_HUB_PAGE_PARAM]);

  // A malformed or unknown organization segment is answered exactly as an
  // organization with nothing published: the same empty library. Distinguishing
  // them would turn this page into a tenant-enumeration oracle.
  const scope = await resolveVideoHubScope(org);
  const library = scope
    ? await loadVideoLibrary({ scope, routeLocale: locale, page, categorySlug, level })
    : null;

  const intro = (
    <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("subtitle")} />
  );

  // `scope && !library` is the only genuine failure: media storage was reachable
  // enough to resolve the organization but the library query did not complete.
  if (scope && !library) {
    return (
      <>
        {intro}
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <MediaErrorState code="STORAGE_UNAVAILABLE" />
        </div>
      </>
    );
  }

  const items = library?.items ?? [];
  const categories = library?.categories ?? [];
  const filtered = library?.filtered ?? false;

  return (
    <>
      {intro}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <VideoLibraryFilters categories={categories} value={categorySlug} />

        {/* One live region for the result count, so a screen-reader user hears the
            outcome of a category change without moving focus. */}
        <p role="status" aria-live="polite" className="text-body-compact text-text-muted">
          {t("library.resultCount", { count: library?.total ?? 0 })}
        </p>

        <section aria-label={t("a11y.libraryRegion")}>
          <VideoGrid
            items={items}
            emptyReason={filtered ? "NO_MATCHES" : "LIBRARY_EMPTY"}
            label={t("a11y.libraryRegion")}
          />
        </section>
      </div>
    </>
  );
}
