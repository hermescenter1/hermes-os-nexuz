import { setRequestLocale, getTranslations } from "next-intl/server";
import { ComplianceDashboardClient }  from "@/components/compliance/ComplianceDashboardClient";
import { PageShell }                  from "@/components/PageShell";

export const metadata = { title: "Consent Logs · Compliance · Hermes OS" };

export default async function ConsentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminGovernance.compliance");
  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">{t("consentsEyebrow")}</p>
          <h1 className="type-page-title">{t("consentsTitle")}</h1>
        </div>
        <ComplianceDashboardClient view="consents" />
      </div>
    </PageShell>
  );
}
