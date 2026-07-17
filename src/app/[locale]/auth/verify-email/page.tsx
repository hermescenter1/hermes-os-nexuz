export const dynamic = "force-dynamic";
export const metadata = { title: "Verify Email · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AuthExperienceShell } from "@/components/auth-experience";
import { VerifyEmailClient }   from "@/components/auth/VerifyEmailClient";

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token }  = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("authExperience.verify");

  return (
    <AuthExperienceShell title={t("title")} subtitle={t("subtitle")} capabilityPanel={false}>
      <VerifyEmailClient locale={locale} token={token ?? ""} />
    </AuthExperienceShell>
  );
}
