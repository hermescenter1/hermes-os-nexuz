import { notFound }            from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { CourseDetailClient } from "@/components/academy/CourseDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { courseSchema }       from "@/lib/seo/schemas";
import { buildMetadata }      from "@/lib/seo/metadata";
import { BASE_URL }           from "@/lib/seo/config";
import { resolveAcademyCourseForViewer } from "@/lib/academy/page-access";

/**
 * PUBLIC-EXPOSURE FIX — this route is an unauthenticated URL that renders
 * TENANT-OWNED content. The page had no `isPublished`, no `deletedAt` and no
 * organization predicate, and `generateMetadata` emitted an indexable canonical
 * document carrying the real title and description of ANY course id — including
 * another tenant's draft. `AcademyCourse` has no public-visibility column, so
 * the gate is membership-based, not publication-based; the reasoning and the
 * conditions for ever making a course truly public live in
 * `@/lib/academy/page-access`.
 */

// The gate reads cookies, so the page can never be statically rendered — say so
// explicitly rather than relying on the implicit dynamic bail-out.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const p = tMeta.raw("pages") as Record<string, Record<string, string>>;

  const course = await resolveAcademyCourseForViewer(courseId);

  // Not visible to this viewer (anonymous, foreign tenant, unpublished or
  // soft-deleted): emit the generic localized title only. Never the course
  // title, never the course description, never an indexable canonical.
  if (!course) {
    return {
      title:  p.academyCourse.fallbackTitle,
      robots: { index: false, follow: false },
    };
  }

  // Visible — but still member-only content, so it stays out of every index.
  return buildMetadata({
    locale,
    path:        `/academy/course/${courseId}`,
    title:       p.academyCourse.titleTemplate.replace("{name}", course.title),
    description: course.description || p.academyCourse.descriptionFallback,
    keywords:    p.academyCourse.keywords,
    ogType:      "article",
    noIndex:     true,
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  setRequestLocale(locale);

  // Same three predicates as GET /api/academy/courses/[id]; 404 (not 403) so a
  // foreign or unpublished course id is not an existence oracle.
  const course = await resolveAcademyCourseForViewer(courseId);
  if (!course) notFound();

  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const bc = tMeta.raw("breadcrumbs") as Record<string, string>;
  const pMeta = tMeta.raw("pages") as Record<string, Record<string, string>>;

  return (
    <>
      <JsonLd
        data={[
          courseSchema({
            name:        pMeta.academyCourse.fallbackTitle,
            description: pMeta.academyCourse.descriptionFallback,
            url:         `${BASE_URL}/${locale}/academy/course/${courseId}`,
          }),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: bc.home,    item: `${BASE_URL}/${locale}` },
              { "@type": "ListItem", position: 2, name: bc.academy, item: `${BASE_URL}/${locale}/academy` },
              { "@type": "ListItem", position: 3, name: pMeta.academyCourse.fallbackTitle, item: `${BASE_URL}/${locale}/academy/course/${courseId}` },
            ],
          },
        ]}
      />
      <CourseDetailClient courseId={courseId} />
    </>
  );
}
