export const dynamic = "force-dynamic";
export const metadata = { title: "Set New Password · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AuthExperienceShell }   from "@/components/auth-experience";
import { ResetPasswordClient }   from "@/components/auth/ResetPasswordClient";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token }  = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("authExperience.reset");

  return (
    <AuthExperienceShell title={t("title")} subtitle={t("subtitle")}>
      <ResetPasswordClient locale={locale} token={token ?? ""} />
    </AuthExperienceShell>
  );
}
