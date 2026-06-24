import { setRequestLocale }    from "next-intl/server";
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
          title:       `${course.title} — Hermes Academy`,
          description: course.description ?? "Industrial automation course on the Hermes Academy platform.",
          keywords:    "industrial training, automation course, PLC, SCADA, Hermes Academy",
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
    title:       "Industrial Course — Hermes Academy",
    description: "Professional industrial automation training course on the Hermes Academy platform.",
    keywords:    "industrial training, automation course, Hermes Academy",
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={[
          courseSchema({
            name:        "Industrial Automation Course",
            description: "Professional industrial automation training covering PLC, SCADA, HMI, and AI-driven operations on the Hermes Academy platform.",
            url:         `${BASE_URL}/${locale}/academy/course/${courseId}`,
          }),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home",    item: `${BASE_URL}/${locale}` },
              { "@type": "ListItem", position: 2, name: "Academy", item: `${BASE_URL}/${locale}/academy` },
              { "@type": "ListItem", position: 3, name: "Course",  item: `${BASE_URL}/${locale}/academy/course/${courseId}` },
            ],
          },
        ]}
      />
      <CourseDetailClient courseId={courseId} />
    </>
  );
}
