import { setRequestLocale, getTranslations } from "next-intl/server";
import { CourseDetailClient } from "@/components/academy/CourseDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { courseSchema }       from "@/lib/seo/schemas";
import { buildMetadata }      from "@/lib/seo/metadata";
import { BASE_URL }           from "@/lib/seo/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const p = tMeta.raw("pages") as Record<string, Record<string, string>>;

  // Try to fetch course title from DB; fall back to generic metadata if unavailable
  try {
    const { getPrisma } = await import("@/lib/db/prisma");
    const prisma = await getPrisma();
    if (prisma) {
      const course = await (prisma as unknown as {
        academyCourse: { findUnique: (a: unknown) => Promise<{ title: string; description: string | null } | null> }
      }).academyCourse.findUnique({
        where: { id: courseId },
        select: { title: true, description: true },
      });
      if (course) {
        return buildMetadata({
          locale,
          path:        `/academy/course/${courseId}`,
          title:       p.academyCourse.titleTemplate.replace("{name}", course.title),
          description: course.description ?? p.academyCourse.descriptionFallback,
          keywords:    p.academyCourse.keywords,
          ogType:      "article",
        });
      }
    }
  } catch {
    // DB unavailable — use generic metadata
  }

  return buildMetadata({
    locale,
    path:        `/academy/course/${courseId}`,
    title:       p.academyCourse.fallbackTitle,
    description: p.academyCourse.descriptionFallback,
    keywords:    p.academyCourse.keywords,
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  setRequestLocale(locale);
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
