export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  // 89C: localized tab title (was a static English literal on every locale);
  // the locale layout's title template appends the site suffix.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("resetPasswordTitle"), robots: { index: false, follow: false } };
}

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
