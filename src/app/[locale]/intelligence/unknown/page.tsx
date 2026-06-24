export const dynamic = "force-dynamic";
export const metadata = { title: "Unknown Analysis Center · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { UnknownCenterClient } from "@/components/intelligence/UnknownCenterClient";
import { RequireCapability } from "@/components/auth/RequireCapability";

export default async function UnknownCenterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("unknownCenter");

  return (
    <RequireCapability capability="authoring">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <UnknownCenterClient />
      </PageShell>
    </RequireCapability>
  );
}
