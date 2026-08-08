import { setRequestLocale, getTranslations } from "next-intl/server";
import { ComplianceCenterClient } from "@/components/compliance/ComplianceCenterClient";
import { PageShell }              from "@/components/PageShell";

export const metadata = { title: "Evidence Packs · Compliance · Hermes OS" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("complianceCenter");
  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
          <h1 className="type-page-title">{t("nav.evidencePacks")}</h1>
        </div>
        <ComplianceCenterClient view="evidence-packs" />
      </div>
    </PageShell>
  );
}
