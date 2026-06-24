import { setRequestLocale }    from "next-intl/server";
import { CoursesBrowserClient } from "@/components/academy/CoursesBrowserClient";

export default async function AcademyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CoursesBrowserClient />;
}
