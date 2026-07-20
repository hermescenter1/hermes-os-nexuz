export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  // 89C: localized tab title (was a static English literal on every locale);
  // the locale layout's title template appends the site suffix.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("forgotPasswordTitle"), robots: { index: false, follow: false } };
}

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
