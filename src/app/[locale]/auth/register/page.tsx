export const dynamic = "force-dynamic";
export const metadata = { title: "Request Access · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }                from "@/i18n/navigation";
import { AuthExperienceShell } from "@/components/auth-experience";
import { RegisterClient }      from "@/components/auth/RegisterClient";

export default async function AuthRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  return (
    <AuthExperienceShell
      title={t("requestAccessTitle")}
      subtitle={t("requestAccessLede")}
      footer={
        <span>
          {t("alreadyHaveAccount")}{" "}
          <Link href="/auth/login" className="text-brand-primary hover:underline">
            {t("login")}
          </Link>
        </span>
      }
    >
      <RegisterClient locale={locale} />
    </AuthExperienceShell>
  );
}
