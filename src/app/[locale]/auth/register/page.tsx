export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  // 89C: localized tab title (was a static English literal on every locale);
  // the locale layout's title template appends the site suffix.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("requestAccessTitle"), robots: { index: false, follow: false } };
}

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
