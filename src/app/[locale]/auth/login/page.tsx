export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  // 89C: localized tab title (was a static English literal on every locale);
  // the locale layout's title template appends the site suffix.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("loginTitle"), robots: { index: false, follow: false } };
}

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }                from "@/i18n/navigation";
import { AuthExperienceShell } from "@/components/auth-experience";
import { NewLoginClient }      from "@/components/auth/NewLoginClient";

export default async function AuthLoginPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale }    = await params;
  const { from }      = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  return (
    <AuthExperienceShell
      // PHASE 104-D2 — the canonical Login is the ONLY auth route permitted to
      // render the Hermes Horizon atmosphere. Every other route that shares
      // this shell keeps the default "standard" mode; the opt-in is explicit
      // here so it cannot propagate by accident.
      visualMode="horizon"
      title={t("loginTitle")}
      subtitle={t("loginLede")}
      footer={
        <span>
          {t("dontHaveAccount")}{" "}
          <Link href="/auth/register" className="text-brand-primary hover:underline">
            {t("requestAccessLinkLabel")}
          </Link>
        </span>
      }
    >
      <NewLoginClient locale={locale} from={from} />
    </AuthExperienceShell>
  );
}
