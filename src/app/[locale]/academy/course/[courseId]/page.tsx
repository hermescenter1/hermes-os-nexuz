import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { CourseDetailClient } from "@/components/academy/CourseDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { courseSchema }       from "@/lib/seo/schemas";
import { buildMetadata }      from "@/lib/seo/metadata";
import { BASE_URL }           from "@/lib/seo/config";
import { getPublicCourse }    from "@/lib/academy/public-course";

/**
 * SPRINT 1C-A — the public course page now answers from evidence.
 *
 * WHAT THIS ROUTE USED TO DO
 * --------------------------
 * It rendered unconditionally. `generateMetadata` tried to read the row and, on
 * ANY failure — unknown id, unpublished row, no database at all — fell through
 * to a generic `buildMetadata(...)` carrying `meta.pages.academyCourse
 * .fallbackTitle`. The component then emitted `Course` and `BreadcrumbList`
 * JSON-LD named from that same fallback string. The measured result in
 * production was an indexable, self-canonical, three-way-hreflang page with a
 * `Course` entity for `sprint1b-synthetic-invalid-id` — and for every other
 * string anyone cares to request.
 *
 * WHAT IT DOES NOW
 * ----------------
 * `@/lib/academy/public-course` answers `found | not-found | unavailable`, and
 * this route maps those three onto three genuinely different HTTP behaviours:
 *
 *   found        real title and description from the row, self canonical,
 *                the locale alternates `buildMetadata` normally emits, and a
 *                `Course` whose `name`/`description` are the SAME strings the
 *                page renders. `BreadcrumbList` names the real course.
 *
 *   not-found    `notFound()` — a real 404 through the framework's own path,
 *                answered identically for an unknown id, an unpublished course
 *                and a soft-deleted one so the URL is not an existence oracle.
 *                Metadata is `noindex, nofollow` with `alternates: {}`, which
 *                OVERWRITES the canonical and hreflang map this segment would
 *                otherwise inherit from `academy/layout.tsx` (Next resolves
 *                metadata across the whole segment chain, so omitting the key
 *                would silently keep the parent's `/{locale}/academy`
 *                canonical). No `Course`, no `BreadcrumbList`, no fallback copy.
 *
 *   unavailable  the store could not be consulted, so the course may well
 *                exist. A 404 here would de-index the real catalog on a bad
 *                deploy, and a fallback page would publish a fabricated entity.
 *                The route does neither: it serves 200 with `noindex,
 *                nofollow`, no canonical, no hreflang and NO structured data,
 *                and lets `CourseDetailClient` render its own honest empty
 *                state. That is the same fail-closed-for-indexing shape
 *                `/careers/[jobId]` already uses for an unresolvable posting —
 *                never a false 404, never a false indexable page.
 *
 * `getPublicCourse` is `react#cache`-wrapped, so the lookup `generateMetadata`
 * performs and the one this component performs are a single query per request.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const p = tMeta.raw("pages") as Record<string, Record<string, string>>;

  const result = await getPublicCourse(courseId);

  if (result.state !== "found") {
    // One shape for both refusals. `alternates: {}` is load-bearing: Next merges
    // metadata per key across the segment chain, so an absent `alternates` key
    // inherits the Academy layout's canonical and language map onto a page that
    // is either a 404 or an outage.
    return {
      title: p.academyCourse.fallbackTitle,
      robots: { index: false, follow: false },
      alternates: {},
    };
  }

  return buildMetadata({
    locale,
    path:        `/academy/course/${result.course.id}`,
    title:       p.academyCourse.titleTemplate.replace("{name}", result.course.title),
    description: result.course.description,
    keywords:    p.academyCourse.keywords,
    ogType:      "article",
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  setRequestLocale(locale);

  const result = await getPublicCourse(courseId);

  if (result.state === "not-found") notFound();

  if (result.state === "unavailable") {
    // Fail closed for indexing: the page renders, nothing is asserted about a
    // course that could not be read.
    return <CourseDetailClient courseId={courseId} />;
  }

  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const bc = tMeta.raw("breadcrumbs") as Record<string, string>;
  const { course } = result;
  const courseUrl = `${BASE_URL}/${locale}/academy/course/${course.id}`;

  return (
    <>
      <JsonLd
        data={[
          courseSchema({
            // Both strings come from the row this page renders — the generic
            // `fallbackTitle`/`descriptionFallback` pair is never published as
            // a course identity again.
            name:        course.title,
            description: course.description,
            url:         courseUrl,
          }),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: bc.home,    item: `${BASE_URL}/${locale}` },
              { "@type": "ListItem", position: 2, name: bc.academy, item: `${BASE_URL}/${locale}/academy` },
              { "@type": "ListItem", position: 3, name: course.title, item: courseUrl },
            ],
          },
        ]}
      />
      <CourseDetailClient courseId={course.id} />
    </>
  );
}
