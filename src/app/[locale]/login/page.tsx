export const dynamic = "force-dynamic";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { LoginClient } from "@/components/auth/LoginClient";
import { isAuthConfigured } from "@/lib/auth/config";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  if (!isAuthConfigured()) {
    return (
      <PageShell>
        <PageIntro
          eyebrow="Hermes OS"
          title={t("setupRequiredTitle")}
          lede={t("setupRequired")}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageIntro eyebrow="Hermes OS" title={t("loginTitle")} lede={t("loginLede")} />
      <LoginClient />
    </PageShell>
  );
}
