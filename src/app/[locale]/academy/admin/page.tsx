import { setRequestLocale }  from "next-intl/server";
import { redirect }          from "next/navigation";
import { AcademyAdminClient } from "@/components/academy/AcademyAdminClient";
import { getCurrentUser }    from "@/lib/auth/session";

export const metadata = { title: "Academy Admin · Hermes OS" };

export default async function AcademyAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    redirect(`/${locale}/auth/login`);
  }

  return <AcademyAdminClient />;
}
