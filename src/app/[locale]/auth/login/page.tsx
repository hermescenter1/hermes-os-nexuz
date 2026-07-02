export const dynamic = "force-dynamic";
export const metadata = { title: "Sign In · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AuthShell }        from "@/components/auth/AuthShell";
import { NewLoginClient }   from "@/components/auth/NewLoginClient";
import Link                 from "next/link";

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
  const b = await getTranslations("brand");

  return (
    <AuthShell
      title={t("loginTitle")}
      subtitle={b("tagline")}
      tagline={b("tagline")}
      trustLine={t("trustLine")}
      footer={
        <span>
          {t("dontHaveAccount")}{" "}
          <Link href={`/${locale}/auth/register`} style={{ color: "var(--signal)" }} className="hover:underline">
            {t("requestAccessLinkLabel")}
          </Link>
        </span>
      }
    >
      <NewLoginClient locale={locale} from={from} />
    </AuthShell>
  );
}
