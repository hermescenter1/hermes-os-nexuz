import { setRequestLocale }          from "next-intl/server";
import { ComplianceDashboardClient }  from "@/components/compliance/ComplianceDashboardClient";
import { PageShell }                  from "@/components/PageShell";

export const metadata = { title: "Compliance Dashboard · Hermes OS" };

export default async function CompliancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">HERMES OS · COMPLIANCE · PHASE 61</p>
          <h1 className="type-page-title">Compliance Dashboard</h1>
          <p className="mt-2 type-secondary">GDPR governance · Privacy requests · Legal documents · Consent logs</p>
        </div>
        <ComplianceDashboardClient view="overview" />
      </div>
    </PageShell>
  );
}
