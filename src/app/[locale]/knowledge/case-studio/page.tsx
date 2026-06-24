export const dynamic = "force-dynamic";
export const metadata = { title: "Case Studio · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { CaseStudioClient } from "@/components/knowledge/CaseStudioClient";
import { RequireCapability } from "@/components/auth/RequireCapability";

export default async function CaseStudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("caseStudio");

  return (
    <RequireCapability capability="authoring">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <CaseStudioClient />
      </PageShell>
    </RequireCapability>
  );
}
