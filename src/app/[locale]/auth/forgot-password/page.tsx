export const dynamic = "force-dynamic";
export const metadata = { title: "Reset Password · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AuthExperienceShell }     from "@/components/auth-experience";
import { ForgotPasswordClient }    from "@/components/auth/ForgotPasswordClient";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("authExperience.forgot");

  return (
    <AuthExperienceShell title={t("title")} subtitle={t("subtitle")}>
      <ForgotPasswordClient locale={locale} />
    </AuthExperienceShell>
  );
}
