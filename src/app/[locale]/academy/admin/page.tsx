import { setRequestLocale }  from "next-intl/server";
import { AcademyAdminClient } from "@/components/academy/AcademyAdminClient";

export const metadata = { title: "Academy Admin · Hermes OS" };

export default async function AcademyAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AcademyAdminClient />;
}
