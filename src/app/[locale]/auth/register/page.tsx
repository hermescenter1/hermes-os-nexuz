export const dynamic = "force-dynamic";
export const metadata = { title: "Request Access · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AuthShell }        from "@/components/auth/AuthShell";
import { RegisterClient }   from "@/components/auth/RegisterClient";
import Link                 from "next/link";

export default async function AuthRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("auth");
  const b = await getTranslations("brand");

  return (
    <AuthShell
      title={t("requestAccessTitle")}
      subtitle={t("requestAccessLede")}
      tagline={b("tagline")}
      trustLine={t("trustLine")}
      footer={
        <span>
          {t("alreadyHaveAccount")}{" "}
          <Link href={`/${locale}/auth/login`} style={{ color: "var(--signal)" }} className="hover:underline">
            {t("login")}
          </Link>
        </span>
      }
    >
      <RegisterClient locale={locale} />
    </AuthShell>
  );
}
