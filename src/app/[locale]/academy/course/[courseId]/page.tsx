import { setRequestLocale }  from "next-intl/server";
import { CourseDetailClient } from "@/components/academy/CourseDetailClient";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  setRequestLocale(locale);
  return <CourseDetailClient courseId={courseId} />;
}
